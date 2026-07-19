"use client";

import { useCallback, useState } from "react";
import FileUploader from "@/components/FileUploader";
import PreviewPane from "@/components/PreviewPane";

type Step = "idle" | "extracting" | "condensing" | "ready" | "exporting";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ pageCount: number | null; truncated: boolean } | null>(
    null
  );

  const busy = step === "extracting" || step === "condensing" || step === "exporting";

  const resetNotes = () => {
    setMarkdown("");
    setMeta(null);
    setError(null);
    setStep("idle");
  };

  const onFileSelected = useCallback((next: File) => {
    setFile(next);
    setMarkdown("");
    setMeta(null);
    setError(null);
    setStep("idle");
  }, []);

  const generateNotes = async () => {
    if (!file || busy) return;
    setError(null);
    setMarkdown("");

    try {
      setStep("extracting");
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
      const condenseRes = await fetch("/api/condense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: uploadData.text,
          fileName: uploadData.fileName || file.name,
        }),
      });

      let condenseData: { error?: string; markdown?: string } = {};
      try {
        condenseData = await condenseRes.json();
      } catch {
        throw new Error(
          condenseRes.ok
            ? "Invalid response from /api/condense."
            : `Condensing failed (HTTP ${condenseRes.status}). Check the terminal for details.`
        );
      }

      if (!condenseRes.ok) {
        throw new Error(condenseData.error || `Failed to condense notes (HTTP ${condenseRes.status}).`);
      }

      if (!condenseData.markdown) {
        throw new Error("Condensing succeeded but returned no markdown.");
      }

      setMarkdown(condenseData.markdown as string);
      setStep("ready");
    } catch (err) {
      setStep("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const downloadPdf = async () => {
    if (!markdown || busy) return;
    setError(null);

    try {
      setStep("exporting");
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown,
          fileName: file?.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to generate PDF.");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] || "notes-pdf2notes.pdf";

      // Open inline in a new tab (browser PDF viewer) and trigger download
      window.open(url, "_blank", "noopener,noreferrer");

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
        ? "Building full UPSC notes…"
        : step === "exporting"
          ? "Generating PDF…"
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
            Turn any GS PDF into Mains-ready Q&A notes—answer frameworks, data tables, memory cues,
            and flowcharts—then download a clean revision PDF.
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
                onClick={downloadPdf}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent bg-white px-5 py-3 text-sm font-semibold text-accent-deep transition hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === "exporting" ? (
                  <>
                    <Spinner />
                    Generating PDF…
                  </>
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

            {meta && (
              <p className="text-sm text-ink-600">
                Extracted
                {meta.pageCount != null ? ` ${meta.pageCount} page${meta.pageCount === 1 ? "" : "s"}` : " text"}
                {meta.truncated ? " (long document truncated for AI)" : ""}.
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
                <span className="font-semibold text-ink-900">1. Upload</span> — GS notes, coaching
                PDF, or chapter (max 10MB).
              </li>
              <li>
                <span className="font-semibold text-ink-900">2. Generate</span> — AI builds Mains Q&A
                with frameworks, data, memory cues & flowcharts.
              </li>
              <li>
                <span className="font-semibold text-ink-900">3. Revise</span> — download a formatted
                PDF ready for last-minute revision.
              </li>
            </ol>
          </section>

          <section className="animate-fade-up" style={{ animationDelay: "140ms" }}>
            <PreviewPane
              markdown={markdown}
              isLoading={step === "extracting" || step === "condensing"}
            />
          </section>
        </div>

        <footer className="mt-16 border-t border-ink-200/70 pt-6 text-center text-xs text-ink-500">
          PDF2Notes Pro · Next.js · OpenAI · @react-pdf/renderer
        </footer>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
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
