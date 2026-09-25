// Mirror of etl/hcai_etl/core.py:normalize_column + each dataset's COLUMN_ALIASES,
// so a raw HCAI extract uploaded in the browser maps to the same field codes the ETL uses.

const ALIASES: Record<string, string> = {
  // Annual Utilization (older extracts)
  CENS_TRACT: "CENSUS_KEY",
  OSHPD_PROJ_NO_01: "HCAI_PROJ_NO_01",
  OSHPD_PROJ_NO_02: "HCAI_PROJ_NO_02",
  OSHPD_PROJ_NO_03: "HCAI_PROJ_NO_03",
  OSHPD_PROJ_NO_04: "HCAI_PROJ_NO_04",
  OSHPD_PROJ_NO_05: "HCAI_PROJ_NO_05",
  // Annual Financial Data
  NAT_0BIRTHS: "NAT_BIRTHS",
  "NAT_ BIRTHS": "NAT_BIRTHS",
  ACCTS_0REC: "ACCTS_REC",
  "ACCTS_ REC": "ACCTS_REC",
  "MCAR_PRO#": "MCAR_PRO_NO",
  "MCAL_PRO#": "MCAL_PRO_NO",
  "REG_MCAL#": "REG_MCAL_NO",
  // Label-sheet spellings that differ from the data files.
  DAY_PIPS: "DAYS_PIPS",
  NURS_EMP: "NURS_FTE",
}

export function normalizeColumn(name: string) {
  const raw = String(name).trim().toUpperCase()
  if (ALIASES[raw]) return ALIASES[raw]
  const canon = raw
    .replace(/#/g, "_NO")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
  return ALIASES[canon] ?? canon
}

export type Extract = {
  fileName: string
  headers: string[]
  rows: (string | number | null)[][]
}

/** Parse pasted or uploaded CSV/TSV text (handles quoted fields). */
export function parseDelimited(text: string, fileName = "Pasted data"): Extract {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""))
  const [headers = [], ...body] = nonEmpty
  return {
    fileName,
    headers: headers.map((h) => h.trim()),
    rows: body.map((r) => r.map(coerce)),
  }
}

function coerce(v: string): string | number | null {
  const t = v.trim()
  if (t === "") return null
  const n = Number(t.replace(/[$,]/g, ""))
  return Number.isFinite(n) && /^[-$\d.,\s]+$/.test(t) ? n : t
}

/**
 * Keep only rows that are actual facility records. HCAI's utilization workbook
 * puts four metadata rows (description, Page, Column, Line) under the header.
 */
export function dataRowsOnly(extract: Extract): Extract {
  const facCol = extract.headers.findIndex((h) => normalizeColumn(h) === "FAC_NO")
  if (facCol < 0) return extract
  return { ...extract, rows: extract.rows.filter((r) => /^\d{9}(\.0)?$/.test(String(r[facCol] ?? "").trim())) }
}

export async function readExtractFile(file: File): Promise<Extract> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser")
    // HCAI's utilization workbook opens on a "Tips" sheet; its data is on "Page 1-6".
    const data = await readSheet(file, "Page 1-6").catch(() => readSheet(file))
    const [headers = [], ...body] = data
    return dataRowsOnly({
      fileName: file.name,
      headers: headers.map((h) => (h == null ? "" : String(h).trim())),
      rows: body.map((r) =>
        r.map((v) => (v == null ? null : typeof v === "number" ? v : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))
      ),
    })
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error("Older .xls files aren’t supported. Open it in Excel and save as .xlsx or .csv.")
  }
  return dataRowsOnly(parseDelimited(await file.text(), file.name))
}
