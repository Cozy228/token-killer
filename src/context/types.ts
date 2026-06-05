// Static-context optimizer types (context-optimizer-implementation-goal.md
// "Data model"). A ContextFinding is the `source = "static_context"` slice of
// inspect's unified Finding (DESIGN §9.0). It does NOT define its own report
// envelope — inspect merges these into the one unified Finding[] report.

export type ContextSurface =
  | "copilot_instructions"
  | "path_instructions"
  | "agent_instructions"
  | "prompt_file"
  | "custom_agent"
  | "skill"
  | "stable_prefix";

// Shared with runtime findings. "delivery" belongs to runtime findings (install
// shim/hook); static-context findings only use the other four classes.
export type FixClass =
  | "safe_mechanical"
  | "suggested_diff"
  | "advisory"
  | "delivery"
  | "non_goal";

export type FindingSeverity = "info" | "warn" | "error";

export type ContextAdapter =
  | "copilot"
  | "vscode"
  | "claude"
  | "gemini"
  | "codex"
  | "generic";

export type ContextScope = "user" | "project";

export type ContextFindingType =
  | "always_on_bloat"
  | "conditional_rule_in_always_on"
  | "path_instruction_overbreadth"
  | "task_prompt_in_instruction"
  | "prompt_metadata_gap"
  | "agent_overbreadth"
  | "skill_invocation_policy"
  | "skill_entrypoint_bloat"
  | "instruction_duplicate"
  | "instruction_conflict"
  | "copilot_review_truncation"
  | "cacheability_churn"
  | "malformed_frontmatter"
  | "discovery_truncated";

// The static_context view of inspect's Finding. `source` is fixed to
// "static_context"; surface/file/lines/adapter are the static-context locators.
export type ContextFinding = {
  id: string;
  source: "static_context";
  type: ContextFindingType;
  severity: FindingSeverity;
  confidence: number;
  surface: ContextSurface;
  file?: string;
  start_line?: number;
  end_line?: number;
  evidence: string;
  recommendation: string;
  fix_class: FixClass;
  adapter?: ContextAdapter;
  scope?: ContextScope;
  // Hash of the parsed body the finding was computed against. The optimize
  // consumer re-reads the live file and validates against this before emitting a
  // diff — never persist the raw body itself.
  body_hash?: string;
};
