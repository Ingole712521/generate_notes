"use client";

import { useCallback, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;

type FileUploaderProps = {
  disabled?: boolean;
  onFileSelected: (file: File) => void;
  selectedFileName?: string | null;
};

export default function FileUploader({
  disabled = false,
  onFileSelected,
  selectedFileName,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndEmit = useCallback(
    (file: File | undefined | null) => {
      setLocalError(null);
      if (!file) return;

      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setLocalError("Only PDF files are supported.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError("File exceeds the 10MB limit. Please upload a smaller PDF.");
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (disabled) return;
    validateAndEmit(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        className={[
          "relative overflow-hidden rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#f7f4ef]",
          disabled
            ? "cursor-not-allowed border-ink-200 bg-ink-50/60 opacity-70"
            : dragging
              ? "cursor-copy border-accent bg-accent/5 scale-[1.01]"
              : "cursor-pointer border-ink-300 bg-white/50 hover:border-ink-500 hover:bg-white/80",
        ].join(" ")}
      >
        <div
          className={[
            "pointer-events-none absolute inset-0 opacity-0 transition-opacity",
            dragging ? "opacity-100" : "",
          ].join(" ")}
          aria-hidden
        >
          <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent/40 animate-pulse-ring" />
        </div>

        <div className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-ink-900 text-ink-50 shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="h-7 w-7"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16V4m0 0 4 4m-4-4-4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"
              />
            </svg>
          </div>
          <div>
            <p className="font-display text-xl font-medium text-ink-900">
              {selectedFileName ? "Replace PDF" : "Drop your PDF here"}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              or click to browse · PDF only · max 10MB
            </p>
          </div>
          {selectedFileName && (
            <p className="mt-1 truncate rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-800">
              {selectedFileName}
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            validateAndEmit(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {localError && (
        <p className="mt-3 text-sm font-medium text-accent-deep" role="alert">
          {localError}
        </p>
      )}
    </div>
  );
}
