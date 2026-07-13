/**
 * The readability floor, in SCREEN pixels (E2/E6/D39).
 *
 * A label's world font size means nothing on its own — the canvas is zoomable, so what the
 * eye gets is `fontSize x zoom`. Every readability number in this app is computed that way,
 * and the canvas's `minZoom` is not a taste setting but the arithmetic solution of
 *
 *     SMALLEST_CANVAS_FONT_PX * minZoom >= READABLE_SCREEN_PX
 *
 * Raise the floor and the canvas is allowed to zoom out less far. That is the trade, stated
 * once, in one place, so it cannot be quietly lost.
 */

/** The smallest thing the maintainer should have to read on a canvas card. */
export const READABLE_SCREEN_PX = 10;

/**
 * The smallest font used ANYWHERE on the canvas, in world units. Bound to the CSS custom
 * property `--canvas-min-font` in `index.css`; the Playwright floor re-measures the real DOM
 * rather than trusting this constant, so the two cannot silently drift apart.
 */
export const SMALLEST_CANVAS_FONT_PX = 14;

/**
 * The zoom below which a canvas label would drop under the floor. React Flow clamps both
 * `fitView` and the user's own zooming to this, so there is no gesture and no viewport size
 * that can produce an unreadable label.
 */
export const MIN_ZOOM = round(READABLE_SCREEN_PX / SMALLEST_CANVAS_FONT_PX);

/** Cold open never magnifies past 1:1 — a 3-card repo should not fill the screen with one. */
export const MAX_FIT_ZOOM = 1;

/** Screen px a world-unit font renders at, at this zoom. The assertion's own arithmetic. */
export function screenPx(worldFontPx: number, zoom: number): number {
  return worldFontPx * zoom;
}

export function isReadable(worldFontPx: number, zoom: number): boolean {
  return screenPx(worldFontPx, zoom) >= READABLE_SCREEN_PX;
}

function round(n: number): number {
  return Math.ceil(n * 1000) / 1000;
}
