/**
 * Golden guardrail discovery test (list-only + lazy enrichment, plan 0.2.0). Boots
 * the shared Node-mode MSW server (via the global `devMocks/setup.ts` setupFiles) so
 * the live Confluence path runs against the fictional SECPOL space fixtures.
 *
 * Two tiers, split by where the fetch happens:
 *  - `discoverGuardrails` is now LIST-ONLY: the space listing yields each page's
 *    `{slug, name, pageId}` with an EMPTY `headings` (no page-body fetch). So the
 *    derived list records carry NO sections until a detail read.
 *  - `resourceContentDiscovery.sectionsFor` is the LAZY per-policy enricher that
 *    fetches a guardrail's page and derives `enforced-controls` / `exceptions` — the
 *    coverage that used to live on the list crawl. A separate unit block drives
 *    `deriveGuardrailResources` over synthetic headings to prove evidence-based
 *    binding (a page missing the exceptions heading omits that section).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ResourceContextRecordSchema,
  type ResourceContextRecord,
  type ResourceSectionBinding,
  type Source,
} from "@atlas/schema";
import { DEV_CONFLUENCE_BASE_URL, DEV_CONFLUENCE_SECURITY_SPACE_KEY } from "../devMocks";
import { defaultResolutionContext } from "../resolvers/resolverTypes";
import {
  discoverGuardrails,
  type DiscoveredGuardrail,
  type DiscoverGuardrailsDeps,
} from "./discoverGuardrails";
import { deriveGuardrailResources, deriveGuardrailSourceRecords } from "./deriveGuardrails";
import { createResourceContentDiscovery } from "../resources/resourceContentDiscovery";

describe("guardrail discovery → derivation (golden)", () => {
  let discovered: DiscoveredGuardrail[];
  let records: ResourceContextRecord[];
  let recordsBySlug: Map<string, ResourceContextRecord>;
  /** Enriched (lazily-fetched) sections per slug — where enforced-controls/exceptions live. */
  let sectionsBySlug: Map<string, Record<string, ResourceSectionBinding[]>>;
  let sources: Source[];

  beforeAll(async () => {
    process.env.CONFLUENCE_BASE_URL = DEV_CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_TOKEN = "dev-mock-token";

    const ctx = defaultResolutionContext(); // late-bound fetch → MSW interceptor
    const deps: DiscoverGuardrailsDeps = {
      ctx,
      confluence: {
        baseUrl: DEV_CONFLUENCE_BASE_URL,
        token: "dev-mock-token",
        spaceKey: DEV_CONFLUENCE_SECURITY_SPACE_KEY,
      },
    };

    discovered = await discoverGuardrails(deps);
    records = deriveGuardrailResources(discovered);
    recordsBySlug = new Map(records.map((record) => [record.slug, record]));
    sources = deriveGuardrailSourceRecords(discovered);

    // Lazily enrich each policy (the detail/agent-read path) so the section-binding
    // golden set asserts what a real policy read resolves.
    const contentDiscovery = createResourceContentDiscovery({
      terraform: { baseUrl: "", token: "", org: "", moduleMap: {} },
      guardrail: { baseUrl: DEV_CONFLUENCE_BASE_URL, token: "dev-mock-token" },
      guardrailPageIds: new Map(discovered.map((g) => [g.slug, g.pageId])),
    });
    sectionsBySlug = new Map(
      await Promise.all(
        records.map(
          async (record): Promise<[string, Record<string, ResourceSectionBinding[]>]> => [
            record.slug,
            await contentDiscovery.sectionsFor(record, defaultResolutionContext()),
          ],
        ),
      ),
    );
  });

  it("lists the four SECPOL guardrails (no page-body fetch on the list pass)", () => {
    const bySlug = new Map(discovered.map((g) => [g.slug, g]));
    expect([...bySlug.keys()].sort()).toEqual([
      "data-encryption-standard",
      "iam-permission-boundary",
      "private-networking-baseline",
      "public-access-controls",
    ]);

    const encryption = bySlug.get("data-encryption-standard");
    expect(encryption).toMatchObject({ name: "Data Encryption Standard", pageId: "310001" });
    // List-only: the heading TOC is NOT read here — it fills in on the lazy enrich.
    expect(encryption!.headings).toEqual([]);
  });

  it("enriches enforced-controls + exceptions by heading match (encryption guardrail)", () => {
    const encryption = recordsBySlug.get("data-encryption-standard");
    expect(encryption).toBeDefined();
    expect(encryption!.kind).toBe("guardrail");
    expect(encryption!.aliases).toEqual(["Data Encryption Standard", "data-encryption-standard"]);
    // List-only record has no sections until enrichment.
    expect(encryption!.sections["enforced-controls"]).toBeUndefined();

    const sections = sectionsBySlug.get("data-encryption-standard")!;
    expect(sections["enforced-controls"]).toEqual([
      {
        source_id: "data-encryption-standard-policy-doc",
        heading: "Encryption controls",
        citation_label: "Encryption controls",
        order: 10,
      },
    ]);
    expect(sections.exceptions).toEqual([
      {
        source_id: "data-encryption-standard-policy-doc",
        heading: "Legacy exceptions",
        citation_label: "Legacy exceptions",
        order: 10,
      },
    ]);
  });

  it("does not let an enforced-also-matching heading steal the exceptions section", () => {
    // "Public access controls" matches enforced; "Legacy bucket waivers" matches
    // exceptions — each section claims its own heading.
    const sections = sectionsBySlug.get("public-access-controls")!;
    expect(sections["enforced-controls"]?.[0].heading).toBe("Public access controls");
    expect(sections.exceptions?.[0].heading).toBe("Legacy bucket waivers");
  });

  it("emits one policy-document Source per guardrail, id == binding source_id", () => {
    expect(sources).toHaveLength(records.length);
    const encryption = sources.find((s) => s.id === "data-encryption-standard-policy-doc");
    expect(encryption).toMatchObject({
      id: "data-encryption-standard-policy-doc",
      title: "Data Encryption Standard",
      source_class: "policy-document",
      location: "310001",
      visibility: "internal",
      authority_scope: ["security-guardrail"],
      authority_level: "authoritative",
      review_frequency: "quarterly",
    });
    // Every ENRICHED binding's source_id resolves to an emitted Source id.
    const sourceIds = new Set(sources.map((s) => s.id));
    for (const sections of sectionsBySlug.values()) {
      for (const bindings of Object.values(sections)) {
        for (const binding of bindings) {
          expect(sourceIds.has(binding.source_id)).toBe(true);
        }
      }
    }
  });

  it("list records are schema-valid; enriched policies carry both sections", () => {
    expect(records.length).toBe(4);
    for (const record of records) {
      expect(record.kind).toBe("guardrail");
      // List record: empty sections, still schema-valid (no empty section array).
      expect(() => ResourceContextRecordSchema.parse(record)).not.toThrow();
      const sections = sectionsBySlug.get(record.slug)!;
      expect(sections["enforced-controls"]).toBeDefined();
      expect(sections.exceptions).toBeDefined();
    }
  });
});

describe("deriveGuardrailResources (evidence-based binding)", () => {
  it("omits a section with no matching heading (honest gap)", () => {
    const enforcedOnly: DiscoveredGuardrail = {
      slug: "tagging-standard",
      name: "Tagging Standard",
      pageId: "319001",
      headings: ["Mandatory tags"], // enforced match only, no exceptions-matching heading
    };
    const [record] = deriveGuardrailResources([enforcedOnly]);
    expect(record.sections["enforced-controls"]).toEqual([
      {
        source_id: "tagging-standard-policy-doc",
        heading: "Mandatory tags",
        citation_label: "Mandatory tags",
        order: 10,
      },
    ]);
    expect(record.sections.exceptions).toBeUndefined();
    // Honest gap is still a schema-valid record (no empty section object).
    expect(() => ResourceContextRecordSchema.parse(record)).not.toThrow();
  });
});

describe("discoverGuardrails root-page scope (v2 children)", () => {
  /** A minimal ResolutionContext whose fetch replays a scripted queue of responses,
   *  recording the URLs it was asked for. */
  function stubCtx(responses: Array<{ status?: number; body?: unknown }>) {
    const calls: string[] = [];
    let i = 0;
    const ctx = {
      fetch: async (input: string | URL) => {
        calls.push(String(input));
        const r = responses[i++] ?? { status: 200, body: { results: [] } };
        return {
          ok: (r.status ?? 200) < 400,
          status: r.status ?? 200,
          json: async () => r.body ?? {},
        } as unknown as Response;
      },
    } as unknown as import("../resolvers/resolverTypes").ResolutionContext;
    return { ctx, calls };
  }

  it("crawls the root page's child pages, drops archived, paginates by cursor", async () => {
    const { ctx, calls } = stubCtx([
      {
        body: {
          results: [
            { id: "310001", title: "Data Encryption Standard", status: "current" },
            { id: "900002", title: "Archived Policy", status: "archived" },
          ],
          _links: { next: "/wiki/api/v2/pages/500000/children?limit=250&cursor=NEXT" },
        },
      },
      {
        body: {
          results: [{ id: "310002", title: "IAM Permission Boundary", status: "current" }],
          _links: {},
        },
      },
    ]);

    const discovered = await discoverGuardrails({
      ctx,
      confluence: {
        baseUrl: "https://sec.example.atlassian.net",
        token: "t",
        spaceKey: "IGNORED_WHEN_ROOT_SET",
        rootPageId: "500000",
      },
    });

    // Only current pages survive (archived dropped), across both cursor pages.
    expect(discovered.map((g) => g.pageId)).toEqual(["310001", "310002"]);
    expect(discovered.map((g) => g.slug)).toEqual([
      "data-encryption-standard",
      "iam-permission-boundary",
    ]);
    // Hit the v2 children endpoint (NOT the whole-space listing), then followed the
    // cursor for page 2 — 2 requests total, not a 9-batch space scan.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/wiki/api/v2/pages/500000/children?limit=250");
    expect(calls[0]).not.toContain("/content/page");
    expect(calls[1]).toContain("cursor=NEXT");
  });

  it("reports an honest gap (empty) when the children endpoint denies access", async () => {
    const { ctx } = stubCtx([{ status: 403 }]);
    const discovered = await discoverGuardrails({
      ctx,
      confluence: {
        baseUrl: "https://sec.example.atlassian.net",
        token: "t",
        spaceKey: "",
        rootPageId: "500000",
      },
    });
    expect(discovered).toEqual([]);
  });
});
