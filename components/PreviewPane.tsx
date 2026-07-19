"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type PreviewPaneProps = {
  markdown: string;
  title?: string;
  isLoading?: boolean;
};

export default function PreviewPane({
  markdown,
  title = "UPSC Mains Revision",
  isLoading = false,
}: PreviewPaneProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white/70 p-6 shadow-sm">
        <div className="mb-4 h-6 w-56 animate-pulse rounded bg-ink-100" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-3 rounded bg-gradient-to-r from-ink-100 via-ink-50 to-ink-100 bg-[length:200%_100%] animate-shimmer"
              style={{ width: `${70 + ((i * 17) % 30)}%` }}
            />
          ))}
        </div>
        <p className="mt-6 text-sm text-ink-500">
          Building UPSC Mains Q&A notes (frameworks, data, memory cues, flowcharts)…
        </p>
      </div>
    );
  }

  if (!markdown) {
    return (
      <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/40 px-6 py-16 text-center">
        <p className="font-display text-lg text-ink-700">Revision preview</p>
        <p className="mt-2 max-w-sm text-sm text-ink-500">
          Upload a PDF to generate Mains-style Q&A sheets with answer frameworks, data tables,
          memory cues, and flowcharts.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm animate-fade-up">
      <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50/80 px-5 py-3">
        <h2 className="font-display text-lg font-medium text-ink-900">{title}</h2>
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          UPSC Q&A preview
        </span>
      </div>
      <article className="prose-notes max-h-[min(70vh,720px)] overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-7 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="mb-3 mt-0 font-display text-2xl font-semibold text-ink-950 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mb-3 mt-7 rounded-lg bg-ink-100 px-3 py-2 font-display text-lg font-semibold text-ink-950">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mb-2 mt-5 border-b border-ink-200 pb-1 text-base font-semibold text-ink-800">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-ink-700">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="mb-3 text-[15px] leading-relaxed text-ink-800">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-ink-950">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="mb-4 list-disc space-y-1.5 pl-5 text-[15px] text-ink-800">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-[15px] text-ink-800">
                {children}
              </ol>
            ),
            li: ({ children }) => (
              <li className="leading-relaxed pl-0.5">{children}</li>
            ),
            table: ({ children }) => (
              <div className="my-4 w-full overflow-x-auto rounded-lg border border-ink-200">
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-ink-100">{children}</thead>,
            th: ({ children }) => (
              <th className="break-words border-b border-ink-200 px-2.5 py-2 align-top font-semibold text-ink-900">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="break-words border-b border-ink-100 px-2.5 py-2 align-top text-ink-800">
                {children}
              </td>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-r-lg border-l-4 border-accent bg-accent/5 px-4 py-3 text-ink-800">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-accent-deep">
                  Memory cue
                </p>
                <div className="text-[15px] leading-relaxed">{children}</div>
              </blockquote>
            ),
            pre: ({ children }) => (
              <div className="my-4 overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 p-4">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-600">
                  Flowchart / diagram
                </p>
                {children}
              </div>
            ),
            code: ({ children, className }) => {
              const isBlock = Boolean(className);
              if (isBlock) {
                return (
                  <code className="block whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-ink-900">
                    {children}
                  </code>
                );
              }
              return (
                <code className="break-all rounded bg-ink-100 px-1.5 py-0.5 text-[0.9em] text-ink-900">
                  {children}
                </code>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
