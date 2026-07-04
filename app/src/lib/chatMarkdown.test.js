// K7 markdown-lite tokenizer — pins the behaviors the chat renderer depends on,
// especially that card chips survive untouched and unmatched markers stay literal.
import { describe, expect, it } from "vitest";

import { parseInline, parseMessage } from "./chatMarkdown.js";

describe("parseInline", () => {
  it("keeps [[card]] chips as card tokens", () => {
    expect(parseInline("Cut [[Sol Ring]] for value")).toEqual([
      { kind: "text", value: "Cut " },
      { kind: "card", value: "Sol Ring" },
      { kind: "text", value: " for value" },
    ]);
  });

  it("parses bold, italic, and inline code", () => {
    expect(parseInline("**bold** and *ital* and `code`")).toEqual([
      { kind: "bold", value: "bold" },
      { kind: "text", value: " and " },
      { kind: "italic", value: "ital" },
      { kind: "text", value: " and " },
      { kind: "code", value: "code" },
    ]);
  });

  it("leaves an unmatched marker literal (streaming-safe)", () => {
    expect(parseInline("half **bold")).toEqual([{ kind: "text", value: "half **bold" }]);
  });

  it("does not apply emphasis inside a card name", () => {
    const out = parseInline("[[Ral, Storm Conduit]]");
    expect(out).toEqual([{ kind: "card", value: "Ral, Storm Conduit" }]);
  });
});

describe("parseMessage", () => {
  it("detects headings, bullets, and ordered items", () => {
    const blocks = parseMessage("## Cuts\n- [[Sol Ring]]\n1. Keep this");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1]).toMatchObject({ type: "bullet" });
    expect(blocks[1].inline).toEqual([{ kind: "card", value: "Sol Ring" }]);
    expect(blocks[2]).toMatchObject({ type: "ordered", marker: "1." });
  });

  it("treats a plain line as text", () => {
    const blocks = parseMessage("just a sentence");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
  });
});
