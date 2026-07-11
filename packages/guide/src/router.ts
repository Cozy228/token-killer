/**
 * Tiny hash router — deep-linkable, cookie-authed client routes (R12: a subject
 * deep link pasted into a new tab works because the cookie carries auth and the
 * route lives entirely in the URL hash). No dependency; the hash never carries a
 * token.
 */
import { useEffect, useState } from "react";

export type Route =
  | { view: "orient" }
  | { view: "subject"; ref: string }
  | { view: "review"; tab: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const parts = h.split("/").filter(Boolean); // ["subject","<id>"] etc.
  if (parts[0] === "subject" && parts[1]) {
    return { view: "subject", ref: decodeURIComponent(parts.slice(1).join("/")) };
  }
  if (parts[0] === "review") {
    return { view: "review", tab: parts[1] ?? "queue" };
  }
  return { view: "orient" };
}

export function navigate(route: Route): void {
  window.location.hash = toHash(route);
}

export function toHash(route: Route): string {
  switch (route.view) {
    case "orient":
      return "#/";
    case "subject":
      return `#/subject/${encodeURIComponent(route.ref)}`;
    case "review":
      return `#/review/${route.tab}`;
  }
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = (): void => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
