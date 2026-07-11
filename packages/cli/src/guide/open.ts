/**
 * Detached browser open — inherits ONLY the discipline of legacy src/report/open.ts
 * (R8): fire-and-forget, detached + unref so `ctx guide` is never held open by the
 * browser, suppressed under `CTX_NO_OPEN` (headless / agent / CI → the URL is
 * printed instead). The old visual language is discarded.
 */
import { spawn } from "node:child_process";

/** Open `url` in the OS default browser, detached. Returns false when suppressed. */
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
