import React from "react";
import { Text, View, StyleSheet } from "@react-pdf/renderer";
import { sanitizeLines, sanitizePdfText } from "./sanitize-text";

const CONTENT_WIDTH = 595.28 - 72;

export type FlowSegment =
  | { kind: "title"; text: string }
  | { kind: "chain"; nodes: string[]; direction: "horizontal" | "vertical" }
  | { kind: "group"; title: string; items: string[] };

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "#f4f7f6",
    borderWidth: 0.75,
    borderColor: "#9bb8ae",
    width: CONTENT_WIDTH,
  },
  label: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#3f6057",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: "#1a2421",
    marginBottom: 8,
    textAlign: "center",
  },
  chainRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  chainCol: {
    flexDirection: "column",
    alignItems: "center",
    marginBottom: 8,
  },
  box: {
    borderWidth: 1,
    borderColor: "#2c403b",
    backgroundColor: "#ffffff",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 3,
    maxWidth: 150,
    minWidth: 68,
  },
  boxAccent: {
    borderWidth: 1,
    borderColor: "#c45c26",
    backgroundColor: "#fdf6f0",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 3,
    maxWidth: 150,
    minWidth: 68,
  },
  boxText: {
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#1a2421",
    textAlign: "center",
    lineHeight: 1.25,
  },
  arrowH: {
    fontSize: 11,
    color: "#2c403b",
    marginHorizontal: 4,
    fontFamily: "Helvetica-Bold",
  },
  arrowV: {
    fontSize: 10,
    color: "#2c403b",
    marginVertical: 2,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  vLine: {
    width: 1.25,
    height: 8,
    backgroundColor: "#2c403b",
    marginVertical: 1,
  },
  group: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#6f9487",
    borderRadius: 3,
    overflow: "hidden",
  },
  groupTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: "#ffffff",
    backgroundColor: "#3f6057",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  groupBody: {
    backgroundColor: "#ffffff",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  groupItem: {
    flexDirection: "row",
    marginBottom: 2,
    alignItems: "flex-start",
  },
  groupBullet: {
    width: 10,
    fontSize: 8,
    color: "#c45c26",
  },
  groupItemText: {
    flex: 1,
    fontSize: 8,
    lineHeight: 1.3,
    color: "#1a2421",
  },
});

const ARROW_SPLIT = /\s*(?:→|←|↔|⇒|⟶|->|=>|>>)\s*/;

function isSeparator(line: string): boolean {
  return /^[\*\-_=·•]+$/.test(line.trim());
}

function splitChain(line: string): string[] {
  return line
    .split(ARROW_SPLIT)
    .map((n) => n.replace(/^[-*+•]\s+/, "").trim())
    .filter((n) => n.length > 0 && n !== "*" && n !== "·");
}

function parseExplicit(lines: string[]): FlowSegment[] | null {
  const segs: FlowSegment[] = [];
  let matched = false;

  for (const raw of lines) {
    const line = raw.trim();
    const title = /^(?:title|diagram)\s*:\s*(.+)$/i.exec(line);
    if (title) {
      matched = true;
      segs.push({ kind: "title", text: title[1].trim() });
      continue;
    }
    const chain = /^(?:chain|flow)\s*:\s*(.+)$/i.exec(line);
    if (chain) {
      matched = true;
      const nodes = splitChain(chain[1]);
      if (nodes.length) {
        segs.push({
          kind: "chain",
          nodes,
          direction: nodes.length > 4 ? "vertical" : "horizontal",
        });
      }
      continue;
    }
    const box = /^(?:box|group)\s*:\s*(.+)$/i.exec(line);
    if (box) {
      matched = true;
      const parts = box[1]
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        segs.push({ kind: "group", title: parts[0], items: parts.slice(1) });
      } else if (parts.length === 1) {
        segs.push({ kind: "title", text: parts[0] });
      }
    }
  }

  return matched ? segs : null;
}

/**
 * Parse free-form / structured flowchart text into visual segments.
 */
export function parseFlowchart(rawLines: string[]): FlowSegment[] {
  const lines = sanitizeLines(rawLines).filter((l) => !isSeparator(l));
  if (!lines.length) return [];

  const explicit = parseExplicit(lines);
  if (explicit?.length) return explicit;

  const segs: FlowSegment[] = [];
  let i = 0;

  // Title = first short line without arrows
  if (
    lines[0] &&
    lines[0].length < 70 &&
    !ARROW_SPLIT.test(lines[0]) &&
    !lines[0].includes("→")
  ) {
    segs.push({ kind: "title", text: lines[0] });
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Flow chain with arrows
    if (ARROW_SPLIT.test(line) || line.includes("→")) {
      const nodes = splitChain(line);
      if (nodes.length >= 1) {
        segs.push({
          kind: "chain",
          nodes,
          direction: nodes.length > 4 ? "vertical" : "horizontal",
        });
      }
      i += 1;
      continue;
    }

    // Section header + following item lines
    const header = line.replace(/^[-*+•]\s+/, "").trim();
    const items: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (ARROW_SPLIT.test(next) || next.includes("→")) break;

      // Next section header: short label followed by more short lines,
      // and we already collected items — stop before that header
      if (
        items.length > 0 &&
        !/^[-*+•]\s+/.test(next) &&
        next.length < 40 &&
        j + 1 < lines.length &&
        !ARROW_SPLIT.test(lines[j + 1]) &&
        !lines[j + 1].includes("→") &&
        (lines[j + 1].length < 55 || /^[-*+•]\s+/.test(lines[j + 1]))
      ) {
        // If the line after `next` looks like an item, `next` is a new header
        const after = lines[j + 1];
        if (
          /^[-*+•]\s+/.test(after) ||
          (after.length < 55 && !ARROW_SPLIT.test(after))
        ) {
          break;
        }
      }

      items.push(next.replace(/^[-*+•]\s+/, "").trim());
      j += 1;

      // Cap group size
      if (items.length >= 8) break;
    }

    if (items.length >= 1 && header.length < 55) {
      segs.push({ kind: "group", title: header, items });
      i = j;
      continue;
    }

    // Lone node
    segs.push({ kind: "chain", nodes: [header], direction: "horizontal" });
    i += 1;
  }

  return segs;
}

function NodeBox({ text, accent = false }: { text: string; accent?: boolean }) {
  return (
    <View style={accent ? styles.boxAccent : styles.box} wrap={false}>
      <Text style={styles.boxText}>{sanitizePdfText(text)}</Text>
    </View>
  );
}

function ChainView({
  nodes,
  direction,
}: {
  nodes: string[];
  direction: "horizontal" | "vertical";
}) {
  if (nodes.length === 1) {
    return (
      <View style={styles.chainRow}>
        <NodeBox text={nodes[0]} accent />
      </View>
    );
  }

  if (direction === "vertical") {
    return (
      <View style={styles.chainCol} wrap={false}>
        {nodes.map((node, i) => (
          <React.Fragment key={i}>
            <NodeBox text={node} accent={i === 0 || i === nodes.length - 1} />
            {i < nodes.length - 1 ? (
              <View style={{ alignItems: "center" }}>
                <View style={styles.vLine} />
                <Text style={styles.arrowV}>▼</Text>
              </View>
            ) : null}
          </React.Fragment>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.chainRow} wrap>
      {nodes.map((node, i) => (
        <React.Fragment key={i}>
          <NodeBox text={node} accent={i === 0} />
          {i < nodes.length - 1 ? <Text style={styles.arrowH}>→</Text> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function GroupView({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.group} wrap={false}>
      <Text style={styles.groupTitle}>{sanitizePdfText(title)}</Text>
      <View style={styles.groupBody}>
        {items.map((item, i) => (
          <View key={i} style={styles.groupItem}>
            <Text style={styles.groupBullet}>▸</Text>
            <Text style={styles.groupItemText}>{sanitizePdfText(item)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function FlowchartDiagram({ lines }: { lines: string[] }) {
  const segments = parseFlowchart(lines);

  if (!segments.length) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>FLOWCHART / DIAGRAM</Text>
        <Text style={styles.boxText}>No diagram content</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap} wrap minPresenceAhead={48}>
      <Text style={styles.label}>FLOWCHART / DIAGRAM</Text>
      {segments.map((seg, idx) => {
        if (seg.kind === "title") {
          return (
            <Text key={idx} style={styles.title}>
              {sanitizePdfText(seg.text)}
            </Text>
          );
        }
        if (seg.kind === "chain") {
          return (
            <ChainView key={idx} nodes={seg.nodes} direction={seg.direction} />
          );
        }
        return <GroupView key={idx} title={seg.title} items={seg.items} />;
      })}
    </View>
  );
}
