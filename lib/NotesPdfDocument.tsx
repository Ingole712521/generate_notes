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

const MARGIN = 36; // 0.5 inch at 72 dpi

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
    paddingHorizontal: MARGIN,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: "#2c403b",
  },
  headerTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 14,
    color: "#263632",
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 8,
    color: "#52786c",
  },
  columns: {
    flexDirection: "row",
    gap: 14,
    flexGrow: 1,
  },
  column: {
    flex: 1,
    flexDirection: "column",
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 6,
    marginTop: 2,
    color: "#1a2421",
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    marginBottom: 4,
    marginTop: 8,
    color: "#263632",
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    marginBottom: 3,
    marginTop: 6,
    color: "#344e47",
  },
  p: {
    fontSize: 10,
    lineHeight: 1.35,
    marginBottom: 5,
    textAlign: "justify",
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 3,
    paddingRight: 2,
  },
  bullet: {
    width: 10,
    fontSize: 10,
    lineHeight: 1.35,
  },
  listText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.35,
  },
  table: {
    marginVertical: 6,
    borderWidth: 0.75,
    borderColor: "#9bb8ae",
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
    flex: 1,
    padding: 4,
    fontSize: 8,
    lineHeight: 1.25,
  },
  tableHeaderCell: {
    flex: 1,
    padding: 4,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.25,
  },
  hr: {
    borderBottomWidth: 0.75,
    borderBottomColor: "#c5d6d0",
    marginVertical: 8,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: MARGIN,
    right: MARGIN,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#6f9487",
  },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  code: {
    fontFamily: "Courier",
    fontSize: 8.5,
    backgroundColor: "#f0f4f2",
  },
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

function BlockView({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "h1":
      return (
        <Text style={styles.h1}>
          <Inline segs={block.content} />
        </Text>
      );
    case "h2":
      return (
        <Text style={styles.h2}>
          <Inline segs={block.content} />
        </Text>
      );
    case "h3":
      return (
        <Text style={styles.h3}>
          <Inline segs={block.content} />
        </Text>
      );
    case "p":
      return (
        <Text style={styles.p}>
          <Inline segs={block.content} />
        </Text>
      );
    case "ul":
      return (
        <View>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.listText}>
                <Inline segs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "ol":
      return (
        <View>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>{i + 1}.</Text>
              <Text style={styles.listText}>
                <Inline segs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      return (
        <View style={styles.table} wrap={false}>
          <View style={[styles.tableRow, styles.tableHeaderRow]}>
            {block.headers.map((cell, ci) => (
              <Text key={ci} style={styles.tableHeaderCell}>
                <Inline segs={cell} />
              </Text>
            ))}
          </View>
          {block.rows.map((row, ri) => (
            <View key={ri} style={styles.tableRow}>
              {row.map((cell, ci) => (
                <Text key={ci} style={styles.tableCell}>
                  <Inline segs={cell} />
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    case "hr":
      return <View style={styles.hr} />;
    default:
      return null;
  }
}

function splitBlocks(blocks: MdBlock[]): [MdBlock[], MdBlock[]] {
  if (blocks.length <= 1) return [blocks, []];
  const mid = Math.ceil(blocks.length / 2);
  return [blocks.slice(0, mid), blocks.slice(mid)];
}

export type NotesPdfProps = {
  markdown: string;
  sourceFileName?: string;
};

export function NotesPdfDocument({ markdown, sourceFileName }: NotesPdfProps) {
  const title = extractTitle(markdown);
  const blocks = parseMarkdownToBlocks(markdown);
  // Skip duplicate H1 in body if we already use it as header title
  const bodyBlocks =
    blocks[0]?.type === "h1" ? blocks.slice(1) : blocks;
  const [left, right] = splitBlocks(bodyBlocks);
  const generatedAt = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Document
      title={title}
      author="PDF2Notes Pro"
      subject="Condensed academic notes"
      creator="PDF2Notes Pro"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerMeta}>
            PDF2Notes Pro · Condensed notes
            {sourceFileName ? ` · Source: ${sourceFileName}` : ""} · {generatedAt}
          </Text>
        </View>

        <View style={styles.columns}>
          <View style={styles.column}>
            {left.map((block, i) => (
              <BlockView key={`l-${i}`} block={block} />
            ))}
          </View>
          <View style={styles.column}>
            {right.map((block, i) => (
              <BlockView key={`r-${i}`} block={block} />
            ))}
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>Generated by PDF2Notes Pro · 0.5″ margins · Helvetica 10pt</Text>
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
