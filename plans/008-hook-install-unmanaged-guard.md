# Plan 008: Refuse to overwrite an unmanaged copilot hook config on install

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- src/hook/install.ts tests/unit/hook/install.test.ts src/shim/init.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (install safety)
- **Planned at**: commit `0fcd6f6`, 2026-06-12 (added after counter-review — the original audit checked the marker guard on the Claude installer and on *uninstall*, and missed that copilot **install** overwrites without checking it)
- **Issue**: https://github.com/Cozy228/token-killer/issues/11

## Why this matters

`tk install --host copilot-cli` writes `~/.copilot/hooks/tk-rewrite.json` (or
`.github/hooks/tk-rewrite.json` with `--project`). The file carries a
`managedBy: "token-killer"` marker, and **uninstall** honors it ("only if the
marker proves we wrote it — never clobber a user's own hooks file"). But
**install** does not: `installCopilotHookConfig` overwrites any existing file at
that path whenever the bytes differ — including a file the user hand-edited
(changed the timeout, pointed the command elsewhere, disabled a hook) or a file
created by something else entirely. The filename is tk-specific, so cross-tool
collision is unlikely; the realistic damage is silently reverting a user's
deliberate edits every time `tk install` re-runs (and `tk install` is the
documented fix-everything command, so it re-runs often). Install must apply the
same marker discipline uninstall already does.

## Current state

- `src/hook/install.ts:26` — `const CONFIG_FILENAME = "tk-rewrite.json";`
- `src/hook/install.ts:86-102` — plan + write, no marker check:

  ```ts
  export function planCopilotHookConfig(loc: ConfigLocation): HookConfigPlan {
    const path = copilotHookConfigPath(loc);
    const contents = serialize(buildCopilotHookConfig());
    if (!existsSync(path)) return { path, action: "create", contents };
    const current = readFileSync(path, "utf8");
    return { path, action: current === contents ? "unchanged" : "overwrite", contents };
  }

  export function installCopilotHookConfig(loc: ConfigLocation): HookConfigPlan {
    const plan = planCopilotHookConfig(loc);
    if (plan.action !== "unchanged") {
      mkdirSync(dirname(plan.path), { recursive: true });
      writeFileSync(plan.path, plan.contents);
    }
    return plan;
  }
  ```

- `src/hook/install.ts:104-112` — `isManaged(path)`: parses the file, returns
  `parsed.managedBy === MARKER`; currently used only by
  `uninstallCopilotHookConfig` (line 114+, with the "never clobber" comment).
- `HookConfigPlan.action` is the union `"create" | "overwrite" | "unchanged"`
  (line 79-83); callers that surface install results live in the `tk install`
  flow (`src/shim/init.ts` orchestrates tiers — find the call site with
  `grep -rn "installCopilotHookConfig" src/`).
- Note: a legitimate "overwrite" happens on every tk upgrade/move — the config
  embeds absolute node+cli paths via `resolveHookCommand()` (line 38-42), so
  contents change whenever the install location changes. The fix must keep
  marker-bearing overwrites working; only **unmanaged** files are protected.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/hook/install.test.ts` | all pass |
| Full suite | `pnpm test:product`     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/hook/install.ts`
- `tests/unit/hook/install.test.ts`
- The one call site that surfaces the plan/result to the user (located via the
  grep above — expected in `src/shim/init.ts` or the install CLI flow): add the
  one-line warning only.

**Out of scope** (do NOT touch, even though they look related):
- `src/hook/claudeInstall.ts` — the Claude settings.json writer has its own
  (correct) marker discipline.
- `uninstallCopilotHookConfig` — already correct.
- `resolveHookCommand` / config contents — unchanged.
- Any interactive "force" flag — explicitly deferred; see Maintenance notes.

## Git workflow

- Branch: `advisor/008-hook-install-unmanaged-guard`
- Conventional commit, e.g. `fix(install): never overwrite an unmanaged copilot hook config`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a `skipped-unmanaged` outcome to the plan

In `planCopilotHookConfig`: when the file exists, differs, and
`!isManaged(path)` → return action `"skipped-unmanaged"` (extend the
`HookConfigPlan["action"]` union). `installCopilotHookConfig` writes only for
`"create" | "overwrite"`. A managed-but-different file keeps today's
`"overwrite"` behavior (the upgrade path). An unparseable existing file is
unmanaged by definition (`isManaged` returns false on parse failure) and is
therefore protected — same posture as `claudeInstall.ts`'s refuse-on-unparseable.

**Verify**: `pnpm typecheck` → exit 0 (call sites handling the union will
surface as errors — fix them in Step 2).

### Step 2: Surface the skip at the install call site

Where `tk install` reports what it wired (found via
`grep -rn "installCopilotHookConfig\|planCopilotHookConfig" src/`), print one
line for the new action, e.g.:
`hook config exists but is not managed by tk — left untouched: <path> (remove it and re-run tk install to adopt)`.
Match the surrounding output style of the install flow.

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Tests

In `tests/unit/hook/install.test.ts` (match existing temp-dir patterns there):

1. Existing file WITHOUT `managedBy: "token-killer"` + differing contents →
   action `"skipped-unmanaged"`, file bytes untouched.
2. Existing file WITH the marker + differing contents → `"overwrite"`, file
   replaced (upgrade path regression guard).
3. Unparseable existing file → `"skipped-unmanaged"`, untouched.
4. No file → `"create"` (unchanged behavior).
5. Identical file → `"unchanged"` (unchanged behavior).

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/hook/install.test.ts` → all pass, including the new cases.
**Verify**: `pnpm test:product` → all pass.

## Test plan

Step 3's five cases — two new protections, three regression guards. Pattern:
existing cases in `tests/unit/hook/install.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0
- [ ] `installCopilotHookConfig` cannot write over a file lacking the marker (test 1 + 3 pass)
- [ ] Managed-file upgrades still overwrite (test 2 passes)
- [ ] The skip is user-visible in `tk install` output (one line, with the path)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts don't match (drift).
- `planCopilotHookConfig`'s action union is consumed in more than ~3 places
  (wider blast radius than planned — report the call graph).
- You find install-side marker checking already added elsewhere (the fix may
  have landed independently).

## Maintenance notes

- Deferred deliberately: a `--force` adopt flag for unmanaged files; if users
  hit the skip message often, that's the follow-up.
- Reviewers: confirm the unparseable-file case is protected (it is the likelier
  real-world corruption) and the message names the exact path.
- The same install-vs-uninstall symmetry question is worth a glance at any
  future host adapter's config writer — make marker-check-on-install the
  default pattern.
