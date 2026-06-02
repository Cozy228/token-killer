# tg

`tg` is a TypeScript / Node.js command proxy inspired by RTK.

```bash
tg <original command> [...args]
```

The command after `tg` is the command you would normally run. `tg` executes it, captures stdout/stderr/exit code, compresses output locally, records token savings, and exits with the original command exit code.

## Usage

```bash
tg git status
tg git diff
tg rg "submitOrder" src
tg cat package.json
tg ls .
tg npm test
tg tsc --noEmit
```

## Flags

```bash
tg --raw <command...>
tg --stats <command...>
tg --verbose <command...>
tg --max-lines 200 <command...>
tg --max-chars 12000 <command...>
tg --save-raw <command...>
tg --no-save-raw <command...>
tg --report
tg --report --json
tg --report --csv
tg --help
tg --version
```

`## Token Savings` is not printed by default. It appears only with `--stats`, `--verbose`, or `--report`.

## Current Handler Coverage

Implemented:

- read-like: `cat`, `type`, `less`
- list-like: `ls`, `dir`, `find`, `tree`
- search-like: `rg`, `grep`
- git status
- git diff
- git log
- git show
- git branch
- pytest
- ruff
- mypy
- pip list/freeze
- npm/pnpm/yarn test, vitest, jest
- eslint
- tsc
- npm/pnpm/yarn list
- mvn/maven
- gradle
- javac
- generic fallback

Planned:

- broader fixture corpus for every handler
- more real-command integration tests when optional tools are installed
- per-handler raw-save and filter-fallback tests

## Development

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

Build output:

```text
dist/cli.js
```

The built CLI preserves the shebang and is exposed through npm:

```json
{
  "bin": {
    "tg": "./dist/cli.js"
  }
}
```
