/**
 * Idle backstop (R13): the `ctx guide` server lives until Ctrl-C OR a long idle
 * period with no authenticated request (default 2 h, `--idle-ms` override). This
 * is the ONLY automatic teardown — there is deliberately no beacon/unload
 * teardown (the v2 lifecycle that fought the user is removed).
 *
 * Uses global setTimeout/clearTimeout so tests drive it with fake timers.
 */

export const DEFAULT_IDLE_MS = 2 * 60 * 60 * 1000; // 2 hours

export class IdleBackstop {
  readonly #idleMs: number;
  readonly #onIdle: () => void;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #fired = false;

  constructor(idleMs: number, onIdle: () => void) {
    this.#idleMs = idleMs;
    this.#onIdle = onIdle;
  }

  /** Arm the backstop. Idempotent-ish: re-arms from now. */
  start(): void {
    this.#arm();
  }

  /** Reset the idle countdown — called on every authenticated request. */
  touch(): void {
    if (this.#fired) return;
    this.#arm();
  }

  /** Cancel the backstop (graceful shutdown owns teardown from here). */
  stop(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  get fired(): boolean {
    return this.#fired;
  }

  #arm(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#fired = true;
      this.#onIdle();
    }, this.#idleMs);
    // Do not keep the event loop alive solely for the idle timer.
    if (typeof this.#timer === "object" && this.#timer !== null && "unref" in this.#timer) {
      (this.#timer as { unref: () => void }).unref();
    }
  }
}
