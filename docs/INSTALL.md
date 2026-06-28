# Installation and Internal Distribution

How to install `tk` for end users and publish the package to a private npm registry.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| Package manager | pnpm (development) or npm (install) |

## End-user install

### From a private registry (recommended for teams)

```bash
# One-time: point your scope at the internal registry (see "Authenticate" below)
npm install -g @your-org/token-killer

tk --version
tk --help
```

### From source (development)

```bash
git clone <repo-url> token-killer
cd token-killer
pnpm install
pnpm run build
npm link          # exposes `tk` globally

tk --version
```

### Wire into your agent host

```bash
tk doctor                              # inspect delivery + metrics health (--fix to repair)
tk install --host copilot-cli                  # Copilot CLI → hook tier
tk install                                     # VS Code → shim tier (PATH wrappers)
tk install --project                           # optional: project-level instruction injection
tk uninstall                         # remove all tk-installed artifacts
```

Data and config live under `~/.token-killer/` (override with `TOKEN_KILLER_HOME`).

## Verify the install

```bash
pnpm run test:install     # from the repo: build + smoke checks
tk ls .
tk gain                 # measured savings (empty until commands run)
```

---

## Publish to an internal npm registry

### 1. Scope the package

Add `publishConfig` to `package.json`:

```json
{
  "name": "@your-org/token-killer",
  "version": "0.1.0",
  "publishConfig": {
    "registry": "https://npm.your-company.com/",
    "access": "restricted"
  }
}
```

Common registry URLs:

| Platform | `publishConfig.registry` |
|---|---|
| Verdaccio / Artifactory / private npm mirror | `https://npm.your-company.com/` |
| GitHub Packages | `https://npm.pkg.github.com` |
| Azure Artifacts | `https://pkgs.dev.azure.com/<org>/<project>/_packaging/<feed>/npm/registry/` |

For GitHub Packages, also set `"repository": "github:your-org/token-killer"` and use a
`@your-org` scope matching the GitHub org.

### 2. Authenticate

Add the matching block to `~/.npmrc` (user machine) or inject via CI env vars. **Never
commit real tokens.**

**Private registry (Verdaccio / Artifactory / internal mirror):**

```ini
@your-org:registry=https://npm.your-company.com/
//npm.your-company.com/:_authToken=${NPM_TOKEN}
```

**GitHub Packages:**

```ini
@your-org:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

**CI (GitHub Actions example):**

```yaml
- run: npm publish --access restricted
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Point `NODE_AUTH_TOKEN` at the registry token; npm reads `//npm.your-company.com/:_authToken`
from the job's generated `.npmrc` when you use `actions/setup-node` with `registry-url`.

### 3. Build args (internal / enterprise)

Bake these at **compile time** via `tsdown` `define` (set in the build env, not on end-user
machines):

| Build env | Baked constant | Generic default | Internal build |
|---|---|---|---|
| `TK_TELEMETRY_ENDPOINT` | `__TK_TELEMETRY_ENDPOINT__` | `""` (network send inert) | `https://telemetry.internal.example/ingest` |
| `TK_TELEMETRY_DEFAULT` | `__TK_TELEMETRY_DEFAULT__` | `false` | `true` |

When `TK_TELEMETRY_DEFAULT=true`:

- A **missing** `config.jsonc` reads `telemetry: true` (network upload opted in).
- `tk config init` writes `"telemetry": true` in the template.
- Users can still opt out: `tk telemetry disable` or edit `config.jsonc`.

Network upload still requires a non-empty `TK_TELEMETRY_ENDPOINT` **and** `telemetry: true`.
Both build args are normally set together for internal distributions.

```bash
TK_TELEMETRY_ENDPOINT=https://telemetry.internal.example/ingest \
TK_TELEMETRY_DEFAULT=true \
pnpm run build
```

### 4. Build and publish

```bash
pnpm install
pnpm run typecheck
pnpm run test:ci

# Generic (public-style) build:
pnpm run build

# Internal build (telemetry on by default + endpoint):
TK_TELEMETRY_ENDPOINT=https://telemetry.internal.example/ingest \
TK_TELEMETRY_DEFAULT=true \
pnpm run build

npm publish --access restricted
```

Only `dist/` and `README.md` are included in the tarball (`package.json` → `files`).

### 5. Version bumps

Follow [Conventional Commits](https://www.conventionalcommits.org/). Bump `version` in
`package.json` before each publish.

---

## Uninstall

```bash
tk uninstall
npm uninstall -g @your-org/token-killer

# Optional: remove local data
rm -rf ~/.token-killer
```
