// Redact a shell command to its program (+ optional subcommand) for telemetry.
// Args, paths, flags, URLs, and secrets are dropped — never emitted raw.

function splitCommandTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === " " || c === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += c;
  }
  if (current) tokens.push(current);
  return tokens;
}

function isArgToken(token: string): boolean {
  if (token.startsWith("-")) return true;
  if (token.includes("://")) return true;
  if (/[/\\]/.test(token)) return true;
  if (/\.[a-zA-Z0-9]{1,8}$/.test(token)) return true;
  if (/[~@{}]/.test(token)) return true;
  if (/^[0-9a-f]{8,}$/i.test(token)) return true;
  if (token.includes("=") && token.length > 24) return true;
  return false;
}

// Closed per-program subcommand vocabularies. A position-≥2 token is emitted ONLY when
// it is present in the program's set; anything else degrades to program-only. This is the
// security boundary (issue #10): the second token of `rg`/`grep`/`psql`/`curl`/`wget` is
// USER CONTENT (search patterns, db names, hosts, pasted credentials), so those programs
// get NO entry and never emit a second token. Vocabularies may be incomplete — an unknown
// but legitimate subcommand safely degrades to program-only — but they must never be open.
// Anyone adding a program MUST add its closed subcommand set; never trust position 2.
const KNOWN_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
  git: new Set([
    "status",
    "diff",
    "log",
    "show",
    "add",
    "commit",
    "push",
    "pull",
    "fetch",
    "branch",
    "checkout",
    "switch",
    "merge",
    "rebase",
    "stash",
    "clone",
    "remote",
    "tag",
    "reset",
    "restore",
    "blame",
    "grep",
    "rev-parse",
    "describe",
    "worktree",
    "cherry-pick",
    "bisect",
    "init",
    "mv",
    "rm",
    "config",
    "submodule",
    "reflog",
    "clean",
    "apply",
  ]),
  npm: new Set([
    "run",
    "install",
    "ci",
    "test",
    "exec",
    "ls",
    "list",
    "audit",
    "publish",
    "view",
    "init",
    "outdated",
    "update",
    "uninstall",
    "start",
    "link",
    "pack",
    "prune",
    "rebuild",
  ]),
  pnpm: new Set([
    "run",
    "install",
    "add",
    "remove",
    "test",
    "exec",
    "dlx",
    "why",
    "list",
    "ls",
    "audit",
    "publish",
    "init",
    "outdated",
    "update",
    "link",
    "pack",
    "prune",
    "rebuild",
    "store",
    "dedupe",
    "import",
    "patch",
    "deploy",
  ]),
  yarn: new Set([
    "run",
    "install",
    "add",
    "remove",
    "test",
    "exec",
    "dlx",
    "why",
    "list",
    "audit",
    "publish",
    "init",
    "outdated",
    "upgrade",
    "link",
    "pack",
    "workspace",
    "workspaces",
    "info",
    "set",
    "config",
    "node",
  ]),
  // npx's position 2 is an arbitrary package name (user content) → program-only.
  npx: new Set<string>(),
  dotnet: new Set([
    "build",
    "run",
    "test",
    "publish",
    "restore",
    "add",
    "remove",
    "new",
    "pack",
    "clean",
    "watch",
    "tool",
    "nuget",
    "sln",
    "format",
    "list",
  ]),
  cargo: new Set([
    "build",
    "run",
    "test",
    "check",
    "clippy",
    "fmt",
    "doc",
    "new",
    "init",
    "add",
    "remove",
    "update",
    "publish",
    "install",
    "bench",
    "clean",
    "fix",
    "tree",
    "search",
  ]),
  go: new Set([
    "build",
    "run",
    "test",
    "get",
    "install",
    "mod",
    "fmt",
    "vet",
    "generate",
    "doc",
    "clean",
    "list",
    "work",
    "tool",
    "version",
    "env",
  ]),
  gh: new Set([
    "pr",
    "issue",
    "repo",
    "release",
    "run",
    "workflow",
    "auth",
    "api",
    "gist",
    "browse",
    "status",
    "search",
    "label",
    "secret",
    "ssh-key",
    "gpg-key",
    "config",
    "alias",
    "extension",
  ]),
  glab: new Set([
    "mr",
    "issue",
    "repo",
    "release",
    "ci",
    "auth",
    "api",
    "alias",
    "config",
    "label",
    "pipeline",
    "snippet",
    "user",
    "variable",
  ]),
  kubectl: new Set([
    "get",
    "describe",
    "apply",
    "delete",
    "create",
    "logs",
    "exec",
    "scale",
    "rollout",
    "expose",
    "run",
    "set",
    "edit",
    "patch",
    "label",
    "annotate",
    "config",
    "cluster-info",
    "top",
    "cordon",
    "drain",
    "taint",
    "port-forward",
    "cp",
    "auth",
    "version",
    "explain",
  ]),
  aws: new Set([
    "s3",
    "s3api",
    "ec2",
    "iam",
    "lambda",
    "sts",
    "cloudformation",
    "ecr",
    "ecs",
    "eks",
    "dynamodb",
    "rds",
    "sns",
    "sqs",
    "logs",
    "ssm",
    "secretsmanager",
    "configure",
    "cloudwatch",
    "route53",
    "apigateway",
    "kms",
    "sso",
    "organizations",
  ]),
  gcloud: new Set([
    "compute",
    "container",
    "storage",
    "iam",
    "auth",
    "config",
    "projects",
    "functions",
    "run",
    "sql",
    "app",
    "builds",
    "logging",
    "pubsub",
    "services",
    "components",
    "init",
  ]),
  terraform: new Set([
    "init",
    "plan",
    "apply",
    "destroy",
    "validate",
    "fmt",
    "show",
    "output",
    "state",
    "import",
    "refresh",
    "workspace",
    "providers",
    "graph",
    "version",
    "console",
    "test",
  ]),
  vitest: new Set(["run", "watch", "bench", "list", "related", "init"]),
  // jest/pytest take test-file paths or `-k` patterns in position 2 (user content), not a
  // subcommand grammar → program-only.
  jest: new Set<string>(),
  pytest: new Set<string>(),
  ruff: new Set(["check", "format", "rule", "linter", "config", "clean", "version"]),
  // eslint/tsc take files+flags in position 2 (no subcommand grammar) → program-only.
  eslint: new Set<string>(),
  tsc: new Set<string>(),
  mvn: new Set([
    "compile",
    "test",
    "package",
    "install",
    "deploy",
    "clean",
    "verify",
    "validate",
    "site",
    "dependency",
  ]),
  gradle: new Set([
    "build",
    "test",
    "clean",
    "assemble",
    "check",
    "run",
    "tasks",
    "wrapper",
    "publish",
    "dependencies",
    "bootRun",
    "jar",
  ]),
};

// `docker` is special-cased below: a real subcommand set plus a `compose` three-part stem.
const DOCKER_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "build",
  "run",
  "ps",
  "images",
  "compose",
  "exec",
  "logs",
  "pull",
  "push",
  "stop",
  "start",
  "rm",
  "rmi",
  "inspect",
  "network",
  "volume",
  "tag",
  "login",
  "system",
  "cp",
  "commit",
  "create",
  "kill",
  "restart",
  "stats",
  "top",
  "version",
  "info",
  "container",
  "image",
]);
const DOCKER_COMPOSE_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "up",
  "down",
  "build",
  "logs",
  "ps",
  "run",
  "exec",
  "pull",
  "restart",
  "stop",
  "start",
  "config",
  "create",
  "kill",
  "rm",
  "top",
  "events",
]);

// Returns e.g. "git diff", "vitest run", "ruff check" — never file paths, flags, or user
// content. A position-≥2 token is emitted ONLY via a closed-vocabulary `.has()` hit.
export function commandStem(raw: string): string {
  let cmd = raw.trim();
  if (cmd.startsWith("tk ")) cmd = cmd.slice(3).trim();
  if (!cmd) return "";

  let tokens = splitCommandTokens(cmd);
  // Strip leading `KEY=value` env-assignment tokens (`DATABASE_URL=… npm run …`): they
  // are environment setup, not the program, and can carry secrets/URLs. Without this
  // the assignment was returned verbatim as the "redacted" stem (H1).
  while (tokens.length > 0 && /^[A-Za-z_]\w*=/.test(tokens[0]!)) tokens = tokens.slice(1);
  if (tokens.length === 0) return "";

  const program = tokens[0]!;
  // The program slot must pass the SAME arg-token guard as every other position — a
  // leading path / URL / hash / `=` token is never a stable program name and may leak
  // a secret, so generalize it rather than emit it raw (H1).
  if (isArgToken(program)) return "other";

  const second = tokens[1];
  if (second === undefined) return program;

  // docker: known subcommand, with a `compose <sub>` three-part stem gated by a closed
  // compose vocabulary. The third token is emitted only on a compose-set `.has()` hit.
  if (program === "docker") {
    if (!DOCKER_SUBCOMMANDS.has(second)) return program;
    if (second !== "compose") return `docker ${second}`;
    const third = tokens[2];
    if (third !== undefined && DOCKER_COMPOSE_SUBCOMMANDS.has(third)) {
      return `docker compose ${third}`;
    }
    return "docker compose";
  }

  // Every other program: emit the second token ONLY if it is a known subcommand.
  // `git` caps at two parts (program + subcommand) — git's third token is a ref/path/
  // pathspec (e.g. `git log <pattern>`, `git show <ref>`), i.e. user content, so it is
  // never emitted. rg/grep/curl/wget/psql have no vocabulary and fall through to program.
  const vocab = KNOWN_SUBCOMMANDS[program];
  if (vocab?.has(second)) return `${program} ${second}`;
  return program;
}
