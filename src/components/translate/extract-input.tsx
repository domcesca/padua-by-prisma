"use client"

import { FileUp, X } from "lucide-react"
import { useRef, useState } from "react"

import { parseDelimited, readExtractFile, type Extract } from "@/lib/translate/columns"
import { cn } from "@/lib/utils"

/** Drop zone + paste box for a raw HCAI extract. Parsing happens in the browser; nothing is uploaded. */
export function ExtractInput({ onLoad, onCancel }: { onLoad: (extract: Extract) => void; onCancel: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      const extract = await readExtractFile(file)
      if (!extract.headers.length) throw new Error("That file doesn’t have a header row.")
      onLoad(extract)
    } catch (e) {
      setError((e as Error).message || "Couldn’t read that file.")
    }
  }

  function handlePaste() {
    const extract = parseDelimited(text)
    if (!extract.headers.length) {
      setError("Paste at least a header row of column names.")
      return
    }
    onLoad(extract)
  }

  return (
    <section className="fade-up rounded-2xl bg-card p-5 shadow-card" aria-labelledby="extract-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="extract-title" className="text-[15px] font-semibold tracking-tight">
            Translate a raw HCAI extract
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Works with the Annual Financial Data Selected File (.xlsx or .csv). Your file stays in your browser.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFile(e.dataTransfer.files[0])
          }}
          className={cn(
            "flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input p-6 text-center transition-colors",
            dragging && "border-primary bg-primary/5"
          )}
        >
          <FileUp className="size-5 text-tertiary-foreground" aria-hidden />
          <p className="text-[13px] text-muted-foreground">Drop a file here, or</p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Choose file
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.csv,.tsv,.txt"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="extract-paste" className="text-[13px] text-muted-foreground">
            Or paste rows copied from Excel (header row first)
          </label>
          <textarea
            id="extract-paste"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"FAC_NO\tFAC_NAME\tNET_PT_REV\tTOT_OP_EXP …"}
            className="min-h-24 flex-1 resize-none rounded-xl bg-muted px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={handlePaste}
            disabled={!text.trim()}
            className="self-end rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-medium hover:bg-accent disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Translate pasted data
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
