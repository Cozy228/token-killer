/**
 * Runtime skin switch (design §8, C11). `?skin=` selects a design-system layer;
 * skins are token files + component-skin CSS only, so switching changes ONLY the
 * design layer — never routes, projections, DOM structure, or copy. Applied by
 * stamping `data-skin` on <html>.
 */
export const SKINS = ["graphite", "ledger", "depth", "signal"] as const;
export type Skin = (typeof SKINS)[number];
export const DEFAULT_SKIN: Skin = "graphite";

export function isSkin(v: string | null): v is Skin {
  return v !== null && (SKINS as readonly string[]).includes(v);
}

export function currentSkin(): Skin {
  try {
    const q = new URLSearchParams(window.location.search).get("skin");
    return isSkin(q) ? q : DEFAULT_SKIN;
  } catch {
    return DEFAULT_SKIN;
  }
}

export function applySkin(skin: Skin): void {
  document.documentElement.setAttribute("data-skin", skin);
}

export function setSkin(skin: Skin): void {
  applySkin(skin);
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("skin", skin);
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* non-browser env */
  }
}
