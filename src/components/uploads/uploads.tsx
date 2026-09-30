"use client"

import { Download, FileSpreadsheet, FileText, Trash2, TriangleAlert, Upload } from "lucide-react"
import { useActionState, useEffect, useRef, useState } from "react"

import { deleteUploadAction, uploadAction, type UploadState } from "@/app/uploads/actions"
import type { UploadSummary } from "@/lib/server/uploads"
import { KIND_LABELS, MAX_UPLOAD_BYTES } from "@/lib/uploads/sniff"
import { cn } from "@/lib/utils"

// The uploads page's form and list (V7.6.5d). Plain forms posting to server actions; the server checks each file's
// content and the database decides whose rows these are.

const primaryButton =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary-fill px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary-fill/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
const secondaryButton =
  "glass-subtle inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[14px] font-medium hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
const inputClass =
  "w-full rounded-xl border border-input bg-white/70 px-3 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive dark:bg-white/5"

function Message({ state }: { state: UploadState }) {
  return (
    <p
      role={state?.ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-xl px-3 py-2 text-[14px]",
        !state?.message && "sr-only",
        state?.ok ? "bg-favorable/10 text-favorable" : "bg-destructive/10 text-destructive",
      )}
    >
      {state?.message && !state.ok && <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {state?.message}
    </p>
  )
}

export function UploadForm() {
  const [serverState, action, pending] = useActionState(uploadAction, null)
  // Files over the limit are stopped here: past 4.5 MB the request never reaches the action to be refused politely.
  const [tooBig, setTooBig] = useState<UploadState>(null)
  const state = tooBig ?? serverState
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (serverState?.ok) form.current?.reset()
  }, [serverState])
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const file = (e.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0]
    if (file && file.size > MAX_UPLOAD_BYTES) {
      e.preventDefault()
      setTooBig({ ok: false, field: "file", message: `${file.name} is ${size(file.size)}. Files can be up to 4 MB.` })
    } else setTooBig(null)
  }
  const fileError = state?.field === "file" ? state.message : undefined
  const labelError = state?.field === "label" ? state.message : undefined
  return (
    <section aria-labelledby="upload-title" className="widget p-5">
      <h2 id="upload-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
        <Upload className="size-4 text-primary" aria-hidden />
        Upload a file
      </h2>
      <form ref={form} action={action} onSubmit={onSubmit} className="mt-3 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="upload-file" className="block text-[14px] font-medium">
            File
          </label>
          <input
            id="upload-file"
            name="file"
            type="file"
            required
            accept=".csv,.xlsx,.json,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/plain"
            aria-invalid={!!fileError}
            aria-describedby="upload-file-hint"
            className={cn(inputClass, "py-2 file:mr-3 file:rounded-full file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-[14px] file:font-medium file:text-primary")}
          />
          <p id="upload-file-hint" className="text-xs text-muted-foreground">
            CSV, Excel (.xlsx), JSON or plain text (.txt), up to 4 MB. Each file&apos;s contents are checked, not just its name.
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="upload-label" className="block text-[14px] font-medium">
            Label <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input id="upload-label" name="label" maxLength={200} aria-invalid={!!labelError} placeholder="e.g. FY2025 nurse staffing" className={cn(inputClass, "h-11")} />
        </div>
        <Message state={state} />
        <button type="submit" disabled={pending} className={cn(primaryButton, "w-full")}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </form>
    </section>
  )
}

const size = (n: number) => (n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })

export function UploadList({ uploads }: { uploads: UploadSummary[] }) {
  return (
    <section aria-labelledby="list-title" className="widget p-5">
      <h2 id="list-title" className="text-[17px] font-semibold tracking-tight">
        Your files <span className="font-normal text-muted-foreground">({uploads.length})</span>
      </h2>
      {uploads.length === 0 ? (
        <p className="mt-2 text-[15px] text-muted-foreground">Nothing uploaded yet. Files you upload appear here, and only you can see them.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {uploads.map((u) => (
            <UploadRow key={u.id} upload={u} />
          ))}
        </ul>
      )}
    </section>
  )
}

function UploadRow({ upload }: { upload: UploadSummary }) {
  const [state, action, pending] = useActionState(deleteUploadAction, null)
  const [confirming, setConfirming] = useState(false)
  const Icon = upload.contentType === "text/plain" || upload.contentType === "application/json" ? FileText : FileSpreadsheet
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium break-words">{upload.label ?? upload.fileName}</p>
          <p className="text-[13px] break-words text-muted-foreground">
            {upload.label && <>{upload.fileName} · </>}
            {KIND_LABELS[upload.contentType] ?? "File"} · {size(upload.sizeBytes)} · uploaded {date(upload.createdAt)}
          </p>
        </div>
        {!confirming && (
          <div className="flex items-center gap-1">
            <a href={`/uploads/${upload.id}/download`} className={cn(secondaryButton, "h-9 px-3")} aria-label={`Download ${upload.fileName}`}>
              <Download className="size-4" aria-hidden />
              <span className="max-sm:sr-only">Download</span>
            </a>
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`Delete ${upload.fileName}`}>
              <Trash2 className="size-4" aria-hidden />
              <span className="max-sm:sr-only">Delete</span>
            </button>
          </div>
        )}
      </div>
      {confirming && (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-destructive/6 p-3">
          <input type="hidden" name="id" value={upload.id} />
          <p className="flex-1 text-[14px]">Delete {upload.fileName}? This can&apos;t be undone.</p>
          <button type="button" onClick={() => setConfirming(false)} className={cn(secondaryButton, "h-9")}>
            Cancel
          </button>
          <button type="submit" disabled={pending} className="inline-flex h-9 items-center justify-center rounded-full bg-destructive/12 px-4 text-[14px] font-semibold text-destructive hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50">
            {pending ? "Deleting…" : "Delete"}
          </button>
        </form>
      )}
      {state && !state.ok && <Message state={state} />}
    </li>
  )
}
