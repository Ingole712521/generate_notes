"use client";

import { useCallback, useMemo, useState } from "react";
import FileUploader from "@/components/FileUploader";
import PreviewPane from "@/components/PreviewPane";
import { mergeNoteParts, splitSourceChunks } from "@/lib/source-chunks";
import { splitNotesForPdf } from "@/lib/split-notes";

type Step = "idle" | "extracting" | "condensing" | "ready" | "exporting";

type CondenseResponse = {
  error?: string;
  markdown?: string;
  incomplete?: boolean;
};

function triggerDownload(blob: Blob, filename: string, openTab: boolean) {
  const url = URL.createObjectURL(blob);
  if (openTab) window.open(url, "_blank", "noopener,noreferrer");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 90_000);
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

async function callCondense(payload: {
  text: string;
  fileName: string;
  mode?: "start" | "continue";
  priorMarkdown?: string;
}): Promise<CondenseResponse> {
  const res = await fetch("/api/condense", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data: CondenseResponse = {};
  try {
    data = await res.json();
  } catch {
    throw new Error(
      res.status === 504 || res.status === 408
        ? "Server step timed out. Keep this tab open — smaller steps will continue. Free models can take several minutes overall."
        : `Condensing failed (HTTP ${res.status}).`
    );
  }

  if (!res.ok) {
    throw new Error(data.error || `Failed to condense notes (HTTP ${res.status}).`);
  }
  if (!data.markdown) {
    throw new Error("Condensing returned no markdown.");
  }
  return data;
}

async function callCondenseWithRetry(
  payload: Parameters<typeof callCondense>[0],
  onProgress: (msg: string) => void,
  retries = 2
): Promise<CondenseResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) {
        onProgress(`Retrying step (attempt ${attempt + 1}) — free model is slow, please wait…`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
      return await callCondense(payload);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message.toLowerCase();
      const retryable =
        msg.includes("timeout") ||
        msg.includes("429") ||
        msg.includes("rate") ||
        msg.includes("empty ai") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.includes("flaky");
      if (!retryable || attempt === retries) break;
    }
  }
  throw lastError || new Error("Condensing failed.");
}

/** One chunk: start + continues. Overall job may take many minutes — that is OK. */
async function condenseChunk(
  text: string,
  fileName: string,
  onProgress: (msg: string) => void,
  maxContinues = 8
): Promise<string> {
  onProgress("Generating notes (this can take several minutes — keep tab open)…");
  let data = await callCondenseWithRetry(
    { text, fileName, mode: "start" },
    onProgress
  );
  let markdown = data.markdown!;
  let continues = 0;

  while (data.incomplete && continues < maxContinues) {
    continues += 1;
    onProgress(
      `Still working — continuation ${continues}/${maxContinues} (free model, please wait)…`
    );
    data = await callCondenseWithRetry(
      {
        text,
        fileName,
        mode: "continue",
        priorMarkdown: markdown,
      },
      onProgress
    );
    markdown = mergeNoteParts(markdown, data.markdown!);
  }

  return markdown;
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ pageCount: number | null; truncated: boolean } | null>(
    null
  );

  const busy = step === "extracting" || step === "condensing" || step === "exporting";
  const splitInfo = useMemo(
    () => (markdown ? splitNotesForPdf(markdown) : null),
    [markdown]
  );

  const resetNotes = () => {
    setMarkdown("");
    setMeta(null);
    setError(null);
    setProgress(null);
    setExportHint(null);
    setStep("idle");
  };

  const onFileSelected = useCallback((next: File) => {
    setFile(next);
    setMarkdown("");
    setMeta(null);
    setError(null);
    setProgress(null);
    setExportHint(null);
    setStep("idle");
  }, []);

  const generateNotes = async () => {
    if (!file || busy) return;
    setError(null);
    setMarkdown("");
    setExportHint(null);

    try {
      setStep("extracting");
      setProgress("Extracting PDF text…");
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok) {
        throw new Error(uploadData.error || "Failed to extract text from PDF.");
      }

      setMeta({
        pageCount: uploadData.pageCount ?? null,
        truncated: Boolean(uploadData.truncated),
      });

      setStep("condensing");
      const chunks = splitSourceChunks(uploadData.text as string);
      const fileName = (uploadData.fileName as string) || file.name;
      let combined = "";

      for (let i = 0; i < chunks.length; i += 1) {
        const label =
          chunks.length > 1
            ? `Section ${i + 1}/${chunks.length}`
            : "Generating notes";
        setProgress(
          `${label} — free model can take several minutes total. Keep this tab open.`
        );
        const part = await condenseChunk(chunks[i], fileName, setProgress);
        combined = i === 0 ? part : mergeNoteParts(combined, part);
        setMarkdown(combined);
      }

      setProgress(null);
      setStep("ready");
    } catch (err) {
      setStep(markdown ? "ready" : "idle");
      setProgress(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const downloadComplete = async () => {
    if (!markdown || busy) return;
    setError(null);
    setExportHint(null);

    try {
      setStep("exporting");
      setProgress("Building PDF…");
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown,
          fileName: file?.name,
          part: "all",
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate PDF.");
      }

      const files: { name: string; base64: string }[] = data.files || [];
      if (!files.length) throw new Error("No PDF files returned.");

      files.forEach((f, i) => {
        triggerDownload(base64ToBlob(f.base64), f.name, i === 0);
      });

      setExportHint(
        data.split
          ? "Downloaded 2 PDFs (Part 1 + Part 2). Together they are the complete notes."
          : "Downloaded 1 complete revision PDF."
      );
      setProgress(null);
      setStep("ready");
    } catch (err) {
      setStep("ready");
      setProgress(null);
      setError(err instanceof Error ? err.message : "PDF export failed.");
    }
  };

  const downloadPart = async (part: "1" | "2") => {
    if (!markdown || busy) return;
    setError(null);
    try {
      setStep("exporting");
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown, fileName: file?.name, part }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate PDF.");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      triggerDownload(
        blob,
        match?.[1] || `notes-part${part}-of-2.pdf`,
        true
      );
      setExportHint(`Downloaded Part ${part} of 2.`);
      setStep("ready");
    } catch (err) {
      setStep("ready");
      setError(err instanceof Error ? err.message : "PDF export failed.");
    }
  };

  const statusLabel =
    step === "extracting"
      ? "Extracting text…"
      : step === "condensing"
        ? progress || "Building UPSC notes…"
        : step === "exporting"
          ? progress || "Generating PDF…"
          : null;

  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,_rgba(196,92,38,0.09),_transparent_55%),radial-gradient(ellipse_at_80%_20%,_rgba(82,120,108,0.14),_transparent_45%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <header className="mb-10 animate-fade-up">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent-deep">
            UPSC Mains · Quick revision
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl md:text-6xl">
            PDF2Notes Pro
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-700 text-balance">
            Turn any GS PDF into Mains-ready Q&A notes. Free models are slow — generation can take
            several minutes; keep this tab open. Long notes download as Part 1 + Part 2.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <section className="space-y-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <FileUploader
              disabled={busy}
              onFileSelected={onFileSelected}
              selectedFileName={file?.name}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!file || busy}
                onClick={generateNotes}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === "extracting" || step === "condensing" ? (
                  <>
                    <Spinner />
                    {statusLabel}
                  </>
                ) : (
                  "Generate UPSC notes"
                )}
              </button>

              <button
                type="button"
                disabled={!markdown || busy}
                onClick={downloadComplete}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent bg-white px-5 py-3 text-sm font-semibold text-accent-deep transition hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === "exporting" ? (
                  <>
                    <Spinner />
                    Generating PDF…
                  </>
                ) : splitInfo?.needsSplit ? (
                  "Download complete (2 PDFs)"
                ) : (
                  "Download revision PDF"
                )}
              </button>

              {(markdown || error) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={resetNotes}
                  className="text-sm font-medium text-ink-600 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>

            {progress && busy && (
              <p className="text-sm text-ink-600" role="status">
                {progress}
              </p>
            )}

            {splitInfo?.needsSplit && markdown && (
              <div className="rounded-xl border border-ink-200 bg-white/70 px-4 py-3 text-sm text-ink-700">
                <p className="font-medium text-ink-900">
                  Long notes ({splitInfo.questionCount} questions) → 2 PDFs so nothing is cut.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => downloadPart("1")}
                    className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
                  >
                    Part 1 of 2 only
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => downloadPart("2")}
                    className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 disabled:opacity-50"
                  >
                    Part 2 of 2 only
                  </button>
                </div>
              </div>
            )}

            {exportHint && (
              <p className="text-sm font-medium text-ink-700" role="status">
                {exportHint}
              </p>
            )}

            {meta && (
              <p className="text-sm text-ink-600">
                Extracted
                {meta.pageCount != null
                  ? ` ${meta.pageCount} page${meta.pageCount === 1 ? "" : "s"}`
                  : " text"}
                {meta.truncated ? " (very long source capped)" : ""}.
              </p>
            )}

            {error && (
              <div
                className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent-deep"
                role="alert"
              >
                {error}
              </div>
            )}

            <ol className="space-y-2 rounded-2xl border border-ink-200/80 bg-white/50 p-5 text-sm text-ink-700">
              <li>
                <span className="font-semibold text-ink-900">1. Upload</span> — GS PDF (max 10MB).
              </li>
              <li>
                <span className="font-semibold text-ink-900">2. Generate</span> — runs in small
                steps so it can take its time (several minutes is normal on free models).
              </li>
              <li>
                <span className="font-semibold text-ink-900">3. Download</span> — 1 PDF or Part 1 +
                Part 2 for long notes.
              </li>
            </ol>
          </section>

          <section className="animate-fade-up" style={{ animationDelay: "140ms" }}>
            <PreviewPane
              markdown={markdown}
              isLoading={step === "extracting" || (step === "condensing" && !markdown)}
            />
          </section>
        </div>

        <footer className="mt-16 border-t border-ink-200/70 pt-6 text-center text-xs text-ink-500">
          PDF2Notes Pro · Next.js · OpenRouter · @react-pdf/renderer
        </footer>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}
