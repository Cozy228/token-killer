/**
 * Golden discovery test (list-only + lazy enrichment, plan 0.2.0). Boots the shared
 * Node-mode MSW server (via the global `devMocks/setup.ts` setupFiles) so the live
 * Terraform path runs against the fictional registry fixtures.
 *
 * Two tiers, split by where the fetch happens:
 *  - `discoverServiceSources` → `deriveServiceResources` is now LIST-ONLY: it
 *    enumerates the whole availability spine with entry-tool links + the
 *    selector-based `availability` section, WITHOUT fetching a module README. So
 *    the list records carry NO `network`/`examples` sections and NO description
 *    (honest gap until a detail read).
 *  - `resourceContentDiscovery.sectionsFor` is the LAZY per-service enricher that
 *    fetches a service's README and derives `network`/`examples` — the coverage
 *    that used to live on the list build. The content-level golden set below
 *    spot-checks three representative services (textract / s3 / api-gateway) via
 *    the enricher, and a uniform invariant holds over every record (generic over N).
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ResourceContextRecordSchema,
  type ResourceContextRecord,
  type ResourceSectionBinding,
  type Source,
} from "@atlas/schema";
import {
  DEV_AVAILABILITY_PAGE_ID_AWSF,
  DEV_CONFLUENCE_BASE_URL,
  DEV_TERRAFORM_BASE_URL,
  DEV_TERRAFORM_MODULE_MAP,
  DEV_TERRAFORM_ORG,
} from "../devMocks";
import { createConfluenceAvailabilityProvider } from "../sourceContent/confluenceAvailabilityProvider";
import { defaultResolutionContext } from "../resolvers/resolverTypes";
import { discoverServiceSources, type DiscoverServiceSourcesDeps } from "./discoverSources";
import { deriveServiceResources, deriveServiceSourceRecords } from "./deriveResources";
import { createResourceContentDiscovery } from "../resources/resourceContentDiscovery";

describe("service discovery → resource derivation (golden)", () => {
  let records: ResourceContextRecord[];
  let recordsById: Map<string, ResourceContextRecord>;
  /** Enriched (lazily-fetched) sections per canonical id — where network/examples live. */
  let sectionsById: Map<string, Record<string, ResourceSectionBinding[]>>;
  let sources: Source[];

  beforeAll(async () => {
    // Point the live Terraform + availability adapters at the MSW-served fixtures.
    process.env.TERRAFORM_BASE_URL = DEV_TERRAFORM_BASE_URL;
    process.env.TERRAFORM_TOKEN = "dev-mock-token";
    process.env.CONFLUENCE_BASE_URL = DEV_CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_TOKEN = "dev-mock-token";
    process.env.CONFLUENCE_AVAILABILITY_PAGE_AWSF = DEV_AVAILABILITY_PAGE_ID_AWSF;

    const ctx = defaultResolutionContext(); // late-bound fetch → MSW interceptor
    const deps: DiscoverServiceSourcesDeps = {
      availabilityProvider: createConfluenceAvailabilityProvider({ fetch: ctx.fetch }),
      ctx,
      terraform: {
        baseUrl: process.env.TERRAFORM_BASE_URL!,
        token: process.env.TERRAFORM_TOKEN!,
        org: DEV_TERRAFORM_ORG,
        moduleMap: DEV_TERRAFORM_MODULE_MAP,
      },
    };

    const discovered = await discoverServiceSources(deps);
    records = deriveServiceResources(discovered);
    recordsById = new Map(records.map((record) => [`${record.kind}/${record.slug}`, record]));
    sources = deriveServiceSourceRecords(discovered);

    // Lazily enrich each record (the detail/agent-read path) so the section-binding
    // golden set asserts what a real resource read resolves.
    const contentDiscovery = createResourceContentDiscovery({
      terraform: {
        baseUrl: process.env.TERRAFORM_BASE_URL!,
        token: process.env.TERRAFORM_TOKEN!,
        org: DEV_TERRAFORM_ORG,
        moduleMap: DEV_TERRAFORM_MODULE_MAP,
      },
      guardrail: { baseUrl: "", token: "" },
      guardrailPageIds: new Map(),
    });
    sectionsById = new Map(
      await Promise.all(
        records.map(
          async (record): Promise<[string, Record<string, ResourceSectionBinding[]>]> => [
            `${record.kind}/${record.slug}`,
            await contentDiscovery.sectionsFor(record, defaultResolutionContext()),
          ],
        ),
      ),
    );
  });

  it("enriches network + examples + availability for a module with a network heading (textract)", () => {
    const textract = recordsById.get("service/aws/textract");
    expect(textract).toBeDefined();
    expect(textract!.provider).toBe("aws");
    // List-only: no content-derived sections/description until the lazy enrich.
    expect(textract!.sections.network).toBeUndefined();
    expect(textract!.description).toBeUndefined();

    const sections = sectionsById.get("service/aws/textract")!;
    expect(sections.network).toEqual([
      {
        source_id: "textract-module-readme",
        heading: "Private subnet usage",
        citation_label: "Private subnet usage",
        order: 10,
      },
    ]);
    expect(sections.examples).toEqual([
      {
        source_id: "textract-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    // Availability is selector-based (no fetch) — present on the list record and
    // preserved through enrichment.
    expect(sections.availability).toEqual([
      {
        source_id: "availability-matrix",
        // Selector is the machine id (what the matrix resolver matches on), not the name.
        selector: { service: "textract" },
        citation_label: "Amazon Textract regional availability",
        order: 10,
      },
    ]);
    expect(textract!.sections.availability).toEqual(sections.availability);
    // Presentation metadata (list-cheap): category = availability domain, default
    // status, one Terraform-module entry tool. Non-discoverable fields stay unset.
    expect(textract!.category).toBe("AI Services");
    expect(textract!.status).toBe("active");
    expect(textract!.entry_tools).toEqual([
      {
        label: "Terraform module",
        url: "https://app.terraform.io/example/registry/modules/example/textract/aws",
      },
    ]);
    expect(textract!.owner_team).toBeUndefined();
    expect(textract!.support_channel).toBeUndefined();
  });

  it("enriches network + examples + availability for s3 (network heading 'VPC endpoint access')", () => {
    const s3 = recordsById.get("service/aws/s3");
    expect(s3).toBeDefined();
    const sections = sectionsById.get("service/aws/s3")!;
    expect(sections.network).toEqual([
      {
        source_id: "s3-module-readme",
        heading: "VPC endpoint access",
        citation_label: "VPC endpoint access",
        order: 10,
      },
    ]);
    expect(sections.examples).toEqual([
      {
        source_id: "s3-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    expect(sections.availability).toEqual([
      {
        source_id: "availability-matrix",
        selector: { service: "s3" },
        citation_label: "Amazon S3 regional availability",
        order: 10,
      },
    ]);
    expect(s3!.category).toBe("Storage");
    expect(s3!.status).toBe("active");
  });

  it("enriches network + examples + availability for api-gateway (rekeyed example/api-gateway/aws)", () => {
    const apiGateway = recordsById.get("service/aws/api-gateway");
    expect(apiGateway).toBeDefined();
    const sections = sectionsById.get("service/aws/api-gateway")!;
    expect(sections.network).toEqual([
      {
        source_id: "api-gateway-module-readme",
        heading: "Private API networking",
        citation_label: "Private API networking",
        order: 10,
      },
    ]);
    expect(sections.examples).toEqual([
      {
        source_id: "api-gateway-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    expect(sections.availability).toEqual([
      {
        source_id: "availability-matrix",
        selector: { service: "api-gateway" },
        citation_label: "API Gateway regional availability",
        order: 10,
      },
    ]);
    expect(apiGateway!.category).toBe("App Integration");
    expect(apiGateway!.entry_tools).toEqual([
      {
        label: "Terraform module",
        url: "https://app.terraform.io/example/registry/modules/example/api-gateway/aws",
      },
    ]);
  });

  it("emits a Source per discovered module plus the synthetic availability-matrix source", () => {
    const ids = sources.map((source) => source.id);
    expect(ids).toContain("textract-module-readme");
    expect(ids).toContain("api-gateway-module-readme");
    expect(ids).toContain("availability-matrix");

    const moduleSource = sources.find((source) => source.id === "textract-module-readme");
    expect(moduleSource?.source_class).toBe("terraform-module");
    expect(moduleSource?.location).toBe("example/textract/aws");

    // The rekeyed address is discovered at example/api-gateway/aws (not apigateway).
    const apiGatewaySource = sources.find((source) => source.id === "api-gateway-module-readme");
    expect(apiGatewaySource?.location).toBe("example/api-gateway/aws");

    const availabilitySource = sources.find((source) => source.id === "availability-matrix");
    expect(availabilitySource?.source_class).toBe("availability-matrix");
    expect(availabilitySource?.location).toBe("availability");

    // Coherent spine: a Source per service module + the one availability matrix.
    expect(sources.length).toBe(records.length + 1);
  });

  it("enriches network + examples + availability uniformly over N and validates every record", () => {
    expect(records.length).toBeGreaterThan(1);
    for (const record of records) {
      expect(record.kind).toBe("service");
      const serviceId = record.slug.split("/")[1];
      const sections = sectionsById.get(`${record.kind}/${record.slug}`)!;
      // Coherent fixture: every service has a module with both headings → the lazy
      // enrich derives network + examples for every record.
      expect(sections.network).toBeDefined();
      expect(sections.examples).toBeDefined();
      // List-only leaves content-derived sections + description off the record until
      // enrichment (honest gap).
      expect(record.sections.network).toBeUndefined();
      expect(record.description).toBeUndefined();
      // Uniform: every service derives availability from the matrix source (selector,
      // no fetch), keyed by its machine id — present on the list record and enrich.
      const availability = [
        {
          source_id: "availability-matrix",
          selector: { service: serviceId },
          citation_label: `${record.name} regional availability`,
          order: 10,
        },
      ];
      expect(record.sections.availability).toEqual(availability);
      expect(sections.availability).toEqual(availability);
      // Uniform presentation (list-cheap): every record carries a category (=
      // availability domain) + default status + one Terraform-module entry tool (the
      // fixture spine is fully module-backed). No fabricated owner/support.
      expect(record.category).toBeTruthy();
      expect(record.status).toBe("active");
      expect(record.entry_tools).toEqual([
        {
          label: "Terraform module",
          url: `https://app.terraform.io/example/registry/modules/example/${serviceId}/${record.provider}`,
        },
      ]);
      expect(record.owner_team).toBeUndefined();
      expect(record.support_channel).toBeUndefined();
      // The list record is schema-valid (its availability section satisfies min(1)).
      expect(() => ResourceContextRecordSchema.parse(record)).not.toThrow();
    }
  });
});
