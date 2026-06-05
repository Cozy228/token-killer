export function compactUnifiedDiff(diff: string, maxLines = 500): string {
  const result: string[] = [];
  let currentFile = "";
  let added = 0;
  let removed = 0;
  let inHunk = false;
  let hunkShown = 0;
  let hunkSkipped = 0;
  let wasTruncated = false;
  const maxHunkLines = 100;

  const flushHunkSkip = () => {
    if (hunkSkipped > 0) {
      result.push(`  ... (${hunkSkipped} lines truncated)`);
      wasTruncated = true;
      hunkSkipped = 0;
    }
  };

  const flushFileSummary = () => {
    if (currentFile && (added > 0 || removed > 0)) {
      result.push(`  +${added} -${removed}`);
    }
  };

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git")) {
      flushHunkSkip();
      flushFileSummary();
      currentFile = line.split(" b/")[1] ?? line.replace("diff --git ", "");
      result.push("", currentFile);
      added = 0;
      removed = 0;
      inHunk = false;
      hunkShown = 0;
      continue;
    }

    if (line.startsWith("@@")) {
      flushHunkSkip();
      inHunk = true;
      hunkShown = 0;
      result.push(`  ${line}`);
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      added += 1;
      if (hunkShown < maxHunkLines) {
        result.push(`  ${line}`);
        hunkShown += 1;
      } else {
        hunkSkipped += 1;
      }
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      removed += 1;
      if (hunkShown < maxHunkLines) {
        result.push(`  ${line}`);
        hunkShown += 1;
      } else {
        hunkSkipped += 1;
      }
      continue;
    }

    if (hunkShown > 0 && hunkShown < maxHunkLines && !line.startsWith("\\")) {
      result.push(`  ${line}`);
      hunkShown += 1;
    }

    if (result.length >= maxLines) {
      result.push("", "... (more changes truncated)");
      wasTruncated = true;
      break;
    }
  }

  flushHunkSkip();
  flushFileSummary();

  if (wasTruncated) {
    result.push("[full diff: tk --raw git diff]");
  }

  return result.join("\n").trimStart();
}

export function extractDiffStatLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => /\|\s+\d+/.test(line) || /\d+ files? changed/.test(line));
}
