## 需求 L — Distribution / runtime (Windows primary)

本节是「ONE BACKEND, TWO SURFACES (codemap = agent, codeguide = human), TWO FRONT-ENDS」骨架的**承载层**：graph store（C）+ WASM tree-sitter 抽取器（D）这套东西必须能在企业 Windows 上**真正跑起来**，否则 B（agent 省 token）和 A（人理解）都无从谈起。全节抄自 codegraph 已验证的分发配方（license MIT，无限制），按 tk 现状改写。所有引用代码均已逐一对照 clone 确认。

依赖锚定：上游冲突已裁决为 D 的版本带 `>=22.5.0 <25.0.0` + vendored Node 24.x + `--liftoff-only` 强制（因为 A/D 已确认 ship tree-sitter WASM）。本节据此关闭 L5/L7 的相关 Open Decisions：Node 25 排除、`--liftoff-only` 必带；同时按 C↔L 冲突裁决把 DB 落在 out-of-tree 用户目录（`.tk/` 只放人类共享工件）。

---

### L1 决策 — 双通道：npm thin-shim 为主 + vendored-Node bundle-installer 为备（serves both surfaces）

**(1) 决策**：分发走双通道。PRIMARY = `npm i -g token-killer`，主包是用户自己 Node 跑的极薄 CJS shim；per-platform vendored-Node bundle 作为 `optionalDependencies`（os/cpu 字段，npm 只下匹配的那个），并带 GitHub Releases self-heal 下载兜底。FALLBACK = `install.ps1`（`irm … | iex`）/ `install.sh`（`curl | sh`）拉同一批 per-platform `.zip`/`.tar.gz`，**完全不需要 Node**。排除 bundle-only（绕开 npm 肌肉记忆 + 体积大）和 npm+native-build（node-gyp/MSVC 在企业 Windows 缺席）。

**(2) 要动的文件**：
```
token-killer/
  scripts/
    build-bundle.sh        # 新建 — 单 Linux runner 出 6 平台 bundle
    pack-npm.sh            # 新建 — 打 shim 主包 + per-platform 包
    npm-shim.js            # 新建 — CJS 启动器（用户 Node 跑），是主包的 bin
  install.ps1             # 新建 — Windows 独立安装器
  install.sh             # 新建 — macOS/Linux 独立安装器
  src/
    bin/node-version-check.ts   # 新建 — 版本 banner + MIN_NODE_MAJOR
    runtime/relaunch-flags.ts   # 新建 — guarded self-re-exec（L7）
  package.json           # 改 — engines、bin 形态由本节决定（见 L2/L6）
```

**(3) 可抄代码**：见 L2–L9 各子决策的代码块（本决策是路线总览，无独立代码）。

**(4) 具体数值**：通道数 = 2；platform target 数 = 6（见 L8）；vendored Node = v24.16.0；Node 硬下限 major = 22（`node:sqlite` 首个稳定带 WAL+FTS5）；Node 上限排除 = 25.x。

**(5) 有序步骤**：① L2 落 npm-shim.js + package.json 形态 → ② L8 落 build-bundle.sh（出 win32-x64 bundle 即可独立验证）→ ③ L3 self-heal → ④ L9/L10 独立安装器 → ⑤ L6 版本 gate → ⑥ L7 warning 抑制。每步可独立 release/test。

**(6) 测试**：smoke 矩阵——在「无系统 Node 的 Windows VM」跑 `irm install.ps1|iex` 后 `tk --version` 返回；在「Node 22.5 用户 Node」跑 `npm i -g token-killer` 后 `tk --version` 返回；断言 shim 主包 tarball ≤ 200KB（`pnpm pack` 后 `wc -c`）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/BUNDLING.md:36-65`（双配方）；codegraph issue #303（cnpm 不镜像 optionalDependencies）。

---

### L2 决策 — 主 npm 包 = 极薄 CJS shim，bundle 作 optionalDependencies（serves both surfaces）

**(1) 决策**：主包 = `npm-shim.js`（用户 Node 跑，纯启动器，即使古老 Node 也能跑这一个文件）。per-platform bundle 命名 `token-killer-<platform>-<arch>`，带 `os`/`cpu` 字段（esbuild 模式），列入主包 `optionalDependencies`，npm 只下匹配 host 的那一个。bundle 布局：根 `node`/`node.exe`，`lib/dist` + `lib/node_modules`，`bin/` launcher。tk 保留 shim 包自身零运行时依赖、纯 JS（≤200KB tarball 性质守在常见路径上）。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（新建），`token-killer/scripts/pack-npm.sh`（新建），`package.json` 的 `bin`/`main`/`optionalDependencies`（由 pack-npm.sh 在 release 时生成）。

**(3) 可抄代码**：

resolveInstalledBundle（已改写：包名 `@colbymchenry/codegraph-*` → `token-killer-*`，entry `codegraph.js` → `cli.js`；其余逐字）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:34-72`
```js
// npm-shim.js（已改写包名/入口；其余逐字抄 codegraph）
var childProcess = require('child_process');
var fs = require('fs'); var os = require('os'); var path = require('path');

var target = process.platform + '-' + process.arch;     // darwin-arm64, win32-x64 …
var pkg = 'token-killer-' + target;                       // 改写：无 scope
var isWindows = process.platform === 'win32';
var REPO = 'cozy228/token-killer';                        // 改写：tk repo

main().catch(function (e) {
  process.stderr.write('tk: ' + (e && e.message ? e.message : String(e)) + '\n');
  process.exit(1);
});

async function main() {
  var resolved = resolveInstalledBundle() || (await selfHealBundle());
  var res = childProcess.spawnSync(resolved.command, resolved.args, { stdio: 'inherit' });
  if (res.error) { process.stderr.write('tk: ' + res.error.message + '\n'); process.exit(1); }
  process.exit(res.status === null ? 1 : res.status);
}

// Resolve the launcher from the installed per-platform optionalDependency.
function resolveInstalledBundle() {
  try {
    if (isWindows) {
      // Node 24 refuses to spawn the bundle's .cmd (EINVAL, CVE-2024-27980
      // hardening), so invoke the bundled node.exe directly against the entry.
      var nodeExe = require.resolve(pkg + '/node.exe');
      var entry = require.resolve(pkg + '/lib/dist/bin/cli.js');   // 改写：cli.js
      return { command: nodeExe, args: runtimeFlags(entry) };
    }
    return { command: require.resolve(pkg + '/bin/tk'), args: process.argv.slice(2) };
  } catch (e) { return null; }
}
```

pack-npm.sh 的 per-platform 包 manifest + 主包 manifest（已改写：scope 去掉、`codegraph` → `tk`/`token-killer`、bin 名 `tk`、入口 `cli.js`、license `MIT`）。源: `/tmp/tk-research/codegraph/scripts/pack-npm.sh:59-116`
```bash
# per-platform 包 manifest（已改写名字/bin）
VERSION="$VERSION" TARGET="$target" OSV="$os" ARCHV="$arch" NODEFILE="$nodefile" \
  node -e '
    const fs=require("fs");
    fs.writeFileSync(process.argv[1], JSON.stringify({
      name: `token-killer-${process.env.TARGET}`,
      version: process.env.VERSION,
      description: `token-killer self-contained bundle for ${process.env.TARGET}`,
      os: [process.env.OSV], cpu: [process.env.ARCHV],
      files: [process.env.NODEFILE, "lib", "bin"],
      license: "MIT"
    }, null, 2) + "\n");
  ' "$pkgdir/package.json"

# 主 shim 包 manifest（已改写 bin=tk、main=npm-shim.js、optionalDependencies=每平台）
VERSION="$VERSION" TARGETS="${targets[*]}" \
  node -e '
    const fs=require("fs");
    const opt={};
    for (const t of process.env.TARGETS.split(/\s+/).filter(Boolean))
      opt[`token-killer-${t}`]=process.env.VERSION;
    fs.writeFileSync(process.argv[1], JSON.stringify({
      name: "token-killer",
      version: process.env.VERSION,
      description: "Local-first code intelligence + token compression for AI agents. Self-contained.",
      bin: { tk: "npm-shim.js" },
      optionalDependencies: opt,
      files: ["npm-shim.js","dist","README.md"],
      engines: { node: ">=22.5.0 <25.0.0" },
      license: "MIT"
    }, null, 2) + "\n");
  ' "$NPM/main/package.json"
```

**(4) 具体数值**：shim 包 `files` 仅 `npm-shim.js`+`dist`(.d.ts)+`README.md`；shim tarball 目标 ≤200KB；platform 包名前缀固定 `token-killer-`；optionalDependencies 条目数 = 6。

**(5) 有序步骤**：① 写 npm-shim.js（先只走 `resolveInstalledBundle` 分支，self-heal 留 L3）→ ② 写 pack-npm.sh 生成两类 manifest → ③ `npm publish` dry-run 验证主包只含 shim+types。

**(6) 测试**：unit——mock `require.resolve('token-killer-win32-x64/node.exe')` 命中时 `resolveInstalledBundle()` 返回 `{command: …node.exe, args:['--liftoff-only','--disable-warning=ExperimentalWarning', entry, …]}`；fixture——`pack-npm.sh` 产出的主包 `package.json.optionalDependencies` 含 6 个 `token-killer-*` key。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:34-72`、`pack-npm.sh:59-116`。

---

### L3 决策 — self-heal：optionalDependency 缺失时从 GitHub Releases 直拉 bundle（serves both surfaces）

**(1) 决策**：当匹配的 optionalDependency 解析不到（cnpm/企业镜像静默丢弃），shim 直接从 GitHub Releases 下匹配 bundle 到 `~/.token-killer/bundles/<target>-<version>`，有 `SHA256SUMS` 时校验，原子 rename（同 fs 无 EXDEV），用系统 `tar` 解包（Win10+ 自带 bsdtar 可读 zip）。环境旋钮：`TK_NO_DOWNLOAD=1`、`TK_INSTALL_DIR=DIR`、`TK_DOWNLOAD_BASE=URL`。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（续写 `selfHealBundle`/`download`/`extract`/`verifyChecksum`）。

**(3) 可抄代码**：

selfHealBundle + verifyChecksum + extract（已改写：env 前缀 `CODEGRAPH_` → `TK_`、cache 目录 `.codegraph` → `.token-killer/bundles`、asset 名 `codegraph-` → `token-killer-`、UA 字符串）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:100-231`
```js
// selfHealBundle（已改写 env/路径/asset 前缀；逻辑逐字抄）
async function selfHealBundle() {
  var version = readVersion();
  var bundlesDir = path.join(process.env.TK_INSTALL_DIR
    || path.join(os.homedir(), '.token-killer'), 'bundles');
  var dest = path.join(bundlesDir, target + '-' + version);

  var cached = launcherIn(dest);
  if (cached) return cached;                       // 已下过：即便禁下载也用
  if (process.env.TK_NO_DOWNLOAD) fail('network fallback disabled (TK_NO_DOWNLOAD).');

  var asset = 'token-killer-' + target + (isWindows ? '.zip' : '.tar.gz');
  var base = process.env.TK_DOWNLOAD_BASE
    || ('https://github.com/' + REPO + '/releases/download');
  var url = base + '/v' + version + '/' + asset;

  // Stage inside bundlesDir → final rename is same-fs (atomic, no EXDEV).
  fs.mkdirSync(bundlesDir, { recursive: true });
  var stage = fs.mkdtempSync(path.join(bundlesDir, '.dl-'));
  try {
    var archivePath = path.join(stage, asset);
    await download(url, archivePath, 6);
    await verifyChecksum(archivePath, asset, base, version);
    var extracted = path.join(stage, 'bundle');
    fs.mkdirSync(extracted);
    extract(archivePath, extracted);
    var raced = launcherIn(dest);
    if (raced) { rmrf(stage); return raced; }
    try { fs.renameSync(extracted, dest); }
    catch (e) { var other = launcherIn(dest); if (other) { rmrf(stage); return other; } throw e; }
  } catch (e) { rmrf(stage); fail('download failed (' + e.message + ').\n  URL: ' + url); }
  rmrf(stage);
  var ready = launcherIn(dest);
  if (!ready) fail('downloaded bundle is missing its launcher under ' + dest + '.');
  return ready;
}

// 解包用系统 tar（macOS/Linux/Win10+ 都有；bsdtar 读 zip）。逐字抄。
function extract(archive, destDir) {
  var args = isWindows
    ? ['-xf', archive, '-C', destDir, '--strip-components=1']
    : ['-xzf', archive, '-C', destDir, '--strip-components=1'];
  var res = childProcess.spawnSync('tar', args, { stdio: 'ignore' });
  if (res.error) throw new Error('tar unavailable: ' + res.error.message);
  if (res.status !== 0) throw new Error('tar exited ' + res.status);
}

// rmrf：注意 L12 不变量——这里抄的是 force 版，下载 staging 改用 maxRetries（见 L12）
function rmrf(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) {} }
```

verifyChecksum 逐字（仅注释里的产品名无须改）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:196-216`
```js
// Best-effort：有 SHA256SUMS 则必须匹配否则 abort；文件缺失/不可达则放行（TLS 已护）。
async function verifyChecksum(archivePath, asset, base, version) {
  var sumsPath = archivePath + '.SHA256SUMS';
  try { await download(base + '/v' + version + '/SHA256SUMS', sumsPath, 6); }
  catch (e) { return; }                                    // 未发布/不可达 → skip
  var expected = null;
  var lines = fs.readFileSync(sumsPath, 'utf8').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
    if (m && path.basename(m[2].trim()) === asset) { expected = m[1].toLowerCase(); break; }
  }
  if (!expected) return;
  var actual = require('crypto').createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
  if (actual !== expected) throw new Error('checksum mismatch for ' + asset);
}
```

**(4) 具体数值**：download HTTP 重定向上限 = 6 跳；连接 idle timeout = 30000ms；cache 目录默认 `~/.token-killer/bundles`；rmrf maxRetries=5 / retryDelay=100ms（L12 不变量）。

**(5) 有序步骤**：① 接上 L2 的 npm-shim.js，补 `selfHealBundle`/`download`/`verifyChecksum`/`extract`/`launcherIn`/`rmrf`/`fail` → ② 本步可在「故意 `npm i --no-optional`」场景独立验证。

**(6) 测试**：integration——本地起一个 fake release HTTP server，`npm i --omit=optional` 装主包后 `TK_DOWNLOAD_BASE=http://127.0.0.1:PORT tk --version` 成功，断言 `~/.token-killer/bundles/<target>-<ver>/node(.exe)` 存在；assertion——`SHA256SUMS` 故意改一字节 → 命令 abort 且退出码非 0。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:100-231`；issue #303。

---

### L4 决策 — Windows 上 shim 直呼 bundled node.exe，绝不走 .cmd launcher（serves both surfaces）

**(1) 决策**：Windows shim 用 `require.resolve(pkg+'/node.exe')` + `require.resolve(pkg+'/lib/dist/bin/cli.js')`，直接 spawn `node.exe`，**永不** spawn `.cmd`/`.bat`。原因：现代 Node（24，CVE-2024-27980 加固）spawn `.cmd`/`.bat` 抛 EINVAL。这是 Windows shim 最关键单点。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（`resolveInstalledBundle`/`launcherIn` 的 isWindows 分支，已在 L2 代码内）。

**(3) 可抄代码**：launcherIn（从已下载 bundle 目录解析 launcher，同 node/lib/bin 布局；已改写 entry `codegraph.js`→`cli.js`、unix bin `codegraph`→`tk`）。源: `/tmp/tk-research/codegraph/scripts/npm-shim.js:77-89`
```js
function launcherIn(dir) {
  if (isWindows) {
    var nodeExe = path.join(dir, 'node.exe');
    var entry = path.join(dir, 'lib', 'dist', 'bin', 'cli.js');     // 改写：cli.js
    if (fs.existsSync(nodeExe) && fs.existsSync(entry))
      return { command: nodeExe, args: runtimeFlags(entry) };
  } else {
    var launcher = path.join(dir, 'bin', 'tk');                      // 改写：tk
    if (fs.existsSync(launcher)) return { command: launcher, args: process.argv.slice(2) };
  }
  return null;
}
```

**(4) 具体数值**：Windows spawn target 文件名固定 `node.exe`（非 `.cmd`）；entry 相对路径固定 `lib/dist/bin/cli.js`。

**(5) 有序步骤**：随 L2/L3 一并落地（同一文件）。

**(6) 测试**：unit——`launcherIn(dir)` 在 win32 mock 下 `command` 以 `node.exe` 结尾、`args[0..1]` 为 runtime flags、`args[2]` 以 `cli.js` 结尾；负向断言——`command` 不含 `.cmd`/`.bat`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:60-66,77-89`；CVE-2024-27980。

---

### L5 决策 — vendored Node 钉在 v24.16.0，硬下限 22.5.0，排除 25.x（serves both surfaces）

**(1) 决策**：bundle 内 vendored Node 钉 **v24.16.0**（24.x LTS-line，`node:sqlite` WAL+FTS5 稳定）；硬地板 **22.5.0**（`node:sqlite` DatabaseSync 首版）；bundle **绝不带 25.x**（V8 turboshaft WASM Zone OOM，因 A/D 已确认 tk ship tree-sitter WASM → 此前的「contingent」关闭，25 排除是确定项）。冲突裁决：单一 gate = `engines.node ">=22.5.0 <25.0.0"`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（`NODE_VERSION` 默认值）；`package.json` 的 `engines`。

**(3) 可抄代码**：build-bundle.sh 的版本钉死行（逐字）。源: `/tmp/tk-research/codegraph/scripts/build-bundle.sh:23-24`
```bash
TARGET="${1:?usage: build-bundle.sh <target> [node-version]}"
NODE_VERSION="${2:-v24.16.0}"      # 钉死：node:sqlite WAL+FTS5 稳定的 24.x LTS-line
```

**(4) 具体数值**：vendored Node = `v24.16.0`；硬下限 major = 22（精确 22.5.0）；上限排除 = 25.x（`<25.0.0`）。

**(5) 有序步骤**：① build-bundle.sh 默认 `v24.16.0` → ② package.json `engines` 改 `">=22.5.0 <25.0.0"`（仅 install-time warning，硬阻断见 L6）。

**(6) 测试**：assertion——bundle 内 `./node.exe --version`（或 `./node --version`）输出以 `v24.` 开头；fixture——`package.json.engines.node === ">=22.5.0 <25.0.0"`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/build-bundle.sh:24`、`src/extraction/wasm-runtime-flags.ts:7-10`（25 因 WASM OOM 被排除）。

---

### L6 决策 — Node 版本 gate = bootstrap 硬阻断（不止 engines），ASCII banner + exit 1（serves both surfaces）

**(1) 决策**：版本 gate 在 cli 入口做 **bootstrap 硬阻断**（`engines` 只在 install 警告，必须运行时硬挡才真正挡住）。`MIN_NODE_MAJOR=22`（从 tk 现 `>=20` 抬升，因 `node:sqlite` 需 22.5）；major ≥25 也挡（WASM OOM）。bordered ASCII banner（OEM-codepage 安全）+ exit 1；`TK_ALLOW_UNSAFE_NODE=1` 可越权。注意：此 gate 只在「用户老 Node 跑 npm-shim」路径触发，bundle 路径永远是 24。

**(2) 要动的文件**：`token-killer/src/bin/node-version-check.ts`（新建，banner + MIN_NODE_MAJOR）；tk cli 入口（`src/cli.ts` 顶部插入 gate）。

**(3) 可抄代码**：

node-version-check.ts（已改写：`MIN_NODE_MAJOR` 20→22、产品名 CodeGraph→token-killer、env `CODEGRAPH_ALLOW_UNSAFE_NODE`→`TK_ALLOW_UNSAFE_NODE`；banner 结构 + ASCII sep 逐字）。源: `/tmp/tk-research/codegraph/src/bin/node-version-check.ts:20-76`
```ts
// src/bin/node-version-check.ts（已改写产品名/env/MIN；banner ASCII 结构逐字抄）
export const MIN_NODE_MAJOR = 22;   // 改写：20→22（node:sqlite DatabaseSync 需 22.5）

export function buildNodeTooOldBanner(nodeVersion: string): string {
  const sep = '-'.repeat(72);       // ASCII glyph：GBK/OEM 控制台安全
  return [
    sep,
    `[token-killer] Unsupported Node.js version: ${nodeVersion}`,
    sep,
    `token-killer requires Node.js ${MIN_NODE_MAJOR}.5 or newer. node:sqlite (the`,
    'graph store) is unavailable below 22.5, and older versions are untested.',
    '',
    'Fix: install Node.js 22 LTS:',
    '  nvm install 22 && nvm use 22                          # nvm',
    '  brew install node@22 && brew link --overwrite --force node@22  # Homebrew',
    '',
    'To override (NOT recommended - unsupported):',
    '  TK_ALLOW_UNSAFE_NODE=1 tk ...',
    sep,
  ].join('\n');
}

export function buildNode25BlockBanner(nodeVersion: string): string {
  const sep = '-'.repeat(72);
  return [
    sep,
    `[token-killer] Unsupported Node.js version: ${nodeVersion}`,
    sep,
    'Node.js 25.x has a V8 WASM JIT (turboshaft) Zone allocator bug that',
    'crashes with `Fatal process out of memory: Zone` when compiling',
    'tree-sitter grammars. token-killer WILL crash mid-indexing on this Node.',
    '',
    'Fix: install Node.js 22 LTS (see above). To override (NOT recommended):',
    '  TK_ALLOW_UNSAFE_NODE=1 tk ...',
    sep,
  ].join('\n');
}
```

cli 入口硬阻断（已改写 env、产品名；版本解析 + 双 banner 分支逐字）。源: `/tmp/tk-research/codegraph/src/bin/codegraph.ts:67-85`
```ts
// src/cli.ts 顶部（在任何 node:sqlite / WASM 工作之前）
import { buildNode25BlockBanner, buildNodeTooOldBanner, MIN_NODE_MAJOR } from './bin/node-version-check';
const nodeVersion = process.versions.node;
const nodeMajor = parseInt(nodeVersion.split('.')[0] ?? '0', 10);
if (nodeMajor >= 25) {
  process.stderr.write(buildNode25BlockBanner(nodeVersion) + '\n');
  if (!process.env.TK_ALLOW_UNSAFE_NODE) process.exit(1);
}
if (nodeMajor < MIN_NODE_MAJOR) {
  process.stderr.write(buildNodeTooOldBanner(nodeVersion) + '\n');
  if (!process.env.TK_ALLOW_UNSAFE_NODE) process.exit(1);
}
```

**(4) 具体数值**：`MIN_NODE_MAJOR = 22`；阻断 major ≥25；banner 宽 = 72 字符（`'-'.repeat(72)`）；越权 env = `TK_ALLOW_UNSAFE_NODE`。

**(5) 有序步骤**：① 写 node-version-check.ts → ② cli 入口插 gate（在 `node:sqlite` import 之前）→ ③ 独立可测。

**(6) 测试**：unit——pin banner 文本（断言含 `TK_ALLOW_UNSAFE_NODE` 和「22.5」recovery 行，防被未来编辑剥掉）；integration——`node@20` 跑 `tk` 退出码 1 且 stderr 含 banner，设 `TK_ALLOW_UNSAFE_NODE=1` 后继续。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/bin/codegraph.ts:67-85`、`node-version-check.ts:48,58-76`。

---

### L7 决策 — node:sqlite ExperimentalWarning 抑制：bundle 路径加 flag，user-Node 22.5–23 路径 guarded re-exec（serves the codemap agent surface）

**(1) 决策**：`node:sqlite` 在 22.5–23 会打 `ExperimentalWarning: SQLite is an experimental feature`，污染 agent 抓取的 stdout/stderr（B：token 成本 + parse 噪声）。两条路径：(a) bundle 路径（Node 24）由 launcher 命令行带 `--disable-warning=ExperimentalWarning`（Node 24 支持）；(b) 罕见的 npm-shim-on-user-Node-22.5..23 路径，做 guarded self-re-exec——flag 不存在且 guard env 未设时，用 `--disable-warning=ExperimentalWarning` 重入，exit 子进程状态；spawn 失败则 fall-through 跑 in-process（warning 仅是表层）。复用 codegraph `relaunchWithWasmRuntimeFlagsIfNeeded` 模板，把 `--liftoff-only` 换成 `--disable-warning=ExperimentalWarning`（注：因 ship WASM，`--liftoff-only` 也仍要带，见下 runtimeFlags）。

**(2) 要动的文件**：`token-killer/src/runtime/relaunch-flags.ts`（新建，guarded re-exec）；`token-killer/scripts/npm-shim.js`（新增 `runtimeFlags(entry)` helper，L2/L4 已引用）。

**(3) 可抄代码**：

guarded self-re-exec（已改写：flag 集合 `--liftoff-only` → `--liftoff-only` + `--disable-warning=ExperimentalWarning`、env `CODEGRAPH_*` → `TK_*`、产品名；env-guard 防死循环 + windowsHide + fall-through-on-error 逐字）。源: `/tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:41-110`
```ts
// src/runtime/relaunch-flags.ts（已改写 flag 集/env；env-guard+windowsHide+fall-through 逐字）
import { spawnSync } from 'child_process';

// ship tree-sitter WASM → 两个 flag 都要：--liftoff-only 防 WASM Zone OOM；
// --disable-warning 抑制 node:sqlite ExperimentalWarning（污染 agent stdout）。
export const RUNTIME_FLAGS: readonly string[] = [
  '--liftoff-only',
  '--disable-warning=ExperimentalWarning',
];
const RELAUNCH_GUARD_ENV = 'TK_RUNTIME_RELAUNCHED';

export function processHasRuntimeFlags(execArgv: readonly string[] = process.execArgv): boolean {
  return RUNTIME_FLAGS.every((flag) => execArgv.includes(flag));
}

export function buildRelaunchArgv(
  scriptPath: string, scriptArgs: readonly string[],
  execArgv: readonly string[] = process.execArgv,
): string[] {
  const preserved = execArgv.filter((arg) => !RUNTIME_FLAGS.includes(arg));
  return [...RUNTIME_FLAGS, ...preserved, scriptPath, ...scriptArgs];
}

export function relaunchWithRuntimeFlagsIfNeeded(scriptPath: string): void {
  if (processHasRuntimeFlags()) return;
  if (process.env[RELAUNCH_GUARD_ENV]) return;
  if (process.env.TK_NO_RELAUNCH) return;
  const argv = buildRelaunchArgv(scriptPath, process.argv.slice(2));
  const result = spawnSync(process.execPath, argv, {
    stdio: 'inherit',
    env: { ...process.env, [RELAUNCH_GUARD_ENV]: '1' },
    windowsHide: true,
  });
  if (result.error) return;                 // 降级不崩：fall-through 跑 in-process
  process.exit(result.status ?? (result.signal ? 1 : 0));
}
```

npm-shim.js 的 runtimeFlags helper（已改写：codegraph 的 `liftoff(entry)` 只带一个 flag → tk 带两个）。源对照: `/tmp/tk-research/codegraph/scripts/npm-shim.js:94-96`（`liftoff` 模板）
```js
// npm-shim.js：Windows 直呼 node.exe 时把两个 runtime flag 放命令行（warning 在模块加载时发，必须命令行）
function runtimeFlags(entry) {
  return ['--liftoff-only', '--disable-warning=ExperimentalWarning', entry]
    .concat(process.argv.slice(2));
}
```

**(4) 具体数值**：runtime flags = `['--liftoff-only','--disable-warning=ExperimentalWarning']`（2 个）；re-exec guard env = `TK_RUNTIME_RELAUNCHED`；禁用 re-exec env = `TK_NO_RELAUNCH`；最多 re-exec 1 次。

**(5) 有序步骤**：① 写 relaunch-flags.ts → ② cli 入口在 L6 gate 之后、`node:sqlite` import 之前调 `relaunchWithRuntimeFlagsIfNeeded(__filename)` → ③ npm-shim.js 加 `runtimeFlags`，bundle launcher（L8）已带这两 flag → bundle 路径不触发 re-exec。

**(6) 测试**：unit——`buildRelaunchArgv('cli.js',['index'])` 头两元素 = 两个 flag；integration——`node@22.6`（无 flag）跑 `tk` 时 stderr 不含 `ExperimentalWarning`（验证 re-exec 生效），且 `TK_RUNTIME_RELAUNCHED=1` 已设的子进程不再二次 re-exec（无死循环）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/extraction/wasm-runtime-flags.ts:92-110`（re-exec 模板）、`scripts/npm-shim.js:94-96`（flag-on-cmdline）。

---

### L8 决策 — 一脚本 6 平台 bundle，单 Linux runner，零 native addon（serves both surfaces）

**(1) 决策**：`scripts/build-bundle.sh <target> [node-version]` 在单 Linux runner 出每个平台 bundle（下官方 Node → `npm ci --omit=dev --ignore-scripts` → copy dist → 写 launcher → archive）。Targets = `win32-x64 win32-arm64 darwin-arm64 darwin-x64 linux-x64 linux-arm64`。Windows → `.zip` + `node.exe`；unix → `.tar.gz` + sh launcher。因零 native addon，任意 target 可在任意 OS 构建。launcher 命令行带 `--liftoff-only --disable-warning=ExperimentalWarning`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（新建）。

**(3) 可抄代码**：build-bundle.sh 主体（已改写：产品名 codegraph→token-killer、entry `codegraph.js`→`cli.js`、launcher 名 `codegraph`/`codegraph.cmd`→`tk`/`tk.cmd`、launcher 加 `--disable-warning` flag；下载/stage/archive 逐字）。源: `/tmp/tk-research/codegraph/scripts/build-bundle.sh:21-117`
```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:?usage: build-bundle.sh <target> [node-version]}"
NODE_VERSION="${2:-v24.16.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="$ROOT/release"; WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ARCH="${TARGET##*-}"; OSFAM="${TARGET%-*}"

# 1. 下载官方 Node runtime
if [ "$OSFAM" = "win32" ]; then
  NODE_DIST="node-${NODE_VERSION}-win-${ARCH}"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.zip" -o "$WORK/node.zip"
  if command -v unzip >/dev/null 2>&1; then unzip -q "$WORK/node.zip" -d "$WORK";
  else tar -xf "$WORK/node.zip" -C "$WORK"; fi      # bsdtar 可读 zip
  NODE_BIN="$WORK/${NODE_DIST}/node.exe"
else
  NODE_DIST="node-${NODE_VERSION}-${TARGET}"
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}.tar.gz" -o "$WORK/node.tar.gz"
  tar -xzf "$WORK/node.tar.gz" -C "$WORK"
  NODE_BIN="$WORK/${NODE_DIST}/bin/node"
fi
[ -f "$NODE_BIN" ] || { echo "[bundle] node binary not found ($NODE_BIN)" >&2; exit 1; }

# 2. build app（改写：tk 的构建命令）
( cd "$ROOT" && pnpm run build >/dev/null )         # 改写：pnpm（项目硬约束）

# 3. stage app + production deps（纯 JS/wasm → 跨平台可移植）
STAGE="$WORK/token-killer-${TARGET}"
mkdir -p "$STAGE/lib" "$STAGE/bin"
cp -R "$ROOT/dist" "$STAGE/lib/dist"
cp "$ROOT/package.json" "$STAGE/lib/"
( cd "$STAGE/lib" && npm ci --omit=dev --ignore-scripts >/dev/null 2>&1 || true )  # tk 零运行时依赖，no-op 也行

# 4. vendored Node + launcher（带两个 runtime flag）
if [ "$OSFAM" = "win32" ]; then
  cp "$NODE_BIN" "$STAGE/node.exe"
  printf '@"%%~dp0..\\node.exe" --liftoff-only --disable-warning=ExperimentalWarning "%%~dp0..\\lib\\dist\\bin\\cli.js" %%*\r\n' \
    > "$STAGE/bin/tk.cmd"
else
  cp "$NODE_BIN" "$STAGE/node"
  cat > "$STAGE/bin/tk" <<'LAUNCH'
#!/bin/sh
SELF="$0"
while [ -L "$SELF" ]; do
  target="$(readlink "$SELF")"
  case "$target" in /*) SELF="$target" ;; *) SELF="$(dirname "$SELF")/$target" ;; esac
done
DIR="$(cd "$(dirname "$SELF")/.." && pwd)"
exec "$DIR/node" --liftoff-only --disable-warning=ExperimentalWarning "$DIR/lib/dist/bin/cli.js" "$@"
LAUNCH
  chmod +x "$STAGE/bin/tk"
fi

# 5. archive
mkdir -p "$OUT"
if [ "$OSFAM" = "win32" ]; then
  ARCHIVE="$OUT/token-killer-${TARGET}.zip"; rm -f "$ARCHIVE"
  ( cd "$WORK" && zip -rqX "$ARCHIVE" "token-killer-${TARGET}" )
else
  ARCHIVE="$OUT/token-killer-${TARGET}.tar.gz"
  tar --no-xattrs -czf "$ARCHIVE" -C "$WORK" "token-killer-${TARGET}"
fi
echo "[bundle] wrote ${ARCHIVE} ($(du -h "$ARCHIVE" | cut -f1))"
```

**(4) 具体数值**：target 数 = 6；archive 顶层目录名 = `token-killer-<target>`；解包 `--strip-components=1`（对应 L3）；win launcher 行尾 `\r\n`。

**(5) 有序步骤**：① 写 build-bundle.sh → ② 先只跑 `build-bundle.sh win32-x64` 验证出 `.zip` → ③ 逐个 target 补齐。每 target 独立产物、独立可测。

**(6) 测试**：fixture——`build-bundle.sh win32-x64` 产物解包后含 `node.exe`、`bin/tk.cmd`、`lib/dist/bin/cli.js`，且 `tk.cmd` 内容含 `--disable-warning=ExperimentalWarning`；smoke——unix bundle `./bin/tk --version` 返回。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/build-bundle.sh:21-117`、`BUNDLING.md:36-40`。

---

### L9 决策 — install.ps1：Windows 独立安装器，%LOCALAPPDATA% 免管理员（serves both surfaces）

**(1) 决策**：`irm <raw>/install.ps1 | iex`。`RuntimeInformation.OSArchitecture` 测 arch（Arm64→arm64 否则 x64）；GitHub API `tag_name`（或 `TK_VERSION` pin）解析 latest；下 `token-killer-win32-<arch>.zip` 到 `%TEMP%`；`Expand-Archive` 到 `%LOCALAPPDATA%\token-killer\current`；扁平化顶层目录；把 `<dest>\bin` prepend 到 USER Path。卸载 = 删目录 + 去 PATH 项。

**(2) 要动的文件**：`token-killer/install.ps1`（新建）。

**(3) 可抄代码**：install.ps1（已改写：repo、产品名、env `CODEGRAPH_*`→`TK_*`、安装目录 `codegraph`→`token-killer`、asset 名、bin 命令 `codegraph`→`tk`；arch 探测 + Expand + PATH 逻辑逐字）。源: `/tmp/tk-research/codegraph/install.ps1:15-59`
```powershell
$ErrorActionPreference = 'Stop'
$repo = 'cozy228/token-killer'
$installDir = if ($env:TK_INSTALL_DIR) { $env:TK_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'token-killer' }

$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'x64' }
$target = "win32-$arch"

$version = $env:TK_VERSION
if (-not $version) { $version = (Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest").tag_name }
if (-not $version) { throw "tk: could not resolve latest version; set TK_VERSION." }

$url = "https://github.com/$repo/releases/download/$version/token-killer-$target.zip"
Write-Host "Installing token-killer $version ($target)..."
$tmp = Join-Path $env:TEMP ("tk-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zip = Join-Path $tmp 'tk.zip'
Invoke-WebRequest -Uri $url -OutFile $zip

$dest = Join-Path $installDir 'current'
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Expand-Archive -Path $zip -DestinationPath $dest -Force
$inner = Join-Path $dest "token-killer-$target"          # 扁平化顶层 dir
if (Test-Path $inner) {
  Get-ChildItem -Force $inner | Move-Item -Destination $dest -Force
  Remove-Item -Recurse -Force $inner
}
Remove-Item -Recurse -Force $tmp

$binDir = Join-Path $dest 'bin'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $binDir) {
  [Environment]::SetEnvironmentVariable('Path', "$binDir;$userPath", 'User')
  Write-Host "Added $binDir to your PATH (restart your terminal to pick it up)."
}
Write-Host "Installed to $dest"; Write-Host "Run: tk --help"
```

**(4) 具体数值**：安装根 = `%LOCALAPPDATA%\token-killer\current`；版本 pin env = `TK_VERSION`；安装目录 override = `TK_INSTALL_DIR`；PATH 写入 scope = `User`（免管理员）。

**(5) 有序步骤**：① 依赖 L8 已发 Release 资产 → ② 写 install.ps1 → ③ 在无 Node 的 Windows VM `irm|iex` 验证。

**(6) 测试**：integration——无 Node Windows VM 跑安装后新 shell `tk --version` 返回；assertion——`%LOCALAPPDATA%\token-killer\current\bin\tk.cmd` 存在且在 User Path。

**(7) 证据回指**：`/tmp/tk-research/codegraph/install.ps1:15-59`。

---

### L10 决策 — install.sh：macOS 次目标，latest 走 release web 重定向不走 API（serves both surfaces）

**(1) 决策**：`curl | sh`。解析 latest 用 `releases/latest` 的 **web 重定向**（`curl -fsSLI -w url_effective | sed`），**不**用 GitHub API（未认证 API 限速 60 req/hr/IP，共享/CI host 上常 403）；重定向失败才回退 API。

**(2) 要动的文件**：`token-killer/install.sh`（新建）。

**(3) 可抄代码**：install.sh 版本解析段（已改写：env `CODEGRAPH_VERSION`→`TK_VERSION`、`$REPO`；重定向 + sed + API fallback 逐字）。源: `/tmp/tk-research/codegraph/install.sh:46-67`
```sh
# 解析 latest：用 releases/latest 的 web 重定向，不用限速的 GitHub API（issue #325）
version="${TK_VERSION:-}"
if [ -z "$version" ]; then
  version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" \
    | sed -n 's#.*/releases/tag/##p')"
fi
if [ -z "$version" ]; then     # 重定向读不到才回退 API
  version="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -n "$version" ] || { echo "tk: could not resolve latest version; set TK_VERSION (e.g. TK_VERSION=v1.0.0)." >&2; exit 1; }
case "$version" in v*) ;; *) version="v$version" ;; esac

url="https://github.com/$REPO/releases/download/$version/token-killer-${target}.tar.gz"
```

**(4) 具体数值**：`$REPO = cozy228/token-killer`；版本 pin env = `TK_VERSION`；asset = `token-killer-<target>.tar.gz`。

**(5) 有序步骤**：① 依赖 L8 Release → ② 写 install.sh（含 L9 同款 arch 探测的 unix 版）→ ③ macOS 验证。

**(6) 测试**：integration——macOS 跑 `curl … | sh` 后 `tk --version` 返回；assertion——在已耗尽 API 配额的环境（mock 403）仍能解析 version（走重定向）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/install.sh:46-64`；issue #325。

---

### L11 决策 — 程序解析 = 纯 Node PATH×PATHEXT 扫描，绝不 spawn where/which（serves the codemap agent surface）

**(1) 决策**：程序存在性判断保持 tk 现有 `hasCommand` 纯 Node 扫描，**绝不** spawn `where`/`which`/`command -v`。`exts = (PATHEXT||'.EXE;.CMD;.BAT;.COM').split(';')`（win32）/ `['']`（其它）；大小写不敏感；X_OK 仅 POSIX。理由：`command` 是 shell builtin（Debian 无独立 binary），自扫每平台一致且省一次 AV-taxed spawn。

**(2) 要动的文件**：tk 现有 `hasCommand`（已存在；本节确认作为分发不变量，无新增）。若 codegraph 抽取器引入新 program 探测，复用此函数。

**(3) 可抄代码**：hasCommand 纯 Node PATH×PATHEXT 扫描（codegraph 版与 tk PR#28 一致；逐字，仅作为不变量参照）。源: `/tmp/tk-research/codegraph/src/upgrade/index.ts:491-509`
```ts
export function hasCommand(cmd: string): boolean {
  const isWin = process.platform === 'win32';
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = isWin ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + ext);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (isWin) return true;
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch { /* not here / not executable — keep scanning */ }
    }
  }
  return false;
}
```

**(4) 具体数值**：win32 默认 PATHEXT = `.EXE;.CMD;.BAT;.COM`；spawn 数 = 0（纯扫描）。

**(5) 有序步骤**：① 审计任何新分发/抽取代码不引入 `where`/`which` spawn → ② 若需探测程序，调 `hasCommand`。

**(6) 测试**：unit——Windows mock `PATHEXT` 含 `.CMD` 时命中 `bin/foo.cmd`；负向——POSIX 下非 X_OK 文件不命中；断言代码库无 `spawn*('where'|'which'|'command -v')`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/upgrade/index.ts:491-509`；tk PR#28（PATHEXT casing via readdir，非 realpathSync.native）。

---

### L12 决策 — EBUSY 不变量：spawn-then-rm 的临时/缓存目录必带 maxRetries（serves both surfaces）

**(1) 决策**：每条「在 temp/cache 目录 spawn 子进程、之后删该目录」的路径，删除用 `fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100})`。覆盖 L3 self-heal 下载 staging 与任何 indexing scratch。理由：Windows 强制锁，子进程退出后短暂仍持 handle（AV 扫描/npm cache/indexer），裸 rmdir EBUSY；`fs.rm` 默认 maxRetries=0。

**(2) 要动的文件**：`token-killer/scripts/npm-shim.js`（`rmrf` 已在 L3 含 maxRetries）；任何 indexing scratch 清理路径。

**(3) 可抄代码**：tk 现行不变量（与 PR#37 一致），应用到 shim 的 rmrf。
```js
// npm-shim.js 的 rmrf（已在 L3 给出，重申不变量）
function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
  catch (e) { /* best effort */ }
}
```

**(4) 具体数值**：maxRetries = 5；retryDelay = 100ms（合计最坏 ~500ms 重试窗）。

**(5) 有序步骤**：① 把 L3 的 `rmrf` 改成带 maxRetries（已含）→ ② grep 全库 `fs.rm*(` 在 spawn 上下文补齐。

**(6) 测试**：Windows CI——spawn 子进程于 temp 后立即 rm，断言不抛 EBUSY（PR#37 回归 fixture）。

**(7) 证据回指**：tk PR#37（windows-22 EBUSY，`maxRetries:5,retryDelay:100`）；codegraph `npm-shim.js:229-231` 的 `rmrf`（本节加 maxRetries）。

---

### L13 决策 — GBK/OEM 输出：保留 tk decode 边界，所有分发 banner 仅 ASCII glyph（serves both surfaces）

**(1) 决策**：保留 tk tool-agnostic `decodeChildOutput`（strict UTF-8 → legacy-codepage 回退，lazy chcp 探测：936→gb18030、932→shift_jis、949→euc-kr、950→big5）。所有分发侧 console banner（L6 Node-gate banner、L9/L10 installer 消息）只用 ASCII glyph。

**(2) 要动的文件**：`token-killer/src/executor.ts`（decode 边界，已存在）；`token-killer/src/bin/node-version-check.ts`（banner ASCII，L6 已是）；可选 `src/ui/glyphs.ts`（ASCII fallback 表，从 codegraph 抄）。

**(3) 可抄代码**：glyphs ASCII fallback（已改写 env 前缀 `CODEGRAPH_*`→`TK_*`；表与探测逐字）。源: `/tmp/tk-research/codegraph/src/ui/glyphs.ts:21-26,62-77`
```ts
// src/ui/glyphs.ts（已改写 env 前缀；探测+ASCII 表逐字）
export function supportsUnicode(): boolean {
  if (process.env.TK_ASCII === '1') return false;
  if (process.env.TK_UNICODE === '1') return true;
  if (process.platform === 'win32') return false;       // Windows 默认 ASCII
  return process.env.TERM !== 'linux';
}
export const ASCII_GLYPHS = {
  ok: '[OK]', err: '[ERR]', info: '[i]', warn: '[!]',
  spinner: ['.', '*', '+', 'x', 'o', 'O'],
  barFilled: '#', barEmpty: '-', rail: '|', phaseDone: '*',
  dash: '-', hLine: '-', treeBranch: '|-- ', treeLast: '`-- ', treePipe: '|   ',
};
```

**(4) 具体数值**：codepage 映射 4 条（936/932/949/950）；Windows banner glyph 集 = ASCII only；ASCII escape env = `TK_ASCII=1`、unicode opt-in = `TK_UNICODE=1`。

**(5) 有序步骤**：① 确认 banner/installer 文本无非-ASCII（L6 已满足）→ ② 若引入进度/树渲染，接 glyphs.ts。

**(6) 测试**：unit——`win32` 下 `supportsUnicode()===false`；assertion——node-version-check.ts banner 字节全 ≤ 0x7F（ASCII）。

**(7) 证据回指**：`/tmp/tk-research/codegraph/src/ui/glyphs.ts:1-26`；tk 已有 GBK decode（executor.ts）。

---

### L14 决策 — ESM loader 用 pathToFileURL；任何脚本/spawn 绝不用 npx（serves both surfaces）

**(1) 决策**：ESM loader 路径一律 `pathToFileURL(x).href`，绝不裸 drive 路径（`node --import D:\…loader.mjs` 在 Windows 抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`）。任何分发脚本/spawn **绝不**用 `npx`（corepack 会静默 re-pin `packageManager`，且 npx 在 Windows 无 PATHEXT 时不可解析）；用 `pnpm exec` / 直接 `node --import file://…`。

**(2) 要动的文件**：`token-killer/scripts/build-bundle.sh`（构建命令用 `pnpm run build`，L8 已改）；任何 release/CI 脚本。

**(3) 可抄代码**：无独立 clone 代码——这是 tk 自身分发不变量（来自 PR#28 R1 + npx-rewrites memory）。规则化为：
```bash
# 禁：npx <tool>            → 用：pnpm exec <tool>  或  node ./node_modules/.bin/<tool>
# 禁：node --import D:\x.mjs → 用：node --import "$(node -e 'process.stdout.write(require("url").pathToFileURL(process.argv[1]).href)' x.mjs)"
```

**(4) 具体数值**：分发脚本中 `npx` 出现次数 = 0；ESM `--import` 参数必须 `file://` scheme。

**(5) 有序步骤**：① grep 所有 `scripts/*.sh` + CI yml 中 `npx` → 替换 → ② grep `--import` 确保 `file://`。

**(6) 测试**：CI lint——`grep -rn 'npx ' scripts/ .github/` 必须空；Windows smoke——任一 `--import` 路径不抛 `ERR_UNSUPPORTED_ESM_URL_SCHEME`。

**(7) 证据回指**：tk PR#28 R1（ESM URL scheme）、tk npx-rewrites-packagemanager-pin memory。

---

### L15 决策 — Release 发 SHA256SUMS；self-heal 有则校验、无则放行；release pipeline 一runner 全平台（serves both surfaces）

**(1) 决策**：GitHub Release 发 `SHA256SUMS`；shim self-heal 下载有 sums 则必须匹配否则 abort，无/不可达则放行（TLS 已护）。Release pipeline 从 `package.json` 读 version，单 runner 构建所有 bundle，建 Release（notes 取 CHANGELOG），发 npm shim + per-platform 包；需 `NPM_TOKEN`。

**(2) 要动的文件**：`token-killer/.github/workflows/release.yml`（新建）；`token-killer/scripts/build-bundle.sh`（产物 + `sha256sum`）。

**(3) 可抄代码**：verifyChecksum 已在 L3 给出（best-effort 语义逐字）。Release SHA256SUMS 生成（pipeline 侧，tk-adapted，需实现时补具体 yml）：
```bash
# release.yml 内（构建完所有 bundle 后）
( cd release && sha256sum token-killer-*.{zip,tar.gz} > SHA256SUMS )
# gh release create v$VERSION release/* --notes-file CHANGELOG-slice.md
```
注：完整 `release.yml`（matrix 调 build-bundle.sh 6 次 + pack-npm.sh + `gh release create` + `npm publish`）**需实现时补**——gap 是 CI 编排，非可抄业务逻辑；校验/打包逻辑已在 L3/L8 给全。

**(4) 具体数值**：sums 文件名 = `SHA256SUMS`；hash 算法 = sha256；校验失败 = abort（退出码非 0）；缺失 = 放行。

**(5) 有序步骤**：① build-bundle.sh 后追加 `sha256sum > SHA256SUMS` → ② 写 release.yml matrix → ③ 验证 Release 资产含 6 bundle + SHA256SUMS + 主 shim 包。

**(6) 测试**：integration——L3 的 mock release server 带正确 SHA256SUMS → 安装成功；篡改一字节 → abort；assertion——Release 资产清单含 `SHA256SUMS`。

**(7) 证据回指**：`/tmp/tk-research/codegraph/scripts/npm-shim.js:196-216`、`BUNDLING.md:61-65`。

---

### L16 决策 — Index/DB 落 out-of-tree 用户目录，fingerprint 过 fingerprintSegment 消毒（serves both surfaces）

**(1) 决策**：graph DB **out-of-tree**，per-project 落用户目录——POSIX `~/.token-killer/projects/<fp>/index.db`，Windows `%LOCALAPPDATA%\token-killer\projects\<fp>\index.db`（同一约定，平台映射）。fp = repo-name + hash，过 tk 现有 `fingerprintSegment`（`:`→`-`，Windows 文件名非法）。WAL 要求不落网络/同步盘（OneDrive 会 WAL corruption）。`.tk/` 在仓内**只**放人类共享工件（`wiki.json`、`wiki/pages/**`、`ONBOARDING.md`）+ gitignored staging（`proposed/**`、`cache/**`），DB 永不进仓。

**(2) 要动的文件**：`token-killer/src/core/dataDir.ts`（复用 `fingerprintSegment`、`projectDataDir`；codegraph store 落 `projectDataDir(cwd)/index.db`）；`.gitignore`（确保 DB 路径 + `.tk/proposed`、`.tk/cache` ignore）。

**(3) 可抄代码**：

tk 现有 `fingerprintSegment` + `projectDataDir`（逐字，已是 tk 代码；DB 路径在其下）。源: `/Users/ziyu/Workspace/token-killer/src/core/dataDir.ts:144-150`
```ts
// 已是 tk 代码：colon→dash 仅 Windows，POSIX no-op
export function fingerprintSegment(fingerprint: string): string {
  return process.platform === "win32" ? fingerprint.replace(/:/g, "-") : fingerprint;
}
export function projectDataDir(cwd: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(projectFingerprint(cwd)));
}
// codegraph graph store DB 落点（tk-adapted）：
export function indexDbPath(cwd: string): string {
  return path.join(projectDataDir(cwd), "index.db");   // 需实现时新增此 helper
}
```

WAL 模式设置（codegraph 逐字，C 需求物理实现，本节确认落 out-of-tree 才安全）。源对照: codegraph `src/db/index.ts:33`（`journal_mode=WAL`）
```ts
// db 初始化（C 需求拥有；此处确认 WAL 必须 out-of-tree、非网络盘）
db.exec("PRAGMA journal_mode = WAL;");
```
注：`db/index.ts:33` 的精确行**需实现时对照 C 需求确认**；本节只锁定 DB 路径与 WAL-非网络盘约束。

**(4) 具体数值**：DB 文件名 = `index.db`；存放根 = `~/.token-killer/projects/<fp>/`（POSIX）/ `%LOCALAPPDATA%\token-killer\projects\<fp>\`（Windows，tokenKillerHome 平台映射）；fingerprint 消毒 = `:`→`-`（仅 win32）；DB 永不进 git。

**(5) 有序步骤**：① 加 `indexDbPath` helper（复用 `projectDataDir`）→ ② C 需求的 store 用此路径 → ③ `.gitignore` 确认 `.tk/proposed`、`.tk/cache`、任何 `*.db` ignore。

**(6) 测试**：unit——`fingerprintSegment('repo:abc')` 在 win32 返回 `repo-abc`、POSIX 返回 `repo:abc`；assertion——`indexDbPath(cwd)` 不在 `cwd` 子树内（out-of-tree）；`git status` 在 index 后无 `*.db`。

**(7) 证据回指**：`/Users/ziyu/Workspace/token-killer/src/core/dataDir.ts:144-150`、tk PR#28（`:` Windows 非法）；C↔L 冲突裁决（DB out-of-tree，`.tk/` 仅人类工件）。

---

### Open Decisions（本节相关）

- **Node 25 / `--liftoff-only`**：已被 A+D 关闭（ship WASM → 25 排除、两 flag 必带）。请确认接受单一 gate `>=22.5.0 <25.0.0` + vendored Node 24.x（L5/L6/L7）。
- **Code-signing ✅ 定（D20 / [ADR 0032](../../adr/0032-artifact-gated-signing-av-tax-is-perf.md)）= artifact-gated**：现在**无 tk 自有未签 PE 可签**（tk = npm JS 包 `tk→dist/cli.js` 跑用户 Node；bundle 里的 node.exe 是**官方已签** Node 重打包）。故现在**不买证书**，继续 SHA256SUMS(L15)+npm provenance(决策#9)+release attestation；**当 tk 首发自有 Windows PE**（SEA / daemon-EXE / MSI/MSIX；PowerShell `install.ps1` 是脚本不算 PE）时 Authenticode **成硬发布门**，macOS notarization 同理（.app/.pkg/.dmg/bundled native 才启）。现在可**预留 CI signing stage + 验证合同**（不接真证书）。
- **CrowdStrike/AV 冷启动税 = 性能问题非签名问题（D20）**：EDR 拦 process-creation+file-access（`git --version`/`node -e 0` 皆慢），tk 多 spawn 一次 Node 即结构性多付一次扫描。**由 daemon / 减 spawn / 缓存 exec 路径 / 减热路径 I/O 解**（接 daemon Open Decision + Windows startup-perf 工作），**签名替代不了**。是否另申请 IT 排除路径 = 部署文档项，非产品闸。
- **Node pin 刷新节奏** ✅ **闭合（D30④）**：**pin 一个具体 24.x LTS**（可复现）+ tk 自担 CVE 刷新节奏（非 floating 24 LTS）。
- ~~**Scoop**：是否也发 Scoop？~~ ✅ **闭合（D30④）**：**不发 Scoop**（D24 个人项目永不发布、无分发面）。

### 与其它需求的绑定（coherence）

- DB 路径（L16）= C 物理 store 的落点；C/D/L 共享「node:sqlite + FTS5、零 native build」不变量，WASM 抽取器（D）使其成立。
- L6/L7 的两个 runtime flag 中 `--liftoff-only` 服务 D 的 WASM 抽取、`--disable-warning` serves the codemap agent surface 的 agent stdout 洁净。
- 分发的单一 artifact 收敛点是 F 的 VS Code extension（H viewer、I round-trip 都由它承载），extension 内嵌或调用本节 CLI backend——「one backend, two front-ends」。
- 本节是 install/runtime-launch 层；daemon vs per-command-spawn 是独立 perf 决策（M18 conditional branch，K op-count 测后定），不改打包配方。


---

