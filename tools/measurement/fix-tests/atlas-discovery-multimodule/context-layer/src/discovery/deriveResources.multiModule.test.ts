import { describe, expect, it } from "vitest";
import type { ServiceIdentity } from "@atlas/schema";

import { deriveServiceResources, deriveServiceSourceRecords } from "./deriveResources";
import type { DiscoveredService } from "./discoverSources";

// A service backed by SEVERAL Terraform modules (e.g. bedrock-agentcore) — the
// 1:N case the discovery model must handle, which the golden fixtures (all 1:1)
// don't exercise.
const identity: ServiceIdentity = {
  provider: "aws",
  id: "bedrock-agentcore",
  name: "Amazon Bedrock AgentCore",
  key: "aws/bedrock-agentcore",
  recallAliases: ["amazon bedrock agentcore", "bedrock agentcore"],
  admissionAliases: ["amazon bedrock agentcore", "bedrock agentcore"],
};

const service: DiscoveredService = {
  identity,
  domain: "AI Services",
  modules: [
    {
      sourceId: "bedrock-module-readme",
      name: "bedrock",
      address: "acme/bedrock/aws",
      headings: ["Private networking", "Getting started"],
      summary: "Provision Bedrock model access from private subnets.",
    },
    {
      sourceId: "bedrock-agentcore-gateway-module-readme",
      name: "bedrock-agentcore-gateway",
      address: "acme/bedrock-agentcore-gateway/aws",
      headings: ["VPC endpoint access", "Usage"],
    },
  ],
};

describe("deriveServiceResources — a service with several modules", () => {
  const [record] = deriveServiceResources([service]);

  it("accumulates one section binding per module, in order, each citing its own module", () => {
    expect(record.sections.network).toEqual([
      {
        source_id: "bedrock-module-readme",
        heading: "Private networking",
        citation_label: "Private networking",
        order: 10,
      },
      {
        source_id: "bedrock-agentcore-gateway-module-readme",
        heading: "VPC endpoint access",
        citation_label: "VPC endpoint access",
        order: 20,
      },
    ]);
    expect(record.sections.examples?.map((binding) => binding.source_id)).toEqual([
      "bedrock-module-readme",
      "bedrock-agentcore-gateway-module-readme",
    ]);
  });

  it("exposes one entry tool per module, disambiguated by module name", () => {
    expect(record.entry_tools).toEqual([
      {
        label: "Terraform module: bedrock",
        url: "https://app.terraform.io/example/registry/modules/acme/bedrock/aws",
      },
      {
        label: "Terraform module: bedrock-agentcore-gateway",
        url: "https://app.terraform.io/example/registry/modules/acme/bedrock-agentcore-gateway/aws",
      },
    ]);
  });

  it("takes the description from the first module that has a summary", () => {
    expect(record.description).toBe("Provision Bedrock model access from private subnets.");
  });

  it("emits one terraform-module Source per module, with distinct titles", () => {
    // deriveServiceSourceRecords also appends the one synthetic availability-matrix
    // source; the per-module sources are the terraform-module ones.
    const moduleSources = deriveServiceSourceRecords([service]).filter(
      (source) => source.source_class === "terraform-module",
    );
    expect(moduleSources.map((source) => source.id)).toEqual([
      "bedrock-module-readme",
      "bedrock-agentcore-gateway-module-readme",
    ]);
    expect(moduleSources.map((source) => source.title)).toEqual([
      "Amazon Bedrock AgentCore — bedrock Terraform Module",
      "Amazon Bedrock AgentCore — bedrock-agentcore-gateway Terraform Module",
    ]);
    expect(moduleSources.map((source) => source.location)).toEqual([
      "acme/bedrock/aws",
      "acme/bedrock-agentcore-gateway/aws",
    ]);
  });
});
