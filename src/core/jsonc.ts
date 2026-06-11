// Zero-dependency JSONC reader. VS Code writes settings.json as JSONC: `//` and
// `/* */` comments and trailing commas are legal there, so a strict `JSON.parse`
// throws on a perfectly valid user file. Every settings.json reader in this repo
// must go through `parseJsonc` so `tk install` / `tk optimize` / the TTY gate can
// patch a commented settings.json instead of bailing with "could not be parsed".
//
// The scan is string-aware (commas/slashes inside string values are never touched)
// and offset-stable is NOT a goal — we only need a strict-JSON projection to feed
// `JSON.parse`. Comment preservation on WRITE is handled separately (the writers
// back up the original text before reformatting).

// True when `text` is already strict JSON (no comments / trailing commas). Lets a
// writer decide whether a rewrite would lose anything and a backup is warranted.
export function isStrictJson(text: string): boolean {
  try {
    JSON.parse(stripBom(text));
    return true;
  } catch {
    return false;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Tolerant parse: strip comments + trailing commas (string-aware), then JSON.parse.
// Throws only when the underlying structure is genuinely malformed JSON.
export function parseJsonc(text: string): unknown {
  const src = stripBom(text);
  const out: string[] = [];
  // Index into `out` of the last emitted non-whitespace character — used to drop a
  // trailing comma when the next structural char is `}` or `]`.
  let lastMeaningful = -1;
  let inString = false;
  const n = src.length;

  for (let i = 0; i < n; i++) {
    const c = src[i]!;

    if (inString) {
      out.push(c);
      if (c === "\\") {
        // Emit the escaped char verbatim; it can never close the string.
        out.push(src[++i] ?? "");
        lastMeaningful = out.length - 1;
        continue;
      }
      if (c === '"') inString = false;
      lastMeaningful = out.length - 1;
      continue;
    }

    if (c === '"') {
      inString = true;
      out.push(c);
      lastMeaningful = out.length - 1;
      continue;
    }

    // Line comment — skip to (but keep) the newline.
    if (c === "/" && src[i + 1] === "/") {
      i += 1;
      while (i + 1 < n && src[i + 1] !== "\n") i += 1;
      continue;
    }
    // Block comment — skip through the closing `*/`.
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i + 1 < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 1; // consume the `/` of `*/`
      continue;
    }

    if (c === "}" || c === "]") {
      if (lastMeaningful >= 0 && out[lastMeaningful] === ",") out[lastMeaningful] = "";
      out.push(c);
      lastMeaningful = out.length - 1;
      continue;
    }

    out.push(c);
    if (c !== " " && c !== "\t" && c !== "\r" && c !== "\n") lastMeaningful = out.length - 1;
  }

  return JSON.parse(out.join(""));
}
