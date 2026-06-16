import { describe, expect, test } from "vitest";

import { extractVscodeRecords, type VscodeReadCtx } from "../../../src/inspect/vscodeReader.js";

describe("extractVscodeRecords — transcripts", () => {
  test("pulls tool requests out of an assistant.message event and tags the session", () => {
    const ctx: VscodeReadCtx = {};
    // session.start declares the session id; it carries no tool requests.
    expect(
      extractVscodeRecords(
        { type: "session.start", data: { sessionId: "S1" }, timestamp: "2026-06-07T11:40:08.130Z" },
        ctx,
      ),
    ).toEqual([]);
    expect(ctx.session).toBe("S1");

    const recs = extractVscodeRecords(
      {
        type: "assistant.message",
        timestamp: "2026-06-07T11:40:11.839Z",
        data: {
          content: "查看状态",
          toolRequests: [
            {
              toolCallId: "call_1",
              name: "run_in_terminal",
              arguments: '{"command":"git status --short"}',
              type: "function",
            },
          ],
        },
      },
      ctx,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].tool_name).toBe("run_in_terminal");
    // arguments stays a JSON string — normalize()'s parseToolInput handles it.
    expect(recs[0].tool_input).toBe('{"command":"git status --short"}');
    expect(recs[0].timestamp).toBe("2026-06-07T11:40:11.839Z");
    expect(recs[0].sessionId).toBe("S1");
  });

  test("emits multiple records for a message with several tool requests", () => {
    const recs = extractVscodeRecords({
      type: "assistant.message",
      data: {
        toolRequests: [
          { name: "read_file", arguments: '{"filePath":"a.ts"}' },
          { name: "grep_search", arguments: '{"query":"foo"}' },
        ],
      },
    });
    expect(recs.map((r) => r.tool_name)).toEqual(["read_file", "grep_search"]);
  });

  test("non-tool events (user.message, turn markers) yield nothing", () => {
    expect(extractVscodeRecords({ type: "user.message", data: { content: "hi" } })).toEqual([]);
    expect(extractVscodeRecords({ type: "assistant.turn_start", data: { turnId: 0 } })).toEqual([]);
  });

  test("a toolRequest without a name is skipped", () => {
    expect(
      extractVscodeRecords({
        type: "assistant.message",
        data: { toolRequests: [{ arguments: "{}" }, { name: "read_file", arguments: "{}" }] },
      }),
    ).toHaveLength(1);
  });
});

describe("extractVscodeRecords — chatSessions", () => {
  test("an empty requests snapshot yields nothing (the live stub case)", () => {
    expect(extractVscodeRecords({ kind: 0, v: { requests: [] } })).toEqual([]);
  });

  test("descends v.requests[].response[] tool-invocation parts when populated", () => {
    const recs = extractVscodeRecords({
      kind: 0,
      v: {
        requests: [
          {
            response: [
              { kind: "markdownContent", value: "text part, not a tool" },
              {
                kind: "toolInvocationSerialized",
                toolId: "copilot_readFile",
                toolInput: { filePath: "a.ts" },
                resultDetails: "y".repeat(40),
              },
            ],
          },
        ],
      },
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].tool_name).toBe("copilot_readFile");
    expect(recs[0].tool_response).toBe("y".repeat(40));
  });
});

describe("extractVscodeRecords — robustness", () => {
  test("never throws on junk input", () => {
    for (const junk of [null, undefined, 42, "str", [], { nope: true }, { type: 1 }]) {
      expect(extractVscodeRecords(junk)).toEqual([]);
    }
  });
});
