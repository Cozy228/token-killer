/**
 * The Playwright drive: real `ctx guide`, real store, real Chromium, real screenshots.
 *
 * WHY THIS IS NOT A TEST. D41 rules that acceptance is human sight: non-intersecting
 * rectangles and differing path arrays are FLOORS, not gates, and the gate is the maintainer
 * looking at a real page. So the screenshots are the DELIVERABLE. The assertions this script
 * also runs are the floors — necessary, never sufficient — and they are run HERE, against the
 * real corpus in a real browser, because that is the only place they can be true:
 *
 *   • label size is checked in SCREEN px (font size x the canvas's actual zoom), never in
 *     world units — a 14px label at zoom 0.6 is a 8.4px label, and a world-unit assertion
 *     would call it readable;
 *   • every card carries a name (E1: zero unlabelled rectangles);
 *   • every edge's drawn path is ELK's routed section — its endpoints are ports on the node
 *     borders, not the node centres. This is the reference's defect, checked from the DOM.
 *
 * It spawns the REAL CLI (`ctx guide --no-open`) rather than importing the server, so what it
 * photographs is the product a user starts, token handshake and all.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const OUT = resolve(HERE, "..", "screenshots");

/** Fixed viewports. The narrow one is BELOW the 1100px floor, on purpose. */
const VIEWPORTS = [
  { name: "overview-1440x900", width: 1440, height: 900, narrow: false },
  { name: "overview-1920x1080", width: 1920, height: 1080, narrow: false },
  { name: "overview-narrow-1024x800", width: 1024, height: 800, narrow: true },
];

const READABLE_SCREEN_PX = 10;

/** The canvas cards only — never the measurement layer's hidden twins. */
const CARD = '.react-flow__node [data-node-kind="scope-card"]';

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const { child, url } = await startGuide();
  const browser = await chromium.launch();
  const failures: string[] = [];

  try {
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      // The bootstrap link: the token's one appearance. It redirects to `/` with a cookie.
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="shell"]', { timeout: 20_000 });

      if (viewport.narrow) {
        await page.waitForSelector('[data-testid="narrow-notice"]');
        await page.screenshot({ path: `${OUT}/${viewport.name}.png`, fullPage: false });
        // The drawers are the narrow answer — photograph one open so the reviewer can see
        // that the tree did not simply vanish below the floor.
        await page.click('[data-testid="rail-toggle"]');
        await page.waitForSelector('[data-testid="drawer-left"]');
        await page.screenshot({ path: `${OUT}/${viewport.name}-tree-drawer.png` });
        await context.close();
        continue;
      }

      // Scoped to the canvas: the measurement layer holds a second, hidden copy of every
      // card (that is how the ELK box is obtained), and it must never be what we photograph
      // or assert on.
      await page.waitForSelector(CARD);
      await page.waitForSelector(".react-flow__edge path");
      // React Flow's fitView is a transform animation with duration 0; one frame settles it.
      await page.waitForTimeout(400);

      await page.screenshot({ path: `${OUT}/${viewport.name}.png`, fullPage: false });

      failures.push(...(await coldOpenFits(page, viewport.name)));

      // Selection: a card click fills the inspector and shows the entry affordance. Pick the
      // MOST CONNECTED card, derived from the rendered edges — not a hardcoded scope name.
      // The corpus drifts with every `ctx sync`; a hardcoded id would start lying.
      const busiest = await page.evaluate(() => {
        const degree = new Map<string, number>();
        for (const el of document.querySelectorAll(".react-flow__edge")) {
          const id = el.getAttribute("data-id") ?? "";
          const [src, rest] = id.split("->");
          const dst = (rest ?? "").replace(/:(calls|imports)$/, "");
          for (const node of [src, dst]) {
            if (node) degree.set(node, (degree.get(node) ?? 0) + 1);
          }
        }
        return [...degree.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      });

      await page.click(busiest ? `${CARD}[data-node-id="${busiest}"]` : `${CARD} >> nth=0`);
      await page.waitForSelector('[data-testid="inspector-subject"]');
      // Open one claim envelope — D33's "count + first id is not provenance", made visible.
      const handle = page.locator('[data-testid^="envelope-handle-"]').first();
      if ((await handle.count()) > 0) await handle.click();
      await page.screenshot({ path: `${OUT}/${viewport.name}-selected.png` });

      failures.push(...(await floors(page, viewport.name)));
      await context.close();
    }
  } finally {
    await browser.close();
    child.kill("SIGINT");
  }

  console.log(`\nscreenshots: ${OUT}`);
  if (failures.length > 0) {
    console.error(`\nFLOOR FAILURES (${failures.length}):`);
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("floors: all passed");
}

/**
 * E1's own floor: at COLD OPEN, without a single mouse gesture, every card is fully inside
 * the canvas. The canvas clamps `fitView` to the readability floor, so a world too tall to
 * fit at that zoom does not silently shrink its labels — it silently CLIPS. This is the check
 * that turns that silence into a failure.
 */
async function coldOpenFits(page: Page, label: string): Promise<string[]> {
  return page.evaluate(
    ({ card }: { card: string }) => {
      const pane = document.querySelector<HTMLElement>(".react-flow");
      if (!pane) return ["no canvas pane"];
      const bounds = pane.getBoundingClientRect();
      const problems: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(card)) {
        const rect = el.getBoundingClientRect();
        const id = el.dataset["nodeId"] ?? "(card)";
        if (
          rect.top < bounds.top - 0.5 ||
          rect.bottom > bounds.bottom + 0.5 ||
          rect.left < bounds.left - 0.5 ||
          rect.right > bounds.right + 0.5
        ) {
          problems.push(
            `card ${id} is clipped at cold open — a stranger would have to pan to read it`,
          );
        }
      }
      return problems;
    },
    { card: CARD },
  ).then((problems) => problems.map((p) => `[${label}] ${p}`));
}

/**
 * The mechanical floors, measured in the browser on the real corpus. Each returns the
 * evidence, not just a boolean — a floor that fails must say what it saw.
 */
async function floors(page: Page, label: string): Promise<string[]> {
  const result = await page.evaluate((minPx: number) => {
    const problems: string[] = [];

    // The canvas's real zoom, read off React Flow's own transform. Everything below is in
    // SCREEN px because of this multiplication — that is the whole point.
    const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
    const transform = viewport ? getComputedStyle(viewport).transform : "none";
    const zoom = transform === "none" ? 1 : (new DOMMatrixReadOnly(transform).a ?? 1);

    const cards = [
      ...document.querySelectorAll<HTMLElement>('.react-flow__node [data-node-kind="scope-card"]'),
    ];
    if (cards.length === 0) problems.push("no cards rendered at all");

    let smallestScreenPx = Number.POSITIVE_INFINITY;

    for (const card of cards) {
      const id = card.dataset["nodeId"] ?? "(no id)";

      // FLOOR 1 — zero unlabelled rectangles (E1).
      const name = card.querySelector<HTMLElement>('[data-role="name"]');
      if (!name || name.textContent?.trim() === "") problems.push(`card ${id} renders no name`);

      // FLOOR 2 — every label is >= 10 SCREEN px: world font size x canvas zoom.
      for (const el of card.querySelectorAll<HTMLElement>("h3, p, span")) {
        if (el.textContent?.trim() === "") continue;
        const worldFont = parseFloat(getComputedStyle(el).fontSize);
        const screen = worldFont * zoom;
        smallestScreenPx = Math.min(smallestScreenPx, screen);
        if (screen < minPx) {
          problems.push(
            `card ${id}: "${el.textContent?.trim().slice(0, 24)}" renders at ` +
              `${screen.toFixed(2)} screen px (${worldFont}px x zoom ${zoom.toFixed(3)}) < ${minPx}`,
          );
        }
      }

      // FLOOR 3 — the box ELK laid out IS the box on screen (D37/D39). The card's own rect,
      // divided back out of the zoom, must be the width/height we handed the engine.
      const host = card.closest<HTMLElement>("[data-elk-width]");
      if (host) {
        const rect = card.getBoundingClientRect();
        const elkW = Number(host.dataset["elkWidth"]);
        const elkH = Number(host.dataset["elkHeight"]);
        const renderedW = rect.width / zoom;
        const renderedH = rect.height / zoom;
        if (Math.abs(renderedW - elkW) > 1.5 || Math.abs(renderedH - elkH) > 1.5) {
          problems.push(
            `card ${id}: ELK was given ${elkW}x${elkH} but the DOM renders ` +
              `${renderedW.toFixed(1)}x${renderedH.toFixed(1)}`,
          );
        }
      } else {
        problems.push(`card ${id}: no ELK box recorded — it was laid out at a guessed size`);
      }
    }

    // FLOOR 4 — no edge is a straight centre-to-centre line. The drawn path's point list is
    // read back off the DOM and compared with the two node centres.
    const nodes = new Map<string, DOMRect>();
    for (const el of document.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const id = el.dataset["id"];
      if (id) nodes.set(id, el.getBoundingClientRect());
    }

    const edges = [...document.querySelectorAll<SVGPathElement>("path[data-edge-points]")];
    if (edges.length === 0) problems.push("no routed edges rendered at all");

    for (const edge of edges) {
      const routed = edge.getAttribute("data-edge-routed");
      const raw = edge.getAttribute("data-edge-points") ?? "[]";
      const points = JSON.parse(raw) as [number, number][];
      const id = edge.closest(".react-flow__edge")?.getAttribute("data-id") ?? "(edge)";

      if (routed !== "true") {
        problems.push(`edge ${id}: ELK returned no routed section; it is drawn unrouted`);
        continue;
      }
      if (points.length < 2) {
        problems.push(`edge ${id}: drawn with ${points.length} points`);
        continue;
      }
      // The path is in WORLD coordinates; so is the ELK layout. Compare there.
      const idParts = id.split("->");
      const src = idParts[0] ?? "";
      const dst = (idParts[1] ?? "").replace(/:(calls|imports)$/, "");
      const srcRect = nodes.get(src);
      const dstRect = nodes.get(dst);
      if (!srcRect || !dstRect) continue;

      // Screen-space centres of the two nodes, and screen-space endpoints of the path.
      const box = edge.getBoundingClientRect();
      void box;
      const start = edge.getPointAtLength(0);
      const end = edge.getPointAtLength(edge.getTotalLength());
      const ctm = edge.getScreenCTM();
      if (!ctm) continue;
      const s = new DOMPoint(start.x, start.y).matrixTransform(ctm);
      const e = new DOMPoint(end.x, end.y).matrixTransform(ctm);

      const srcCentre = { x: srcRect.x + srcRect.width / 2, y: srcRect.y + srcRect.height / 2 };
      const dstCentre = { x: dstRect.x + dstRect.width / 2, y: dstRect.y + dstRect.height / 2 };

      const dStart = Math.hypot(s.x - srcCentre.x, s.y - srcCentre.y);
      const dEnd = Math.hypot(e.x - dstCentre.x, e.y - dstCentre.y);
      // A centre-to-centre line would land ON both centres. A routed section lands on the
      // BORDER, at the port ELK assigned — at least half a card-height away.
      if (dStart < 8 || dEnd < 8) {
        problems.push(
          `edge ${id}: endpoint sits on a node CENTRE (${dStart.toFixed(1)}px / ` +
            `${dEnd.toFixed(1)}px) — this is the centre-to-centre defect`,
        );
      }

      // FLOOR 5 — DIRECTION IS DRAWN, AND IT IS DRAWN ON THE DEPENDENCY (D37).
      //
      // This map's scope graph is CYCLIC, so no placement can make "above" mean "depends on"
      // for every route: the three routes the engine had to reverse run back UP the map, and
      // for them the card above is the one depended UPON. Position therefore cannot be the
      // sole carrier of direction, and the arrowhead is the carrier that always holds — so it
      // has to actually be there, and it has to be on the right end.
      if (!edge.getAttribute("marker-end")) {
        problems.push(`edge ${id}: no arrowhead — its direction is not drawn at all`);
        continue;
      }
      // The polyline's END must sit on the TARGET, which is the thing depended upon. If it sat
      // nearer the source, the arrowhead would assert the exact reverse of the fact.
      const toTarget = Math.hypot(e.x - dstCentre.x, e.y - dstCentre.y);
      const toSource = Math.hypot(e.x - srcCentre.x, e.y - srcCentre.y);
      if (toTarget > toSource) {
        problems.push(
          `edge ${id}: the arrowhead is nearer its SOURCE than its target — it points at the ` +
            `dependent, not at the dependency`,
        );
      }
    }

    // The cycle routes are drawn distinguishably, and the legend says what they are. Both are
    // conditional on the corpus: no cycle, no rose, no legend entry, and the axis strip prints
    // the plain universal rule instead.
    const back = edges.filter((el) => el.getAttribute("data-edge-back") === "true");
    const legendCycle = document.querySelector('[data-testid="legend-cycle"]');
    if (back.length > 0 && !legendCycle) {
      problems.push(`${back.length} cycle routes are drawn but the legend never names them`);
    }
    for (const edge of back) {
      const id = edge.closest(".react-flow__edge")?.getAttribute("data-id") ?? "(edge)";
      const stroke = getComputedStyle(edge).stroke;
      const forward = edges.find((el) => el.getAttribute("data-edge-back") === "false");
      if (forward && stroke === getComputedStyle(forward).stroke) {
        problems.push(
          `edge ${id} runs against the axis but is stroked exactly like a forward route`,
        );
      }
    }

    // FLOOR 6 — THE MAP NEVER PRINTS A RULE IT ITSELF CONTRADICTS. The axis strip may state
    // "a card above another one depends on it" as a universal ONLY when the drawn graph has no
    // route running against the axis. The moment one exists, the strip must name it and count
    // it. This is the defect this round exists to kill, asserted against the real DOM.
    const axis = document.querySelector('[data-testid="canvas-axis"]')?.textContent ?? "";
    if (back.length > 0 && !(axis.includes("cycle") && axis.includes(String(back.length)))) {
      problems.push(
        `${back.length} routes run against the axis, but the axis strip does not name and ` +
          `count them: "${axis.trim()}"`,
      );
    }
    if (back.length === 0 && axis.includes("cycle")) {
      problems.push(`the axis strip names a cycle, but no route runs against the axis`);
    }

    return {
      problems,
      zoom,
      cards: cards.length,
      edges: edges.length,
      smallestScreenPx: Number.isFinite(smallestScreenPx) ? smallestScreenPx : 0,
    };
  }, READABLE_SCREEN_PX);

  console.log(
    `${label}: ${result.cards} cards · ${result.edges} routes · zoom ${result.zoom.toFixed(3)} · ` +
      `smallest label ${result.smallestScreenPx.toFixed(2)} screen px`,
  );
  return result.problems.map((p) => `[${label}] ${p}`);
}

/** Start the real CLI and read the bootstrap URL off its stdout. */
function startGuide(): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  const child = spawn(
    "pnpm",
    ["exec", "tsx", "packages/cli/src/cli.ts", "guide", "--no-open"],
    { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] },
  );

  return new Promise((ok, fail) => {
    let out = "";
    const timer = setTimeout(() => fail(new Error(`ctx guide did not print a URL:\n${out}`)), 30_000);

    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const match = /(http:\/\/127\.0\.0\.1:\d+\/auth\?t=[\w-]+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        ok({ child, url: match[1]! });
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`ctx guide exited with ${code}:\n${out}`));
    });
  });
}

await main();
