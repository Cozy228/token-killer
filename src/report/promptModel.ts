// Prompt-model source (issue #58). The report's "Copy as prompt" payload is built
// from per-category templates rather than one generic skeleton. This logic must run
// in TWO places: inside the browser (injected verbatim into the report SCRIPT, see
// html.ts) and in Node unit tests. To keep both byte-identical there is ONE source
// of truth — the String.raw block below — which html.ts interpolates and the tests
// eval. So it is authored in plain, dependency-free JS (no TS types, no imports).
//
// Authored offline from the actual inspect rule recommendations (src/context/rules/*)
// and runtime findings (src/inspect/unified.ts): every flag, settings key, and path
// named in a template is a real host feature, not generic "make it shorter" filler.
//
// Placeholders the renderer fills from a finding: {file} {line} {surface} {where}
// {evidence} {recommendation} {scope}. An empty placeholder collapses cleanly.
//
// String.raw is required so the fillTpl regex backslashes survive into the source.
export const PROMPT_MODEL_SRC = String.raw`
const SURFACE_NAMES = {
  agent_instructions: "Agent instructions (AGENTS.md / CLAUDE.md)",
  copilot_instructions: "Copilot instructions",
  path_instructions: "Path-scoped instructions",
  prompt_file: "Prompt files",
  custom_agent: "Custom agents",
  chat_mode: "Chat modes",
  skill: "Skills",
};
const PROBLEM = {
  always_on_bloat: "A file that loads every session is too large",
  instruction_conflict: "Two instructions contradict each other",
  skill_invocation_policy: "A skill can be auto-run by the model",
  prompt_metadata_gap: "A prompt is missing its description",
  skill_entrypoint_bloat: "A skill's main file is too long",
  skill_description_bloat: "A skill's description is too long",
  chat_mode_bloat: "A chat mode's instructions are too long",
  skill_count_bloat: "Your skills load a lot of metadata every session",
  output_verbosity_unset: "No output-brevity instruction is set",
  vscode_compress_disabled: "VS Code isn't compressing terminal output",
  // Keys MUST match the real finding f.type (src/context/types.ts). The earlier
  // duplicate_instructions / conditional_rule_missing / review_truncation_risk keys
  // never matched a finding, so those types silently fell back to humanize().
  instruction_duplicate: "The same instruction is repeated in several places",
  conditional_rule_in_always_on: "A broad rule should be scoped to specific paths",
  copilot_review_truncation: "Long content risks being cut off mid-review",
  path_instruction_overbreadth: "A path-scoped instruction file loads for every file",
  task_prompt_in_instruction: "A reusable task workflow is stuck in always-on instructions",
  agent_overbreadth: "A custom agent is too broad and gets auto-picked",
  malformed_frontmatter: "A file's frontmatter is malformed, so its metadata is ignored",
  discovery_truncated: "Too many files to scan — some were skipped",
  cacheability_churn: "Volatile content breaks prompt caching",
  uncompressed_commands: "Terminal commands run raw instead of through tk",
  orientation_cost: "The agent spends tokens finding its way around the code",
  repeated_failures: "The same command keeps failing and retrying",
  dependency_reads: "Reading dependency / build files wastes tokens",
  long_agent_loops: "Sessions run long, re-sending the transcript each turn",
  oversized_prompts: "Prompts are larger than they need to be",
  mcp_bloat: "Too many MCP servers load their tools every session",
};
function humanize(t) { return String(t || "Opportunity").replace(/_/g, " ").replace(/^./, function (c) { return c.toUpperCase(); }); }

// The actionable location: a real file (+ line) for static findings, else the
// runtime finding's where (a setup step / config target), else a dash.
function whereOf(f) {
  if (f.file) return f.file + (f.start_line ? ", line " + f.start_line : "");
  return f.where || "—";
}

// Per-category prompt templates. task = one imperative sentence naming the concrete
// target; why = the category-specific token cost; how = concrete, grounded steps.
const PROMPT_TPL = {
  always_on_bloat: {
    task: "Trim the {surface} file at {file} (line {line}) so it loads less into every session.",
    why: "An always-on instruction file is re-sent on every turn, so each excess line, oversized section, or long code fence is paid repeatedly for the whole conversation.",
    how: ["Delete stale or redundant guidance and keep only durable, project-wide rules.", "Move path-specific rules to .github/instructions/*.instructions.md, repeatable workflows to .github/prompts/*.prompt.md, and persona/tool bundles to .github/agents/*.agent.md.", "Replace long inline code examples with a one-line reference to a file outside the always-on context."],
  },
  conditional_rule_in_always_on: {
    task: "Move the path/framework-scoped rules in {file} (line {line}) out of the always-on {surface} into a scoped instructions file.",
    why: "A rule that only matters for certain paths or frameworks still loads on every session while it sits in an always-on file, so most turns pay for guidance they never use.",
    how: ["Relocate each narrow rule to a .github/instructions/<name>.instructions.md file with an applyTo glob matching the files it governs.", "Do not auto-create the target file blindly — group related rules so each scoped file has one coherent purpose.", "Leave only genuinely repo-wide rules in the always-on file."],
  },
  path_instruction_overbreadth: {
    task: "Narrow the scope of the path instruction file at {file} (line {line}) so it only loads for the files it governs.",
    why: "A path-scoped instruction file with a missing or repo-wide applyTo glob attaches to every file in the repo, loading its rules into requests that have nothing to do with them.",
    how: ["Add or tighten the applyTo glob in frontmatter to the concrete paths or languages this rule governs (e.g. src/api/**/*.ts), not ** or *.", "If the content is local-only or secrets-handling, add excludeAgent so the Copilot coding/review agent does not load steps it cannot or should not run."],
  },
  task_prompt_in_instruction: {
    task: "Extract the repeatable workflow embedded in the {surface} file at {file} into its own prompt file.",
    why: "A multi-step task template lives in always-on instructions but is only needed when that task runs, so it taxes every unrelated turn while sitting in the prompt prefix.",
    how: ["Move the workflow to .github/prompts/<name>.prompt.md, carrying its argument placeholders and numbered steps intact.", "Replace it in the instruction file with a single one-line route pointing at the new prompt, so the detail loads only on invocation."],
  },
  prompt_metadata_gap: {
    task: "Add the missing metadata to the prompt file at {file} (line {line}).",
    why: "Without a description the model and UI cannot route to the prompt cleanly, and an over-broad declared tool list grants write/terminal access a read-only prompt never uses — both push the agent toward extra, wasteful turns.",
    how: ["Add a one-line description stating what the prompt does (or run tk optimize --apply-safe --surface prompts to fill an inferable one automatically).", "If the body has argument placeholders, add an argument-hint describing the expected input.", "Trim the tools list to the minimum the prompt needs — VS Code gives prompt-file tools priority over the agent's defaults."],
  },
  agent_overbreadth: {
    task: "Sharpen the custom agent defined in {file} (line {line}) to one persona, one workflow family, and a narrow tool set.",
    why: "A vague, do-everything agent with broad tools and an expensive model gets auto-selected for routine work it does not need, spending more tokens and capability than the task warrants.",
    how: ["Give it a specific name and a description naming the exact trigger, instead of a generic developer/assistant/helper label.", "Remove write/terminal tools if the persona is read-only (review/audit/summarize), and drop an expensive model for a routine workflow.", "If it only wraps a single prompt, move that template into a prompt file and retire the agent."],
  },
  chat_mode_bloat: {
    task: "Trim the chat mode defined in {file} so it costs less on every turn it is active.",
    why: "While a chat mode is selected its instructions become part of the system prompt and are re-sent every turn, so an oversized mode is paid repeatedly for the whole session it is active.",
    how: ["Cut the mode down to the behavior that actually distinguishes it from default mode.", "Move reference detail and long examples into a linked instructions file the mode points at, rather than inlining them in the mode body."],
  },
  skill_invocation_policy: {
    task: "Set the missing invocation-policy frontmatter on the skill at {file} (line {line}).",
    why: "A skill the model can auto-invoke runs its full body whenever the model guesses it is relevant; for a side-effect workflow that risks unwanted actions, and missing least-privilege keys mean the skill is offered and scoped more broadly than intended.",
    how: ["If the skill performs side-effects (deploy/delete/commit/publish/release/send), add 'disable-model-invocation: true' so only the user can trigger it.", "For a read-only or knowledge skill, add 'user-invocable: false' and/or an 'allowed-tools' list so it is scoped and not auto-offered as a command."],
  },
  skill_entrypoint_bloat: {
    task: "Slim the SKILL.md entrypoint at {file} so it loads less when the skill runs.",
    why: "When a skill is invoked its entrypoint loads in full, so a long entrypoint or a big inline example block is pulled into context even when only part of the skill is needed.",
    how: ["Move detailed procedures, examples, and templates into references/, examples/, templates/, or scripts/ subfiles.", "Keep SKILL.md as a short overview plus a route map pointing at those files, so detail loads on demand (progressive disclosure)."],
  },
  skill_description_bloat: {
    task: "Tighten the description of the skill defined in {file} (line {line}) to a concise trigger.",
    why: "A skill's description is always-on invocation-routing metadata — it loads into every session at its scope so the model can decide whether to call the skill, so an over-long one is paid on every turn whether or not the skill runs.",
    how: ["Reduce the description to what the skill does plus when to use it, in one or two sentences.", "Keep all usage detail, steps, and examples in the skill body, which only loads when the skill is actually invoked."],
  },
  skill_count_bloat: {
    task: "Prune your installed {scope}-level skills so less invocation metadata loads every session.",
    why: "Every installed skill contributes its name and description to the always-on invocation surface, so a large collection is a standing per-session token tax even for skills you never call.",
    how: ["Disable or remove skills you rarely use so their metadata stops loading.", "Move project-specific skills into the relevant repo (project scope) so they only load where they are relevant, not in every session everywhere."],
  },
  output_verbosity_unset: {
    task: "Add an output-brevity directive to the {surface} file at {file}.",
    why: "This always-on instruction file never tells the agent to keep its output terse, and output tokens are billed several times the rate of input, so unbounded explanation is the most expensive thing in the loop.",
    how: ["Add a line such as: Respond with code only — no prose explanation unless asked.", "Keep it short and behavioral so it costs almost nothing to carry while curbing every verbose reply."],
  },
  instruction_duplicate: {
    task: "Consolidate the duplicated instruction at {file} (line {line}) so it lives in exactly one place.",
    why: "The same guidance repeated across several {surface} files loads multiple copies into context every session, paying for identical text more than once with no added effect.",
    how: ["Keep the rule in the single narrowest durable surface that should own it.", "Replace the other copies with a short route or reference to the canonical location — do not delete blindly; confirm the surviving copy still applies in each context."],
  },
  instruction_conflict: {
    task: "Resolve the contradictory instructions detected at {file} (line {line}) by choosing one canonical rule.",
    why: "When two instructions contradict each other the agent wastes turns guessing which to follow, asking for clarification, or redoing work after picking wrong — and both rules still occupy the prompt every session.",
    how: ["Decide on the single rule the project actually wants and delete the losing side.", "When in doubt keep the rule from the higher-priority (narrower/more explicit) surface named in the evidence, and make the other surface defer to it."],
  },
  copilot_review_truncation: {
    task: "Move the review-critical rule in {file} (line {line}) above the ~4,000-character cutoff.",
    why: "Copilot code review reads only the first ~4,000 characters of an instruction file, so a review rule placed after that mark is silently ignored — the tokens before it are spent without the rule ever taking effect.",
    how: ["Relocate review/PR-specific rules into the first 4,000 characters of the file.", "Alternatively move them into a .github/instructions/*.instructions.md file scoped to the review surface, so position no longer matters."],
  },
  cacheability_churn: {
    task: "Remove the volatile content from the stable {surface} file at {file}.",
    why: "Timestamps, dates, run/session IDs, and temp paths in an otherwise-stable prompt prefix change between sessions, which can invalidate the cached prefix and force the model to reprocess context that would otherwise be reused.",
    how: ["Strip the volatile tokens out of this surface and keep canonical headings and a fixed section ordering.", "If the volatile data is genuinely needed, move it into advice/history rather than the stable instruction prefix."],
  },
  malformed_frontmatter: {
    task: "Fix the malformed YAML frontmatter in the {surface} file at {file} (line {line}).",
    why: "Tools cannot parse the frontmatter cleanly, so the file's metadata (description, applyTo, tools, invocation policy) is ignored — which can make the file load too broadly or route incorrectly.",
    how: ["Correct the YAML syntax (check indentation, quoting, and the --- fences) so the block parses, or remove the frontmatter if it is not needed.", "After fixing, re-run inspect so the file's real metadata-level findings can surface."],
  },
  discovery_truncated: {
    task: "Re-run inspect with a narrower scope so all context files get scanned.",
    why: "Discovery hit the 200-file cap, so some context files were never analyzed — any token waste in the unscanned files is invisible in this report.",
    how: ["Re-run with --surface to focus on one surface type, or --project to limit to the current repo, so the scan covers a focused subset within the cap."],
  },
  vscode_compress_disabled: {
    task: "Enable VS Code's built-in terminal-output compression in {file}.",
    why: "With this setting off, the full raw output of terminal commands reaches the model on every run, spending tokens on noise the host could have compressed first.",
    how: ['Set "chat.tools.compressOutput.enabled": true in your VS Code settings.json (or run tk optimize --apply to do it; it is host-native and reversible with tk optimize --restore).', "If the file is not strict JSON, fix the JSON first so the setting can be written."],
  },
  uncompressed_commands: {
    task: "Set up tk so terminal commands flow through it, at: {where}.",
    why: "Compressible shell commands are running raw, sending their full output to the model every time, when tk could losslessly compress that output before it is ever read.",
    how: ["For VS Code, run tk install to put the PATH shim in place, then restart your editor.", "For Copilot CLI, run tk install --host copilot-cli to wire the rewrite hook.", "After install, the listed commands route through tk automatically — no per-command change needed."],
  },
  orientation_cost: {
    task: "Record durable project context at: {where}.",
    why: "The agent is spending a large share of its budget on read/search/list actions just to locate code, re-deriving the project's structure from scratch every session instead of being told it once.",
    how: ["Write the project's layout, key entry points, and where things live into durable context (AGENTS.md / CONTEXT.md) so the agent stops re-discovering it.", "Pair that with reading scoped line ranges instead of whole files, so each lookup pulls in less."],
  },
  repeated_failures: {
    task: "Capture the working invocation for the repeatedly-failing commands at: {where}.",
    why: "The same commands keep failing and retrying, and each retry burns tokens re-discovering a problem that was already solved earlier in the same or a prior session.",
    how: ["Record the correct invocation, required flags, or the constraint that makes the command succeed in AGENTS.md.", "Phrase it as a durable rule so the agent reads it up front and stops re-hitting the same failure on every run."],
  },
  dependency_reads: {
    task: "Tighten the agent's read policy at: {where}.",
    why: "Direct reads keep targeting dependency directories, build output, and lockfiles — large generated files whose contents flood the context with tokens the task rarely needs.",
    how: ["Steer the agent to read source files rather than generated or vendored ones.", "Add a hook pre-tool deny that blocks oversized dependency/lockfile reads before their content ever reaches the model."],
  },
  long_agent_loops: {
    task: "Change how you drive the agent at: {where}.",
    why: "Sessions run long, and because the entire transcript is re-sent on every turn, cost compounds as the conversation grows — late turns pay for all the earlier ones.",
    how: ["Scope each session to a single task and start a fresh session for the next one.", "Refresh or summarize when a session gets deep instead of letting one conversation accumulate turns."],
  },
  oversized_prompts: {
    task: "Tighten how you write prompts at: {where}.",
    why: "Oversized prompts are re-sent on every turn that follows, so pasted-in bulk context is paid repeatedly rather than once.",
    how: ["Point the agent at files and name the exact decision you want, instead of pasting large blocks of context inline.", "Write as little as required and as much as necessary — let the agent pull detail from the files on demand."],
  },
  mcp_bloat: {
    task: "Prune the MCP servers configured at: {where}.",
    why: "Every configured MCP server injects its full tool-definition schemas into every session's context, so unused servers take a standing share of the context window before any work begins.",
    how: ["Disable servers you are not using in this workspace so their schemas stop loading.", "Where a CLI exists (gh / aws / gcloud), prefer it over the equivalent MCP server — a CLI call uses far fewer tokens than carrying the server's schemas every session."],
  },
};

// Humanize a context surface enum for prompts (falls back to a title-cased token).
function surfaceName(s) { return SURFACE_NAMES[s] || (s ? humanize(s) : ""); }

// Fill {placeholders} from a finding, then collapse the artifacts an empty value
// leaves behind ("(line )", stray "()", doubled spaces, space-before-punctuation).
function fillTpl(s, f) {
  const map = {
    file: f.file || "",
    line: f.start_line ? String(f.start_line) : "",
    surface: surfaceName(f.surface),
    where: f.where || "",
    evidence: f.evidence || "",
    recommendation: f.recommendation || "",
    scope: f.scope || "user",
  };
  return String(s)
    .replace(/\{(\w+)\}/g, function (_, k) { return map[k] != null ? map[k] : ""; })
    .replace(/\(line \)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/ {2,}/g, " ")
    // Collapse a space before sentence punctuation ONLY when it ends a clause
    // (followed by whitespace or end) — never before a leading-dot token like a
    // ".claude"/".github" path, where the dot belongs to the filename.
    .replace(/ +([.,])(?=\s|$)/g, "$1")
    .trim();
}

// Per-finding agent-ready prompt. The displayed fix is for the human; this COPIED
// text is for the agent, and tells it to SNAPSHOT first (tk optimize --backup) so the
// human can revert later with tk optimize --restore.
function buildPrompt(f) {
  const tpl = PROMPT_TPL[f.type];
  const task = tpl ? fillTpl(tpl.task, f) : (f.recommendation || PROBLEM[f.type] || humanize(f.type));
  const why = tpl && tpl.why ? fillTpl(tpl.why, f) : (f.evidence || "");
  const how = tpl && tpl.how ? tpl.how.map(function (h) { return fillTpl(h, f); }).filter(Boolean) : [];

  // Runtime / setup findings have no source file — they are an action to take (install
  // a shim, add durable context), not a file edit. No backup/restore dance.
  if (!f.file) {
    const lines = [
      "Reduce my AI/agent token usage — apply this one improvement:",
      "",
      "  Where: " + (f.where || "your agent setup"),
      "  Do this: " + task,
      why ? "  Why it matters: " + why : "",
    ];
    if (how.length) { lines.push("  How:"); how.forEach(function (h) { lines.push("    - " + h); }); }
    return lines.filter(Boolean).join("\n");
  }
  const where = f.file + (f.start_line ? " (line " + f.start_line + ")" : "");
  const lines = [
    "Fix a token-wasting issue in my AI/agent configuration.",
    "",
    "Step 1 — before editing, snapshot the file so the change is reversible:",
    "  tk optimize --backup " + f.file,
    "Step 2 — apply this edit directly:",
    "  File: " + where,
    "  Do this: " + task,
    why ? "  Why it matters: " + why : "",
  ];
  if (how.length) { lines.push("  How:"); how.forEach(function (h) { lines.push("    - " + h); }); }
  lines.push(
    "  Leave everything else in the file unchanged.",
    "",
    "Do not run tk optimize --restore yourself — that is the human's manual undo; it reverts to the step-1 snapshot.",
  );
  return lines.filter(Boolean).join("\n");
}

// One paste that applies every listed finding — each rendered from its own template.
function buildAllPrompt(findings) {
  const files = [];
  for (let i = 0; i < findings.length; i++) { const f = findings[i]; if (f.file && files.indexOf(f.file) === -1) files.push(f.file); }
  const list = findings
    .map(function (f, i) {
      const tpl = PROMPT_TPL[f.type];
      const task = tpl ? fillTpl(tpl.task, f) : (f.recommendation || PROBLEM[f.type] || humanize(f.type));
      const how = tpl && tpl.how ? tpl.how.map(function (h) { return fillTpl(h, f); }).filter(Boolean) : [];
      let row = "  " + (i + 1) + ". " + whereOf(f) + " — " + task;
      if (how.length) row += "\n     · " + how.join("\n     · ");
      return row;
    })
    .join("\n");
  const head = ["Reduce my AI/agent token usage by addressing the items below.", ""];
  // Only frame the backup/restore dance when there are files to edit; a list of pure
  // setup actions (install shim, add context) has nothing to snapshot.
  if (files.length) {
    return head.concat([
      "Step 1 — before editing any file, snapshot it so your changes are reversible:",
      "  tk optimize --backup " + files.join(" "),
      "Step 2 — apply each fix directly, leaving the rest of each file unchanged:",
      list,
      "",
      "When done, verify nothing broke. Do not run tk optimize --restore yourself — that is the human's manual undo; it reverts to the step-1 snapshot.",
    ]).join("\n");
  }
  return head.concat(["Apply each item below (setup/config actions, not file edits):", list]).join("\n");
}
`;

// Live bindings for Node unit tests — eval the SAME source the browser runs, so a
// test failure means the shipped prompt is wrong, not a drifted copy. The browser
// gets this source via html.ts interpolating PROMPT_MODEL_SRC into the report SCRIPT.
type Finding = Record<string, unknown>;
type PromptModel = {
  PROMPT_TPL: Record<string, { task: string; why?: string; how?: string[] }>;
  PROBLEM: Record<string, string>;
  fillTpl: (s: string, f: Finding) => string;
  buildPrompt: (f: Finding) => string;
  buildAllPrompt: (findings: Finding[]) => string;
};

// eslint-disable-next-line @typescript-eslint/no-implied-eval
export const promptModel: PromptModel = new Function(
  `${PROMPT_MODEL_SRC}\nreturn { PROMPT_TPL, PROBLEM, fillTpl, buildPrompt, buildAllPrompt };`,
)();
