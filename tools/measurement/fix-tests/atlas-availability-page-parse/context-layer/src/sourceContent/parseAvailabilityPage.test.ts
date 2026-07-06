import { describe, expect, it } from "vitest";
import { parseAvailabilityPage } from "./confluenceAvailabilityProvider";

const emo = (name: string, short: string, fallback: string): string =>
  `<ac:emoticon ac:name="${name}" ac:emoji-shortname="${short}" ac:emoji-fallback="${fallback}" />`;
const TICK = emo("tick", ":check_mark:", ":check_mark:");
const INTERIM = emo("blue-star", ":emo:", ":emo:");
const FUTURE = emo("blue-star", ":arrow_upper_right:", "↗️");
const NOTPLANNED = emo("blue-star", ":regional_indicator_x:", "❌");

const LEGEND =
  `<p><strong>Legend</strong> ${TICK}= Available ${INTERIM}= Interim Capability ` +
  `${FUTURE}= Future availability ${NOTPLANNED}= Not planned</p>`;

/** A decorative summary table the parser must ignore (no Regions/Outposts header). */
const AT_A_GLANCE =
  `<table><tbody><tr><th><p>🧩 Total Services</p></th></tr>` +
  `<tr><td><p><strong>2</strong></p></td></tr></tbody></table>`;

function svcRow(nameHtml: string, ...cells: string[]): string {
  return `<tr><td><p>${nameHtml}</p></td>${cells.map((c) => `<td><p>${c}</p></td>`).join("")}</tr>`;
}

describe("parseAvailabilityPage — real Confluence page shape", () => {
  it("maps all four legend statuses and round-trips a planned note", () => {
    const html =
      LEGEND +
      `<table><tbody>` +
      `<tr><td>🌏 Regions</td><td>US-EAST-1 (North Virginia)</td><td>CA-CENTRAL-1 (Canada Central)</td></tr>` +
      `<tr><td>🏠 Landing Zones</td><td>${TICK} L3 - L5</td><td>${TICK} L3 - L5</td></tr>` +
      `<tr><td colspan="3"><strong>■ Storage</strong></td></tr>` +
      svcRow("<ac:link-body>Amazon S3</ac:link-body>", TICK, `${FUTURE} 05/30/2026`) +
      svcRow("Interim Only (IO)", INTERIM, "") +
      svcRow("Dropped (DR)", NOTPLANNED, TICK) +
      `</tbody></table>`;

    const { locations, services } = parseAvailabilityPage(html);

    expect(locations.map((l) => [l.id, l.label, l.sub, l.kind])).toEqual([
      ["us-east-1", "US-EAST-1", "North Virginia", "region"],
      ["ca-central-1", "CA-CENTRAL-1", "Canada Central", "region"],
    ]);

    const s3 = services.find((s) => s.id === "s3")!;
    expect(s3.name).toBe("Amazon S3");
    expect(s3.domain).toBe("Storage");
    expect(s3.availability["us-east-1"]).toEqual({ status: "available" });
    expect(s3.availability["ca-central-1"]).toEqual({ status: "planned", note: "05/30/2026" });

    // Interim maps by its own glyph; an empty cell is absent (⇒ not-planned).
    const io = services.find((s) => s.id === "io")!;
    expect(io.availability["us-east-1"]).toEqual({ status: "interim" });
    expect(io.availability["ca-central-1"]).toBeUndefined();

    const dr = services.find((s) => s.id === "dr")!;
    expect(dr.availability["us-east-1"]).toEqual({ status: "not-planned" });
  });

  it("distinguishes region vs outpost by the header title word and merges a service across tables", () => {
    const html =
      LEGEND +
      AT_A_GLANCE +
      `<table><tbody>` +
      `<tr><td>🌏 Regions</td><td>US-EAST-1 (North Virginia)</td></tr>` +
      `<tr><td colspan="2"><strong>■ Compute</strong></td></tr>` +
      svcRow("EC2", TICK) +
      `</tbody></table>` +
      `<table><tbody>` +
      `<tr><td>🖥️ Outposts</td><td>GDC (Primary Outpost)</td></tr>` +
      `<tr><td colspan="2"><strong>■ Compute</strong></td></tr>` +
      svcRow("EC2", `${FUTURE} 05/30/2026`) +
      `</tbody></table>`;

    const { locations, services } = parseAvailabilityPage(html);

    expect(locations.map((l) => [l.id, l.kind])).toEqual([
      ["us-east-1", "region"],
      ["gdc", "outpost"],
    ]);

    // The At-a-glance table is skipped: only EC2 is a service, and its two rows
    // (region table + outpost table) merge into one record with both columns.
    expect(services).toHaveLength(1);
    const ec2 = services[0]!;
    expect(ec2.id).toBe("ec2");
    expect(ec2.availability["us-east-1"]).toEqual({ status: "available" });
    expect(ec2.availability.gdc).toEqual({ status: "planned", note: "05/30/2026" });
  });
});
