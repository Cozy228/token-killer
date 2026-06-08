import type { ParsedCommand } from "../../types.js";
import { rawText } from "../base.js";
import { defineHandler } from "../define.js";

// tk-only handler: rtk has no terraform support, so this is a pure addition rather
// than an RTK port. Both subcommands are noise filters (retention-first): they drop
// progress/banner lines that carry no decision value and keep the full actionable
// body — no summarization, no "+N more" omission markers.

function matchesTerraform(command: ParsedCommand): boolean {
  return command.program === "terraform" || command.program === "tofu";
}

// terraform plan: strip state lock / refresh / data-source read progress, the
// symbol legend, and the trailing "Note: ... -out" epilogue. Keep the resource
// action section, the `Plan: X to add, ...` summary, "No changes." and any
// Error/Warning blocks verbatim. Returns null when nothing recognizable is found
// so the caller passes the raw output through unchanged.
function filterPlan(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const hasActions = lines.some((line) =>
    line.includes("Terraform will perform the following actions:"),
  );
  const hasPlanLine = lines.some((line) => /^Plan: \d+ to add/.test(line.trim()));
  const hasNoChanges = lines.some((line) => line.includes("No changes."));
  if (!hasActions && !hasPlanLine && !hasNoChanges) return null;

  const out: string[] = [];
  // "preamble" until the actions section begins; "legend" skips the symbol key;
  // "body" keeps content until the trailing note separator.
  let state: "preamble" | "legend" | "body" | "trailer" = "preamble";

  for (const line of lines) {
    const trimmed = line.trim();

    if (state === "trailer") continue;

    if (line.includes("Terraform will perform the following actions:")) {
      state = "body";
      out.push(line);
      continue;
    }

    if (state === "legend") {
      // Skip the "+ create / ~ update in-place / - destroy" key lines.
      if (trimmed === "" || /^[+~-]\/?[+]?\s+\w/.test(trimmed)) continue;
      state = "preamble";
      // fall through to preamble handling for this line
    }

    if (state === "preamble") {
      if (line.includes("Resource actions are indicated with the following symbols:")) {
        state = "legend";
        continue;
      }
      if (isPlanNoise(line)) continue;
      out.push(line);
      continue;
    }

    // state === "body"
    if (
      /^─{5,}/.test(trimmed) ||
      (trimmed.startsWith("Note:") && out.join("\n").includes("Plan:"))
    ) {
      state = "trailer";
      continue;
    }
    if (isPlanNoise(line)) continue;
    out.push(line);
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function isPlanNoise(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^(Acquiring|Releasing) state lock/.test(trimmed) ||
    /: Refreshing state\.\.\./.test(line) ||
    /: Reading\.\.\./.test(line) ||
    /: Read complete after/.test(line) ||
    /: Still reading\.\.\./.test(line) ||
    trimmed.startsWith("Terraform used the selected providers")
  );
}

// terraform test: drop per-run progress ("... in progress", "... setting up",
// "... tearing down", passing runs) and box-drawing borders; keep failed runs,
// error/diagnostic bodies, and the final "Success!/Failure!" summary.
function filterTest(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const hasSummary = lines.some((line) => /^(Success!|Failure!)/.test(line.trim()));
  if (!hasSummary) return null;

  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "╷" || trimmed === "╵") continue;
    if (/\.\.\. (in progress|setting up|tearing down)$/.test(trimmed)) continue;
    if (trimmed.endsWith("... pass")) continue;

    if (trimmed.startsWith("│")) {
      const inner = trimmed.replace(/^│\s?/, "");
      if (inner === "") continue;
      out.push(inner);
      continue;
    }

    out.push(line);
  }

  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

export const terraformHandler = defineHandler({
  name: "terraform",
  programs: ["terraform", "tofu"],

  match: matchesTerraform,

  format: (raw, command, options) => {
    const sub = command.args[0];
    const text = rawText(raw);
    let filtered: string | null = null;
    if (sub === "plan") filtered = filterPlan(text);
    else if (sub === "test") filtered = filterTest(text);

    // Unsupported subcommand or unrecognized output → passthrough raw.
    return filtered ?? `${text}\n`;
  },
});
