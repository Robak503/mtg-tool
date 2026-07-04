/**
 * chatMarkdown.js — a zero-dependency markdown-lite tokenizer for agent chat
 * bubbles (wave K7). Agents like Karn emit `## Cuts`, `**bold**`, `- lists`,
 * and `` `inline code` `` that used to render as raw glyphs. This turns a raw
 * string into a flat list of block + inline tokens the renderer maps to JSX —
 * card chips (`[[Name]]`) stay a token kind so the existing chip UI (art +
 * hover + link) is reused verbatim.
 *
 * Deliberately tiny and line-oriented so it's streaming-safe: a half-written
 * `**bold` with no closer renders as literal text, never a broken span.
 */

// Split a single line's text into inline tokens. Order matters: card chips are
// pulled first (they can contain spaces + punctuation), then code, then bold,
// then italic, over the remaining plain runs.
export function parseInline(text) {
  return splitCards(text).flatMap((seg) =>
    seg.kind === "card" ? [seg] : splitCode(seg.value),
  );
}

function splitCards(text) {
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "card", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.length ? out : [{ kind: "text", value: text }];
}

function splitCode(text) {
  const out = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...splitEmphasis(text.slice(last, m.index)));
    out.push({ kind: "code", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(...splitEmphasis(text.slice(last)));
  return out;
}

// Bold (**x**) then italic (*x* / _x_) over plain runs. Unmatched markers are
// left as literal text.
function splitEmphasis(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: "bold", value: m[1] });
    else out.push({ kind: "italic", value: m[2] ?? m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.length ? out : [{ kind: "text", value: text }];
}

/**
 * Parse a full message into block tokens. Each block:
 *   { type: "heading", level: 1..3, inline: [...] }
 *   { type: "bullet",  inline: [...] }
 *   { type: "ordered", marker: "1.", inline: [...] }
 *   { type: "text",    inline: [...] }   // ordinary line (may be blank)
 * Consumers render block-by-block; inline tokens come from parseInline.
 */
export function parseMessage(raw) {
  const lines = String(raw ?? "").split("\n");
  return lines.map((line) => {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) return { type: "heading", level: heading[1].length, inline: parseInline(heading[2]) };
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) return { type: "bullet", inline: parseInline(bullet[1]) };
    const ordered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (ordered) return { type: "ordered", marker: `${ordered[1]}.`, inline: parseInline(ordered[2]) };
    return { type: "text", inline: parseInline(line) };
  });
}
