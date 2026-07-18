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
  type InlineSeg,
  type MdBlock,
} from "./markdown-to-blocks";

/** 0.5 inch at 72 dpi */
const MARGIN = 36;
const HEADER_SPACE = 50;
const FOOTER_SPACE = 28;
const CONTENT_WIDTH = 595.28 - MARGIN * 2;

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
    borderBottomWidth: 1.25,
    borderBottomColor: "#2c403b",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#263632",
    marginBottom: 3,
    lineHeight: 1.3,
  },
  headerMeta: {
    fontSize: 8,
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
    marginTop: 4,
    color: "#1a2421",
    lineHeight: 1.35,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    marginBottom: 5,
    marginTop: 12,
    color: "#263632",
    lineHeight: 1.35,
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    marginBottom: 4,
    marginTop: 9,
    color: "#344e47",
    lineHeight: 1.35,
  },
  p: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 7,
    textAlign: "left",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
  },
  bullet: {
    width: 14,
    fontSize: 10,
    lineHeight: 1.5,
  },
  listText: {
    width: CONTENT_WIDTH - 14,
    fontSize: 10,
    lineHeight: 1.5,
  },
  table: {
    marginVertical: 8,
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
    paddingHorizontal: 5,
    fontSize: 8.5,
    lineHeight: 1.35,
  },
  tableHeaderCell: {
    paddingVertical: 4,
    paddingHorizontal: 5,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.35,
  },
  hr: {
    borderBottomWidth: 0.75,
    borderBottomColor: "#c5d6d0",
    marginVertical: 10,
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
        if (seg.type === "bold") {
          return (
            <Text key={idx} style={styles.bold}>
              {seg.value}
            </Text>
          );
        }
        if (seg.type === "italic") {
          return (
            <Text key={idx} style={styles.italic}>
              {seg.value}
            </Text>
          );
        }
        if (seg.type === "code") {
          return (
            <Text key={idx} style={styles.code}>
              {seg.value}
            </Text>
          );
        }
        return <Text key={idx}>{seg.value}</Text>;
      })}
    </>
  );
}

function TableBlock({ block }: { block: Extract<MdBlock, { type: "table" }> }) {
  const colCount = Math.max(block.headers.length, 1);
  const cellWidth = CONTENT_WIDTH / colCount;

  return (
    <View style={styles.table} wrap>
      <View style={[styles.tableRow, styles.tableHeaderRow]} minPresenceAhead={12}>
        {block.headers.map((cell, ci) => (
          <Text key={ci} style={[styles.tableHeaderCell, { width: cellWidth }]}>
            <Inline segs={cell} />
          </Text>
        ))}
      </View>
      {block.rows.map((row, ri) => (
        <View key={ri} style={styles.tableRow} wrap={false} minPresenceAhead={10}>
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

function BlockView({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "h1":
      return (
        <Text style={styles.h1} minPresenceAhead={20} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "h2":
      return (
        <Text style={styles.h2} minPresenceAhead={18} wrap>
          <Inline segs={block.content} />
        </Text>
      );
    case "h3":
      return (
        <Text style={styles.h3} minPresenceAhead={16} wrap>
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
    case "hr":
      return <View style={styles.hr} />;
    default:
      return null;
  }
}

export type NotesPdfProps = {
  markdown: string;
  sourceFileName?: string;
};

/**
 * Full-width flowing layout: react-pdf auto-paginates so no section is clipped.
 * Completeness > forced 2-page / two-column packing.
 */
export function NotesPdfDocument({ markdown, sourceFileName }: NotesPdfProps) {
  const title = extractTitle(markdown);
  const blocks = parseMarkdownToBlocks(markdown);
  // Keep every block, including the leading H1 in the body for completeness
  const bodyBlocks = blocks;

  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const metaLine = [
    "PDF2Notes Pro · Full condensed notes (no sections omitted)",
    sourceFileName ? `Source: ${sourceFileName}` : null,
    generatedAt,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Document
      title={title}
      author="PDF2Notes Pro"
      subject="Condensed academic notes"
      creator="PDF2Notes Pro"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerMeta}>{metaLine}</Text>
        </View>

        <View style={styles.body}>
          {bodyBlocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Complete notes · 0.5″ margins · Helvetica 10pt</Text>
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
