/**
 * `LiveDataSource` — HTTP to the `ctx guide` loopback server.
 *
 * Auth is entirely cookie-borne: the CLI printed a URL carrying a one-hop bearer token,
 * the browser exchanged it at `/auth` for an `HttpOnly` cookie, and every request since
 * rides that cookie. The SPA therefore never sees, stores or forwards the token — it
 * cannot leak what it does not hold. A 401 here means the cookie is absent or wrong, and
 * the only honest response is the auth screen.
 */
import type { BoundedProjection, GuideEvent, GuideStatus } from "./dto.ts";
import {
  GuideAuthError,
  GuideNotServableError,
  GuideSourceError,
  type ConnectionsQuery,
  type GuideDataSource,
  type ScopeQuery,
} from "./source.ts";

export class LiveDataSource implements GuideDataSource {
  readonly mode = "live" as const;
  readonly #base: string;

  /** `base` defaults to same-origin — the server that served this bundle. */
  constructor(base = "") {
    this.#base = base;
  }

  status(): Promise<GuideStatus> {
    return this.#get<GuideStatus>("/api/generation");
  }

  overview(): Promise<BoundedProjection> {
    return this.#get<BoundedProjection>("/api/overview");
  }

  scope(query: ScopeQuery): Promise<BoundedProjection> {
    const params = new URLSearchParams({ path: query.path });
    if (query.expand?.length) params.set("expand", query.expand.join(","));
    return this.#get<BoundedProjection>(`/api/scope?${params.toString()}`);
  }

  connections(query: ConnectionsQuery): Promise<BoundedProjection> {
    const params = new URLSearchParams({ id: query.id });
    if (query.kinds?.length) params.set("kinds", query.kinds.join(","));
    return this.#get<BoundedProjection>(`/api/connections?${params.toString()}`);
  }

  event(event: GuideEvent): Promise<BoundedProjection> {
    const params = new URLSearchParams();
    if (event.commits?.length) params.set("commits", event.commits.join(","));
    if (event.anchors?.length) params.set("anchors", event.anchors.join(","));
    return this.#get<BoundedProjection>(`/api/event?${params.toString()}`);
  }

  async #get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.#base}${path}`, {
        // The cookie IS the credential. Never attach anything else.
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
    } catch (error) {
      throw new GuideSourceError(
        `the ctx guide server did not answer (${String(error)}). It runs in the foreground — ` +
          "if you stopped it with Ctrl-C, run `ctx guide` again.",
      );
    }

    if (response.status === 401) {
      throw new GuideAuthError(await messageOf(response));
    }
    // 409: the store holds nothing this checkout may be shown as current. The body
    // carries the generation view — the badge and the reason come straight from it.
    if (response.status === 409) {
      const body = (await response.json()) as { status?: GuideStatus };
      if (body.status) throw new GuideNotServableError(body.status);
      throw new GuideSourceError("the server refused to project, without saying why");
    }
    if (!response.ok) {
      throw new GuideSourceError(`${path} answered ${response.status}: ${await messageOf(response)}`);
    }
    return (await response.json()) as T;
  }
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
