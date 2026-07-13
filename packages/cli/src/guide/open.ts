/**
 * Best-effort browser open. Fire-and-forget, detached, never throws: a headless box, a
 * CI runner or an agent simply gets the URL printed instead.
 *
 * The pattern (spawn the platform opener, `stdio: "ignore"`, detach + unref, honour a
 * no-open escape hatch) follows the legacy `src/report/open.ts`, rewritten here rather
 * than imported: that module belongs to the old root package and reaches into its report
 * writer. The escape hatch keeps the legacy env var name `CTX_NO_OPEN`, because a user
 * who set it for reports meant it for this too.
 */
import { spawn } from "node:child_process";

export function openInBrowser(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CTX_NO_OPEN) return false;
  try {
    const [cmd, args] =
      process.platform === "darwin"
        ? (["open", [url]] as const)
        : process.platform === "win32"
          ? (["cmd", ["/c", "start", "", url]] as const)
          : (["xdg-open", [url]] as const);
    const child = spawn(cmd, [...args], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
