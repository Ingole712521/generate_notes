# PDF2Notes Pro

Upload a PDF → AI-condensed structured notes → download a two-column A4 PDF.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind CSS
- **pdf-parse** — extract text from uploaded PDFs
- **OpenAI API** — condense into Markdown notes
- **@react-pdf/renderer** — generate the downloadable PDF (0.5″ margins, two columns, Helvetica 10pt)

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=deepseek/deepseek-v4-flash
```

Uses the OpenAI-compatible SDK against **OpenRouter** by default.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API routes

| Route | Purpose |
|-------|---------|
| `POST /api/upload` | Accept PDF (max 10MB), return extracted text |
| `POST /api/condense` | Send text to OpenAI with the academic summarizer prompt |
| `POST /api/export-pdf` | Render Markdown to a PDF buffer (`Content-Disposition: inline`) |

## Notes

- Image-only / scanned PDFs without selectable text cannot be condensed (no OCR in this build).
- Very long documents are truncated before the AI call to stay within model limits.
# generate_notes
