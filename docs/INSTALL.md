# Installation and Internal Distribution

How to install `ctx` for end users and publish the package to a private npm registry.

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 22.18.0 or later |
| Package manager | pnpm (development) or npm (install) |

## End-user install

### From a private registry (recommended for teams)

```bash
# One-time: point your scope at the internal registry (see "Authenticate" below)
npm install -g @your-org/contexa

ctx --version
ctx --help
```

### From source (development)

```bash
git clone <repo-url> contexa
cd contexa
pnpm install
pnpm run build
npm link          # exposes `ctx` globally

ctx --version
```

### Wire into your agent host

```bash
ctx doctor                              # inspect delivery + metrics health (--fix to repair)
ctx install --host copilot-cli                  # Copilot CLI → hook tier
ctx install                                     # VS Code → shim tier (PATH wrappers)
ctx install --project                           # optional: project-level instruction injection
ctx uninstall                         # remove all ctx-installed artifacts
```

Data and config live under `~/.contexa/` (override with `CONTEXA_HOME`).

## Verify the install

```bash
pnpm run test:install     # from the repo: build + smoke checks
ctx ls .
ctx gain                 # measured savings (empty until commands run)
```

---

## Publish to an internal npm registry

### 1. Scope the package

Add `publishConfig` to `package.json`:

```json
{
  "name": "@your-org/contexa",
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

For GitHub Packages, also set `"repository": "github:your-org/contexa"` and use a
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
| `CTX_TELEMETRY_ENDPOINT` | `__CTX_TELEMETRY_ENDPOINT__` | `""` (network send inert) | `https://telemetry.internal.example/ingest` |
| `CTX_TELEMETRY_DEFAULT` | `__CTX_TELEMETRY_DEFAULT__` | `false` | `true` |

When `CTX_TELEMETRY_DEFAULT=true`:

- A **missing** `config.jsonc` reads `telemetry: true` (network upload opted in).
- `ctx config init` writes `"telemetry": true` in the template.
- Users can still opt out: `ctx telemetry disable` or edit `config.jsonc`.

Network upload still requires a non-empty `CTX_TELEMETRY_ENDPOINT` **and** `telemetry: true`.
Both build args are normally set together for internal distributions.

```bash
CTX_TELEMETRY_ENDPOINT=https://telemetry.internal.example/ingest \
CTX_TELEMETRY_DEFAULT=true \
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
CTX_TELEMETRY_ENDPOINT=https://telemetry.internal.example/ingest \
CTX_TELEMETRY_DEFAULT=true \
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
ctx uninstall
npm uninstall -g @your-org/contexa

# Optional: remove local data
rm -rf ~/.contexa
```
