import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  extractTitle,
  parseMarkdownToBlocks,
  type CalloutVariant,
  type InlineSeg,
  type MdBlock,
} from "./markdown-to-blocks";
import { FlowchartDiagram } from "./flowchart";
import { sanitizePdfText } from "./sanitize-text";

const MARGIN = 36;
const HEADER_SPACE = 52;
/** Extra bottom space so the last lines never hide under the footer */
const FOOTER_SPACE = 40;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

const CALLOUT_COLORS: Record<
  CalloutVariant,
  { border: string; bg: string; label: string }
> = {
  memory: { border: "#c45c26", bg: "#fdf6f0", label: "#8f3f12" },
  framework: { border: "#2c403b", bg: "#f0f5f3", label: "#263632" },
  data: { border: "#3f6057", bg: "#eef6f3", label: "#344e47" },
  note: { border: "#6f9487", bg: "#f4f7f6", label: "#3f6057" },
  default: { border: "#9bb8ae", bg: "#f7f9f8", label: "#344e47" },
};

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    paddingTop: MARGIN + HEADER_SPACE,
    paddingBottom: MARGIN + FOOTER_SPACE,
    paddingHorizontal: MARGIN,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },
  header: {
    position: "absolute",
    top: MARGIN,
    left: MARGIN,
    right: MARGIN,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: "#2c403b",
  },
  headerEyebrow: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: "#c45c26",
    letterSpacing: 0.6,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12.5,
    color: "#263632",
    marginBottom: 2,
    lineHeight: 1.3,
  },
  headerMeta: {
    fontSize: 7.5,
    color: "#52786c",
    lineHeight: 1.3,
  },
  body: {
    width: CONTENT_WIDTH,
    flexDirection: "column",
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginBottom: 8,
    marginTop: 2,
    color: "#1a2421",
    lineHeight: 1.35,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 6,
    marginTop: 14,
    color: "#1a2421",
    lineHeight: 1.35,
    backgroundColor: "#e3ebe8",
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginBottom: 4,
    marginTop: 10,
    color: "#263632",
    lineHeight: 1.35,
    borderBottomWidth: 0.75,
    borderBottomColor: "#c5d6d0",
    paddingBottom: 2,
  },
  h4: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 3,
    marginTop: 8,
    color: "#344e47",
    lineHeight: 1.35,
  },
  p: {
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 6,
    textAlign: "left",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 3.5,
    alignItems: "flex-start",
  },
  bullet: {
    width: 14,
    fontSize: 10,
    lineHeight: 1.45,
  },
  listText: {
    width: CONTENT_WIDTH - 14,
    fontSize: 10,
    lineHeight: 1.45,
  },
  table: {
    marginVertical: 7,
    borderWidth: 0.75,
    borderColor: "#9bb8ae",
    width: CONTENT_WIDTH,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#c5d6d0",
  },
  tableHeaderRow: {
    backgroundColor: "#e3ebe8",
  },
  tableCell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
    lineHeight: 1.35,
  },
  tableHeaderCell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.35,
  },
  hr: {
    borderBottomWidth: 0.75,
    borderBottomColor: "#c5d6d0",
    marginVertical: 10,
  },
  callout: {
    marginVertical: 7,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderLeftWidth: 3,
    borderRadius: 2,
  },
  calloutTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  calloutLine: {
    fontSize: 9.5,
    lineHeight: 1.4,
    marginBottom: 2,
  },
  flowchart: {
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f4f7f6",
    borderWidth: 0.75,
    borderColor: "#9bb8ae",
  },
  flowchartLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#3f6057",
    marginBottom: 5,
    letterSpacing: 0.4,
  },
  flowchartLine: {
    fontFamily: "Courier",
    fontSize: 8,
    lineHeight: 1.35,
    color: "#1a2421",
    marginBottom: 1,
  },
  footer: {
    position: "absolute",
    bottom: 14,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#6f9487",
  },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  code: { fontFamily: "Courier", fontSize: 8.5 },
});

function Inline({ segs }: { segs: InlineSeg[] }) {
  return (
    <>
      {segs.map((seg, idx) => {
        const value = sanitizePdfText(seg.value);
        if (seg.type === "bold") {
          return (
            <Text key={idx} style={styles.bold}>
              {value}
            </Text>
          );
        }
        if (seg.type === "italic") {
          return (
            <Text key={idx} style={styles.italic}>
              {value}
            </Text>
          );
        }
        if (seg.type === "code") {
          return (
            <Text key={idx} style={styles.code}>
              {value}
            </Text>
          );
        }
        return <Text key={idx}>{value}</Text>;
      })}
    </>
  );
}

function headingLooksLikeQuestion(segs: InlineSeg[]): boolean {
  const text = segs.map((s) => s.value).join("");
  return /^(q\d*\.?|question)\b/i.test(text.trim()) || /\?\s*$/.test(text.trim());
}

function TableBlock({ block }: { block: Extract<MdBlock, { type: "table" }> }) {
  const colCount = Math.max(block.headers.length, 1);
  const cellWidth = CONTENT_WIDTH / colCount;

  return (
    <View style={styles.table} wrap>
      <View style={[styles.tableRow, styles.tableHeaderRow]} minPresenceAhead={14}>
        {block.headers.map((cell, ci) => (
          <Text key={ci} style={[styles.tableHeaderCell, { width: cellWidth }]}>
            <Inline segs={cell} />
          </Text>
        ))}
      </View>
      {block.rows.map((row, ri) => (
        <View key={ri} style={styles.tableRow} wrap>
          {Array.from({ length: colCount }).map((_, ci) => (
            <Text key={ci} style={[styles.tableCell, { width: cellWidth }]}>
              {row[ci] ? <Inline segs={row[ci]} /> : " "}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function CalloutBlock({
  block,
}: {
  block: Extract<MdBlock, { type: "callout" }>;
}) {
  const colors = CALLOUT_COLORS[block.variant] || CALLOUT_COLORS.default;
  return (
    <View
      style={[
        styles.callout,
        {
          borderLeftColor: colors.border,
          backgroundColor: colors.bg,
        },
      ]}
      wrap
      minPresenceAhead={24}
    >
      {block.title ? (
        <Text style={[styles.calloutTitle, { color: colors.label }]}>
          {block.title.toUpperCase()}
        </Text>
      ) : null}
      {block.content.map((line, i) => (
        <Text key={i} style={styles.calloutLine}>
          <Inline segs={line} />
        </Text>
      ))}
    </View>
  );
}

function BlockView({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "h1":
      return (
        <Text style={styles.h1} minPresenceAhead={22} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "h2":
      return (
        <Text
          style={
            headingLooksLikeQuestion(block.content)
              ? styles.h2
              : [styles.h2, { backgroundColor: "#f0f4f2" }]
          }
          minPresenceAhead={20}
          wrap
        >
          <Inline segs={block.content} />
        </Text>
      );
    case "h3":
      return (
        <Text style={styles.h3} minPresenceAhead={18} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "h4":
      return (
        <Text style={styles.h4} minPresenceAhead={16} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "p":
      return (
        <Text style={styles.p} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "ul":
      return (
        <View wrap>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem} wrap minPresenceAhead={12}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText} wrap>
                <Inline segs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "ol":
      return (
        <View wrap>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem} wrap minPresenceAhead={12}>
              <Text style={styles.bullet}>{i + 1}.</Text>
              <Text style={styles.listText} wrap>
                <Inline segs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return <TableBlock block={block} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "flowchart":
      return <FlowchartDiagram lines={block.lines} />;
    case "hr":
      return <View style={styles.hr} />;
    default:
      return null;
  }
}

export type NotesPdfProps = {
  markdown: string;
  sourceFileName?: string;
  partLabel?: string;
};

export function NotesPdfDocument({
  markdown,
  sourceFileName,
  partLabel,
}: NotesPdfProps) {
  const title = extractTitle(markdown);
  const bodyBlocks = parseMarkdownToBlocks(markdown);

  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const metaLine = [
    partLabel || null,
    sourceFileName ? `Source: ${sourceFileName}` : null,
    generatedAt,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document
      title={partLabel ? `${title} (${partLabel})` : title}
      author="PDF2Notes Pro"
      subject="UPSC Mains Q&A Quick Revision"
      creator="PDF2Notes Pro"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.headerEyebrow}>
            UPSC MAINS · Q&A QUICK REVISION
            {partLabel ? ` · ${partLabel.toUpperCase()}` : ""}
          </Text>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerMeta}>
            Answer frameworks · Data · Memory cues · Flowcharts · Tables
            {metaLine ? ` · ${metaLine}` : ""}
          </Text>
        </View>

        <View style={styles.body}>
          {bodyBlocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            PDF2Notes Pro
            {partLabel ? ` · ${partLabel}` : ""}
            {" · Helvetica 10pt"}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
