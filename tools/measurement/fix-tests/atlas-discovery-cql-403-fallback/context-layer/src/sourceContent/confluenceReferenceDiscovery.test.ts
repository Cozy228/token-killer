import { describe, expect, it, vi } from "vitest";
import type { ServiceIdentity } from "@atlas/schema";
import type { FetchLike } from "../resolvers/resolverTypes";
import {
  createConfluenceReferenceDiscovery,
  type ConfluenceReferenceDiscoveryConfig,
  type DiscoveryDiagnostic,
} from "./confluenceReferenceDiscovery";

const CONFIG: ConfluenceReferenceDiscoveryConfig = {
  token: "fake-token",
  baseUrl: "https://wiki.example.com",
  email: "bot@example.com",
  spaceKeys: ["CLOUD"],
};

const textract: ServiceIdentity = {
  provider: "aws",
  id: "textract",
  name: "Amazon Textract",
  key: "aws/textract",
  recallAliases: ["amazon textract", "textract"],
  admissionAliases: ["amazon textract", "textract"],
};

type CqlBody = {
  results?: Array<Record<string, unknown>>;
  totalSize?: number;
  _links?: { next?: string };
};

function page(title: string, webui: string): Record<string, unknown> {
  return { title, _links: { webui } };
}

/** A FetchLike that replays a queue of responses (last one repeats), recording URLs. */
function fakeFetch(responses: Array<CqlBody | "fail">): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response === "fail") {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => response };
  };
  return { fetch, calls };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createConfluenceReferenceDiscovery — CQL recall + double-hit admission", () => {
  it("builds a CQL recall from the identity aliases scoped to the configured spaces", async () => {
    const { fetch, calls } = fakeFetch([{ results: [], totalSize: 0 }]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    await discovery.discover(textract);

    expect(calls[0]).toContain("/wiki/rest/api/content/search?cql=");
    const cql = decodeURIComponent(calls[0].split("cql=")[1].split("&")[0]);
    expect(cql).toBe(
      '(title ~ "amazon textract" OR title ~ "textract") AND space in ("CLOUD") AND type = page',
    );
    expect(calls[0]).toContain("limit=50");
  });

  it("admits ONLY candidates that hit identity AND a doc-type, categorizing by doc_type", async () => {
    const onDiagnostic = vi.fn<(d: DiscoveryDiagnostic) => void>();
    const { fetch } = fakeFetch([
      {
        results: [
          page("Textract — Service Design", "/wiki/spaces/CLOUD/pages/1/Design"),
          page("Textract Onboarding Guide", "/wiki/spaces/CLOUD/pages/2/Guide"),
          page("Textract Data Policy", "/wiki/spaces/CLOUD/pages/3/Policy"),
          page("Unrelated Meeting Notes", "/wiki/spaces/CLOUD/pages/4/Notes"), // no identity hit
          page("Textract Retrospective", "/wiki/spaces/CLOUD/pages/5/Retro"), // identity but no doc-type
        ],
        totalSize: 5,
      },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch, onDiagnostic });

    const result = await discovery.discover(textract);

    expect(result.references).toHaveLength(3);
    expect(new Set(result.references.map((r) => r.doc_type))).toEqual(
      new Set(["design", "user-guide", "policy"]),
    );
    expect(result.references[0].url).toBe(
      "https://wiki.example.com/wiki/spaces/CLOUD/pages/1/Design",
    );
    for (const reference of result.references) {
      expect(reference.content_mode).toBe("reference_only");
      expect(reference.agent_accessible).toBe(false);
    }
    expect(result.status).toBe("fresh");
    expect(result.incomplete).toBe(false);
    // Misses go to structured diagnostics, never an `other` bucket.
    expect(onDiagnostic).toHaveBeenCalledWith({
      key: "aws/textract",
      recalled: 5,
      admitted: 3,
      rejected: 2,
      truncated: false,
    });
  });

  it("does NOT admit a title matching only the bare machine slug (DoD #5 identity precision)", async () => {
    // recall is wide (the bare slug "dms" is recall-eligible), admission is narrow.
    const dms: ServiceIdentity = {
      provider: "aws",
      id: "dms",
      name: "Database Migration Service",
      key: "aws/dms",
      recallAliases: ["database migration service", "dms"],
      admissionAliases: ["database migration service"],
    };
    const { fetch } = fakeFetch([
      {
        results: [
          page("DMS Rollout Plan", "/wiki/spaces/CLOUD/pages/9/DMS"), // slug-only → rejected
          page("Database Migration Service — User Guide", "/wiki/spaces/CLOUD/pages/10/Guide"),
        ],
        totalSize: 2,
      },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    const result = await discovery.discover(dms);

    expect(result.references).toHaveLength(1);
    expect(result.references[0].title).toBe("Database Migration Service — User Guide");
    expect(result.references[0].doc_type).toBe("user-guide");
  });

  it("resolves the most-specific doc-type and tie-breaks policy > design", async () => {
    const { fetch } = fakeFetch([
      { results: [page("Textract Security Policy Design", "/wiki/x/1")], totalSize: 1 },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    const result = await discovery.discover(textract);
    // "security policy" (len 2, policy) beats "design" (len 1).
    expect(result.references[0].doc_type).toBe("policy");
  });
});

describe("createConfluenceReferenceDiscovery — cache honesty (B12, DoD #6)", () => {
  it("serves from cache within the fresh TTL without re-fetching", async () => {
    let clock = 0;
    const { fetch, calls } = fakeFetch([
      { results: [page("Textract Design", "/wiki/x/1")], totalSize: 1 },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch, now: () => clock });

    const first = await discovery.discover(textract);
    clock += 30 * 60 * 1000; // 30 min < 1h TTL
    const second = await discovery.discover(textract);

    expect(first.status).toBe("fresh");
    expect(second.status).toBe("fresh");
    expect(calls).toHaveLength(1); // no re-fetch within the window
  });

  it("serves stale + refreshes in the 1h–24h window", async () => {
    let clock = 0;
    const { fetch, calls } = fakeFetch([
      { results: [page("Textract Design", "/wiki/x/1")], totalSize: 1 },
      { results: [page("Textract Onboarding Guide", "/wiki/x/2")], totalSize: 1 },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch, now: () => clock });

    await discovery.discover(textract); // prime at t0
    clock += 2 * 60 * 60 * 1000; // 2h: past TTL, within max-staleness
    const stale = await discovery.discover(textract);

    expect(stale.status).toBe("stale");
    expect(stale.references[0].doc_type).toBe("design"); // last-good served immediately
    await flush(); // let the single-flight background refresh settle
    expect(calls).toHaveLength(2);
  });

  it("reports unavailable past max-staleness when the refresh fails (never unbounded stale)", async () => {
    let clock = 0;
    const { fetch } = fakeFetch([
      { results: [page("Textract Design", "/wiki/x/1")], totalSize: 1 },
      "fail",
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch, now: () => clock });

    await discovery.discover(textract); // prime at t0
    clock += 25 * 60 * 60 * 1000; // 25h: past max-staleness
    const result = await discovery.discover(textract);

    expect(result.status).toBe("unavailable");
    expect(result.references).toEqual([]); // refuse to serve >24h links
    expect(result.last_observed_at).toBe(new Date(0).toISOString()); // honest last-good time
  });

  it("flags a truncated recall as incomplete and logs it", async () => {
    const onDiagnostic = vi.fn<(d: DiscoveryDiagnostic) => void>();
    const { fetch } = fakeFetch([
      {
        results: [page("Textract Design", "/wiki/x/1")],
        totalSize: 1,
        _links: { next: "/wiki/rest/api/content/search?cql=...&start=50" },
      },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch, onDiagnostic });

    const result = await discovery.discover(textract);

    expect(result.incomplete).toBe(true);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ key: "aws/textract", truncated: true }),
    );
  });

  it("is an honest gap on a cold-start fetch failure (no fabricated links)", async () => {
    const { fetch } = fakeFetch(["fail"]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    const result = await discovery.discover(textract);

    expect(result.status).toBe("unavailable");
    expect(result.references).toEqual([]);
    expect(result.last_observed_at).toBeNull();
  });

  it("single-flights concurrent discovery for one key", async () => {
    const { fetch, calls } = fakeFetch([
      { results: [page("Textract Design", "/wiki/x/1")], totalSize: 1 },
    ]);
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    const [a, b] = await Promise.all([discovery.discover(textract), discovery.discover(textract)]);

    expect(a.references).toHaveLength(1);
    expect(b.references).toHaveLength(1);
    expect(calls).toHaveLength(1); // both callers shared one fetch
  });
});

describe("createConfluenceReferenceDiscovery — extra instances (separate security Cloud)", () => {
  const SECURITY: ConfluenceReferenceDiscoveryConfig = {
    ...CONFIG,
    extraInstances: [
      {
        token: "sec-token",
        baseUrl: "https://security.example.com",
        email: "sec-bot@example.com",
        spaceKeys: ["SECPOL"],
      },
    ],
  };

  it("recalls each instance and merges admitted references from both", async () => {
    // Primary → a design doc; the separate security Cloud → a policy doc.
    const { fetch, calls } = fakeFetch([
      { results: [page("Amazon Textract Design", "/wiki/x/1")], totalSize: 1 },
      { results: [page("Amazon Textract Data Policy", "/policy/9")], totalSize: 1 },
    ]);
    const discovery = createConfluenceReferenceDiscovery(SECURITY, { fetch });

    const result = await discovery.discover(textract);

    // One CQL per instance, each scoped to its own space + base URL.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("https://wiki.example.com/wiki/rest/api/content/search");
    expect(decodeURIComponent(calls[0])).toContain('space in ("CLOUD")');
    expect(calls[1]).toContain("https://security.example.com/wiki/rest/api/content/search");
    expect(decodeURIComponent(calls[1])).toContain('space in ("SECPOL")');

    // Both admitted, merged onto the same service; the policy resolves an absolute
    // URL against the SECURITY instance's base URL.
    expect(result.status).toBe("fresh");
    expect(result.references.map((r) => r.doc_type).sort()).toEqual(["design", "policy"]);
    expect(result.references.find((r) => r.doc_type === "policy")?.url).toBe(
      "https://security.example.com/policy/9",
    );
  });

  it("stays available (incomplete) when one instance fails", async () => {
    const { fetch } = fakeFetch([
      { results: [page("Amazon Textract Runbook", "/wiki/x/2")], totalSize: 1 },
      "fail", // the security Cloud is unreachable
    ]);
    const discovery = createConfluenceReferenceDiscovery(SECURITY, { fetch });

    const result = await discovery.discover(textract);

    expect(result.status).toBe("fresh");
    expect(result.references).toHaveLength(1); // primary still served
    expect(result.incomplete).toBe(true); // the failed instance is unknown
  });
});

describe("createConfluenceReferenceDiscovery — space-listing fallback (CQL search forbidden)", () => {
  const SECURITY: ConfluenceReferenceDiscoveryConfig = {
    ...CONFIG,
    extraInstances: [
      {
        token: "sec-token",
        baseUrl: "https://security.example.com",
        email: "sec-bot@example.com",
        spaceKeys: ["SECPOL"],
      },
    ],
  };

  const s3: ServiceIdentity = {
    provider: "aws",
    id: "s3",
    name: "Amazon S3",
    key: "aws/s3",
    recallAliases: ["amazon s3", "s3"],
    admissionAliases: ["amazon s3"],
  };

  /**
   * A fetch routed by URL: the primary Cloud's CQL search works (200), the security
   * Cloud's CQL search is forbidden (403), and the security space listing works (200).
   * Records how many times each surface is hit so the sticky-flip is observable.
   */
  function routedFetch() {
    const counts = { primarySearch: 0, securitySearch: 0, securityListing: 0 };
    const fetch: FetchLike = async (url) => {
      const isSecurity = url.startsWith("https://security.example.com");
      if (url.includes("/content/search")) {
        if (isSecurity) {
          counts.securitySearch += 1;
          return { ok: false, status: 403, json: async () => ({}) };
        }
        counts.primarySearch += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [page("Amazon Textract Design", "/wiki/x/1")],
            totalSize: 1,
          }),
        };
      }
      if (isSecurity && url.includes("/content/page")) {
        counts.securityListing += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              page("Amazon Textract Data Policy", "/policy/9"),
              page("Sprint Planning Notes", "/notes/1"), // no doc-type → dropped at listing
            ],
            _links: {},
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    return { fetch, counts };
  }

  it("falls back to space listing when the security instance 403s CQL search", async () => {
    const { fetch, counts } = routedFetch();
    const discovery = createConfluenceReferenceDiscovery(SECURITY, { fetch });

    const result = await discovery.discover(textract);

    expect(result.status).toBe("fresh");
    expect(result.incomplete).toBe(false); // fallback succeeded → not a gap
    // primary design + security policy (recalled from the listing, admitted locally);
    // the non-doc "Sprint Planning Notes" is dropped at listing time.
    expect(result.references.map((r) => r.doc_type).sort()).toEqual(["design", "policy"]);
    expect(result.references.find((r) => r.doc_type === "policy")?.url).toBe(
      "https://security.example.com/policy/9",
    );
    expect(counts.securitySearch).toBe(1); // tried CQL once
    expect(counts.securityListing).toBe(1); // then listed the space
  });

  it("stickily prefers listing after the first 403 and lists the space only once", async () => {
    const { fetch, counts } = routedFetch();
    // Fixed clock → the channel listing stays fresh across both discover calls.
    const discovery = createConfluenceReferenceDiscovery(SECURITY, { fetch, now: () => 1_000 });

    await discovery.discover(textract);
    await discovery.discover(s3); // different service → cold key, recalls both channels

    // The 403 flip is sticky: security CQL is not retried, and the channel-level
    // listing is fetched once and shared across services.
    expect(counts.securitySearch).toBe(1);
    expect(counts.securityListing).toBe(1);
  });

  it("does NOT fall back for the PRIMARY instance (its 403 is an honest gap)", async () => {
    const calls: string[] = [];
    const fetch: FetchLike = async (url) => {
      calls.push(url);
      return { ok: false, status: 403, json: async () => ({}) };
    };
    const discovery = createConfluenceReferenceDiscovery(CONFIG, { fetch });

    const result = await discovery.discover(textract);

    expect(result.status).toBe("unavailable");
    expect(result.references).toEqual([]);
    // Only the CQL search was attempted — no listing fallback on the primary.
    expect(calls.every((url) => url.includes("/content/search"))).toBe(true);
  });
});
