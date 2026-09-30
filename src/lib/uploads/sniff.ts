// What an uploaded file really is (V7.6.5d), decided from its bytes. The browser's MIME type is never read, and the
// extension only says which kind the file claims to be; the content has to bear that out:
//   .xlsx  a ZIP holding an Excel workbook ([Content_Types].xml and xl/workbook.xml), with no macros
//   .json  UTF-8 text that parses as JSON
//   .csv   text, with balanced quotes and at least one row
//   .txt   text
// "Text" means no NUL or other binary control bytes. CSV and plain text may be in a legacy encoding (Excel's "CSV"
// on Windows is often Windows-1252); JSON must be UTF-8, as the standard requires.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export type UploadKind = "csv" | "xlsx" | "json" | "txt"

export const CONTENT_TYPES: Record<UploadKind, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json",
  txt: "text/plain",
}

export const KIND_LABELS: Record<string, string> = {
  "text/csv": "CSV",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/json": "JSON",
  "text/plain": "Text",
}

export type Sniffed = { ok: true; kind: UploadKind; contentType: string } | { ok: false; reason: string }

const ACCEPTED = "Upload a CSV, Excel (.xlsx), JSON or plain-text (.txt) file."

export function kindFromName(name: string): UploadKind | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase()
  return ext === "csv" || ext === "xlsx" || ext === "json" || ext === "txt" ? ext : null
}

export function sniff(name: string, bytes: Uint8Array): Sniffed {
  const kind = kindFromName(name)
  if (!kind) return { ok: false, reason: ACCEPTED }
  if (bytes.length === 0) return { ok: false, reason: "That file is empty." }
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "Files can be up to 4 MB." }
  const fail = (what: string) => ({ ok: false as const, reason: `That file isn't ${what}, whatever its name says. ${ACCEPTED}` })

  if (kind === "xlsx") {
    const names = zipEntryNames(bytes)
    if (!names || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml")) return fail("an Excel workbook")
    if ([...names].some((n) => /vbaProject\.bin$/i.test(n))) return { ok: false, reason: "Workbooks with macros can't be uploaded. Save it as a plain .xlsx first." }
    return { ok: true, kind, contentType: CONTENT_TYPES.xlsx }
  }

  if (binarySignature(bytes) || !isText(bytes)) return fail(kind === "json" ? "JSON" : kind === "csv" ? "a CSV" : "plain text")
  if (kind === "json") {
    let text: string
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      JSON.parse(text.replace(/^﻿/, ""))
    } catch {
      return fail("valid JSON")
    }
  }
  if (kind === "csv" && !csvParses(bytes)) return fail("a readable CSV")
  return { ok: true, kind, contentType: CONTENT_TYPES[kind] }
}

// Formats whose first bytes identify them, whatever follows: a text-looking header alone doesn't make them text.
const SIGNATURES: number[][] = [
  [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  [0x50, 0x4b, 0x03, 0x04], // ZIP (and .xlsx, .docx)
  [0xd0, 0xcf, 0x11, 0xe0], // old Office (.xls, .doc)
  [0x4d, 0x5a, 0x90, 0x00], // Windows executable
  [0x7f, 0x45, 0x4c, 0x46], // ELF executable
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46, 0x38], // GIF
  [0x1f, 0x8b], // gzip
  [0x52, 0x61, 0x72, 0x21], // RAR
  [0x37, 0x7a, 0xbc, 0xaf], // 7-Zip
  [0x7b, 0x5c, 0x72, 0x74, 0x66], // {\rtf
]
const binarySignature = (bytes: Uint8Array) => SIGNATURES.some((sig) => sig.every((b, i) => bytes[i] === b))

/** No NUL and no control bytes other than tab, line feed, vertical tab, form feed and carriage return. */
function isText(bytes: Uint8Array) {
  for (const b of bytes) if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0b && b !== 0x0c && b !== 0x0d) return false
  return true
}

/** RFC 4180 quoting: every quoted field is closed, and there's at least one non-empty row. */
function csvParses(bytes: Uint8Array) {
  let inQuotes = false
  let content = false
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (inQuotes) {
      if (b === 0x22) {
        if (bytes[i + 1] === 0x22) i++
        else inQuotes = false
      }
    } else if (b === 0x22) {
      inQuotes = true
      content = true
    } else if (b !== 0x0a && b !== 0x0d && b !== 0x20 && b !== 0x09) content = true
  }
  return !inQuotes && content
}

/** The entry names in a ZIP's central directory, or null if it isn't a well-formed ZIP. */
function zipEntryNames(bytes: Uint8Array): Set<string> | null {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // End of central directory: the last 22 bytes plus up to 64 KB of comment.
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const names = new Set<string>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return null
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    if (at + 46 + nameLen > bytes.length) return null
    names.add(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen)))
    at += 46 + nameLen + extraLen + commentLen
  }
  return names
}

/** The name to store: the last path segment, without control characters, at most 255 characters (extension kept). */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? ""
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim()
  if (name.length <= 255) return name
  const ext = /\.[A-Za-z0-9]{1,5}$/.exec(name)?.[0] ?? ""
  return name.slice(0, 255 - ext.length) + ext
}
