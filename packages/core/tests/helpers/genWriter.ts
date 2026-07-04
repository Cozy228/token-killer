/**
 * A12-generations child writer: writes `gens` generations of `perGen` entities
 * each into the shared store, publishing each generation atomically. The
 * parent process reads concurrently and must never observe a torn generation
 * (visible entity count is always perGen * published_gen).
 *
 * Usage: node --experimental-sqlite --import tsx genWriter.ts <projectDir> <home> <gens> <perGen>
 */
import { openStore } from "../../src/store/store.ts";

const [, , projectDir, home, gensArg, perGenArg] = process.argv;
if (!projectDir || !home || !gensArg || !perGenArg) {
  console.error("usage: genWriter.ts <projectDir> <home> <gens> <perGen>");
  process.exit(2);
}
const gens = Number(gensArg);
const perGen = Number(perGenArg);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const store = openStore({ projectDir, home });
for (let g = 0; g < gens; g++) {
  const building = store.beginGeneration("git");
  for (let i = 0; i < perGen; i++) {
    store.upsertEntity({
      id: `file:gen${building}/f${i}.md`,
      kind: "file",
      name: `gen${building}/f${i}.md`,
      locator: { t: "file", path: `gen${building}/f${i}.md` },
      gen: building,
    });
  }
  store.publishGeneration("git");
  // Small pause per generation so a concurrent reader genuinely races many
  // distinct published states instead of one instantaneous burst.
  await sleep(3);
}
store.close();
process.stdout.write("done");
