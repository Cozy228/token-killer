/**
 * Golden discovery test (plan 018 G5, de-specialized). Boots the shared Node-mode
 * MSW server (via the global `devMocks/setup.ts` setupFiles) so the live Terraform
 * discovery path runs unchanged against the fictional registry fixtures, then runs
 * `discoverServiceSources` → `deriveServiceResources` over the WHOLE availability
 * spine and asserts the derived resources/sections/citations.
 *
 * All services are 平权 (no privileged "textract gate"): the trimmed `awsf` spine
 * is now coherent — every spine service has a Terraform module whose README carries
 * both a network-matching and an examples-matching heading (plan 018 G5 prep, no
 * empty service shells). The content-level golden set below spot-checks three
 * representative services (textract / s3 / api-gateway) for network + examples +
 * availability section-binding, and a uniform invariant holds over every derived
 * record (generic over N) — every service derives network, examples, AND
 * availability, and every record validates against `ResourceContextRecordSchema`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  ResourceContextRecordSchema,
  type ResourceContextRecord,
  type Source,
} from "@atlas/schema";
import {
  DEV_AVAILABILITY_PAGE_ID_AWSF,
  DEV_CONFLUENCE_BASE_URL,
  DEV_TERRAFORM_BASE_URL,
} from "../devMocks";
import { createConfluenceAvailabilityProvider } from "../sourceContent/confluenceAvailabilityProvider";
import { defaultResolutionContext } from "../resolvers/resolverTypes";
import { discoverServiceSources, type DiscoverServiceSourcesDeps } from "./discoverSources";
import { deriveServiceResources, deriveServiceSourceRecords } from "./deriveResources";

describe("service discovery → resource derivation (golden)", () => {
  let records: ResourceContextRecord[];
  let recordsById: Map<string, ResourceContextRecord>;
  let sources: Source[];

  beforeAll(async () => {
    // Point the live Terraform + availability adapters at the MSW-served fixtures.
    process.env.ATLAS_TERRAFORM_BASE_URL = DEV_TERRAFORM_BASE_URL;
    process.env.ATLAS_TERRAFORM_TOKEN = "dev-mock-token";
    process.env.ATLAS_CONFLUENCE_BASE_URL = DEV_CONFLUENCE_BASE_URL;
    process.env.ATLAS_CONFLUENCE_TOKEN = "dev-mock-token";
    process.env.ATLAS_CONFLUENCE_AVAILABILITY_PAGE_AWSF = DEV_AVAILABILITY_PAGE_ID_AWSF;

    const ctx = defaultResolutionContext(); // late-bound fetch → MSW interceptor
    const deps: DiscoverServiceSourcesDeps = {
      availabilityProvider: createConfluenceAvailabilityProvider({ fetch: ctx.fetch }),
      ctx,
      terraform: {
        baseUrl: process.env.ATLAS_TERRAFORM_BASE_URL!,
        token: process.env.ATLAS_TERRAFORM_TOKEN!,
      },
    };

    const discovered = await discoverServiceSources(deps);
    records = deriveServiceResources(discovered);
    recordsById = new Map(records.map((record) => [`${record.kind}/${record.slug}`, record]));
    sources = deriveServiceSourceRecords(discovered);
  });

  it("derives network + examples + availability for a module with a network heading (textract)", () => {
    const textract = recordsById.get("service/aws/textract");
    expect(textract).toBeDefined();
    expect(textract!.provider).toBe("aws");
    expect(textract!.sections.network).toEqual([
      {
        source_id: "textract-module-readme",
        heading: "Private subnet usage",
        citation_label: "Private subnet usage",
        order: 10,
      },
    ]);
    expect(textract!.sections.examples).toEqual([
      {
        source_id: "textract-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    expect(textract!.sections.availability).toEqual([
      {
        source_id: "availability-matrix",
        // Selector is the machine id (what the matrix resolver matches on), not the name.
        selector: { service: "textract" },
        citation_label: "Amazon Textract regional availability",
        order: 10,
      },
    ]);
    // Presentation metadata: category = availability domain, default status, one
    // Terraform-module entry tool. Non-discoverable fields stay unset (honest gap).
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
    expect(textract!.description).toBeUndefined();
  });

  it("derives network + examples + availability for s3 (network heading 'VPC endpoint access')", () => {
    const s3 = recordsById.get("service/aws/s3");
    expect(s3).toBeDefined();
    expect(s3!.sections.network).toEqual([
      {
        source_id: "s3-module-readme",
        heading: "VPC endpoint access",
        citation_label: "VPC endpoint access",
        order: 10,
      },
    ]);
    expect(s3!.sections.examples).toEqual([
      {
        source_id: "s3-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    expect(s3!.sections.availability).toEqual([
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

  it("derives network + examples + availability for api-gateway (rekeyed example/api-gateway/aws)", () => {
    const apiGateway = recordsById.get("service/aws/api-gateway");
    expect(apiGateway).toBeDefined();
    expect(apiGateway!.sections.network).toEqual([
      {
        source_id: "api-gateway-module-readme",
        heading: "Private API networking",
        citation_label: "Private API networking",
        order: 10,
      },
    ]);
    expect(apiGateway!.sections.examples).toEqual([
      {
        source_id: "api-gateway-module-readme",
        heading: "Terraform starter",
        citation_label: "Terraform starter",
        order: 10,
      },
    ]);
    expect(apiGateway!.sections.availability).toEqual([
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

  it("derives network + examples + availability uniformly over N and validates every record", () => {
    expect(records.length).toBeGreaterThan(1);
    for (const record of records) {
      expect(record.kind).toBe("service");
      // Coherent fixture: every service has a module with both headings → no empty
      // shells, every record carries network + examples sections.
      expect(record.sections.network).toBeDefined();
      expect(record.sections.examples).toBeDefined();
      // Uniform: every service derives availability from the matrix source, keyed by
      // its machine id (slug = `${provider}/${id}`) — what the resolver matches on.
      const serviceId = record.slug.split("/")[1];
      expect(record.sections.availability).toEqual([
        {
          source_id: "availability-matrix",
          selector: { service: serviceId },
          citation_label: `${record.name} regional availability`,
          order: 10,
        },
      ]);
      // Uniform presentation: every record carries a category (= availability domain)
      // + default status, one Terraform-module entry tool (the fixture spine is fully
      // module-backed), and NO fabricated owner/support/description.
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
      expect(record.description).toBeUndefined();
      // Content-level golden: the derived record is schema-valid (no empty sections).
      expect(() => ResourceContextRecordSchema.parse(record)).not.toThrow();
    }
  });
});
