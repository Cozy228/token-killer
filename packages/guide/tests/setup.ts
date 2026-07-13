/**
 * A DESKTOP viewport for the component tests.
 *
 * happy-dom defaults to 1024px, which is BELOW the shell's 1100px floor — so without this the
 * whole suite would silently exercise the narrow (drawer) layout and never the three-pane one.
 * A test that quietly measures the wrong thing is worse than no test.
 */
import { beforeEach } from "vitest";

interface HappyDomWindow {
  happyDOM?: { setViewport: (size: { width: number; height: number }) => void };
}

beforeEach(() => {
  (window as unknown as HappyDomWindow).happyDOM?.setViewport({ width: 1440, height: 900 });
});
