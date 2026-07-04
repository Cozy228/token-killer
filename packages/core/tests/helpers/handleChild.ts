/**
 * A12-handles child: opens its OWN store (fresh temp home) for the given
 * project dir, interns a short handle for a fixed entity id, prints it.
 * Determinism assertion: the parent process does the same in a different
 * store/process and must get the identical short handle.
 *
 * Usage: node --experimental-sqlite --import tsx handleChild.ts <projectDir> <home> <entityId>
 */
import { openStore } from "../../src/store/store.ts";

const [, , projectDir, home, entityId] = process.argv;
if (!projectDir || !home || !entityId) {
  console.error("usage: handleChild.ts <projectDir> <home> <entityId>");
  process.exit(2);
}

const store = openStore({ projectDir, home });
store.upsertEntity({
  id: entityId,
  kind: "file",
  name: entityId,
  locator: { t: "file", path: "README.md" },
  gen: 1,
});
const short = store.internHandle(entityId, "text");
process.stdout.write(short);
store.close();
