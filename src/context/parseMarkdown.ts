// Structured markdown parser (goal "Parser"). Conservative local YAML
// frontmatter parser (no dependency), plus heading-delimited sections that
// preserve 1-based line numbers for patch planning. Malformed frontmatter is a
// finding, never a crash.

export type FrontmatterValue = string | number | boolean | string[] | null;

export type Frontmatter = {
  // Present only when a `---` fenced block opened the file.
  present: boolean;
  // True when the block opened but parsing hit an unrecoverable shape.
  malformed: boolean;
  // 1-based inclusive line range of the frontmatter block (incl. fences).
  start_line?: number;
  end_line?: number;
  raw?: string;
  values: Record<string, FrontmatterValue>;
};

export type MarkdownSection = {
  heading: string; // "" for the preamble before the first heading
  level: number; // 0 for preamble
  start_line: number; // 1-based, the heading line (or 1 for preamble)
  end_line: number; // 1-based inclusive
  text: string; // section body incl. heading line
};

export type ParsedMarkdown = {
  frontmatter: Frontmatter;
  // Body after the frontmatter block, with line numbers offset into the file.
  body: string;
  body_start_line: number; // 1-based file line where the body begins
  sections: MarkdownSection[];
  total_lines: number;
};

// Strip surrounding quotes and inline `# comment` from a scalar.
function parseScalar(raw: string): FrontmatterValue {
  let s = raw.trim();
  if (s === "") return "";
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  // Drop a trailing inline comment only when unquoted.
  const hash = s.indexOf(" #");
  if (hash >= 0) s = s.slice(0, hash).trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  // Inline flow array: [a, b, c]
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((p) => {
      const v = parseScalar(p);
      return typeof v === "string" ? v : String(v);
    });
  }
  return s;
}

// Conservative YAML: top-level `key: value` and `key:` followed by `- item`
// block lists. Anything deeper is preserved as a raw string value, not a crash.
function parseFrontmatterBody(raw: string): { values: Record<string, FrontmatterValue>; malformed: boolean } {
  const values: Record<string, FrontmatterValue> = {};
  let malformed = false;
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i += 1;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!m) {
      // A non key-shaped, non-indented line at top level is malformed.
      if (!/^\s+/.test(line)) malformed = true;
      i += 1;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();
    if (rest === "") {
      // Possible block list / nested map on following indented lines.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+/.test(lines[j])) {
        const item = lines[j].trim();
        if (item.startsWith("- ")) items.push(parseScalarToString(item.slice(2)));
        else if (item.startsWith("-")) items.push(parseScalarToString(item.slice(1)));
        j += 1;
      }
      values[key] = items.length > 0 ? items : "";
      i = j;
      continue;
    }
    values[key] = parseScalar(rest);
    i += 1;
  }
  return { values, malformed };
}

function parseScalarToString(raw: string): string {
  const v = parseScalar(raw);
  return typeof v === "string" ? v : String(v);
}

export function parseMarkdown(content: string): ParsedMarkdown {
  const allLines = content.split("\n");
  const total_lines = allLines.length;

  const frontmatter: Frontmatter = { present: false, malformed: false, values: {} };
  let bodyStartIdx = 0; // 0-based index into allLines

  // Frontmatter only when the very first line is `---`.
  if (allLines[0]?.trim() === "---") {
    let end = -1;
    for (let i = 1; i < allLines.length; i += 1) {
      if (allLines[i].trim() === "---") {
        end = i;
        break;
      }
    }
    frontmatter.present = true;
    if (end === -1) {
      // Unterminated frontmatter fence.
      frontmatter.malformed = true;
      frontmatter.start_line = 1;
      frontmatter.end_line = 1;
      bodyStartIdx = 1;
    } else {
      const rawLines = allLines.slice(1, end);
      frontmatter.raw = rawLines.join("\n");
      frontmatter.start_line = 1;
      frontmatter.end_line = end + 1;
      const parsed = parseFrontmatterBody(frontmatter.raw);
      frontmatter.values = parsed.values;
      frontmatter.malformed = parsed.malformed;
      bodyStartIdx = end + 1;
    }
  }

  const body_start_line = bodyStartIdx + 1;
  const bodyLines = allLines.slice(bodyStartIdx);
  const body = bodyLines.join("\n");

  const sections = splitSections(bodyLines, body_start_line);

  return { frontmatter, body, body_start_line, sections, total_lines };
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

function splitSections(bodyLines: string[], bodyStartLine: number): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;
  let inFence = false;

  const push = (s: MarkdownSection | null) => {
    if (s) sections.push(s);
  };

  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i];
    const fileLine = bodyStartLine + i;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;

    const headingMatch = !inFence ? HEADING_RE.exec(line) : null;
    if (headingMatch) {
      if (current) {
        current.end_line = fileLine - 1;
        push(current);
      } else if (i > 0) {
        // Implicit preamble before the first heading.
        push({
          heading: "",
          level: 0,
          start_line: bodyStartLine,
          end_line: fileLine - 1,
          text: bodyLines.slice(0, i).join("\n"),
        });
      }
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        start_line: fileLine,
        end_line: fileLine,
        text: line,
      };
    } else if (current) {
      current.text += `\n${line}`;
      current.end_line = fileLine;
    }
  }

  if (current) {
    push(current);
  } else if (sections.length === 0 && bodyLines.length > 0) {
    // No headings at all: whole body is one preamble section.
    push({
      heading: "",
      level: 0,
      start_line: bodyStartLine,
      end_line: bodyStartLine + bodyLines.length - 1,
      text: bodyLines.join("\n"),
    });
  }

  return sections;
}
