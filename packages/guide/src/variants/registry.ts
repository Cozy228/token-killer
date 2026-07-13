// Auto-registry: every src/variants/<slug>/index.tsx that default-exports a
// VariantSpec is registered. Selection is `?variant=<id>`; the default is the
// first registered id alphabetically. No substrate edit needed to add a variant.

import type { VariantSpec } from "./types.js";

const modules = import.meta.glob<{ default: VariantSpec }>("./*/index.tsx", { eager: true });

const specs: VariantSpec[] = Object.values(modules)
  .map((m) => m.default)
  .filter((s): s is VariantSpec => Boolean(s && s.id))
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export const variants: VariantSpec[] = specs;

export function defaultVariant(): VariantSpec {
  if (specs.length === 0) throw new Error("no variants registered");
  return specs[0];
}

export function selectVariant(id: string | null | undefined): VariantSpec {
  if (id) {
    const found = specs.find((s) => s.id === id);
    if (found) return found;
  }
  return defaultVariant();
}
