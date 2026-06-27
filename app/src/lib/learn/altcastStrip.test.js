/**
 * altcastStrip.test.js — ALTCAST-STRIP: jump-start / retrace / escape / madness are alternative ways to
 * CAST the card (a from-graveyard recast, or a cast-from-exile on discard), none of which changes the
 * spell's resolution when it is cast NORMALLY. So stripCastKeywordLines now drops those keyword lines too
 * (joining foretell/suspend/cycling/flashback/…), letting the BODY parse. The recast itself stays a SAFE
 * false-negative. CREED: any kept/payoff rider lives in the BODY (madness-cost-paid / escape "doesn't
 * untap" / kicked), so it self-gates the card to the Arbiter — stripping the keyword line cannot fabricate
 * it. A COMPOUND madness line ("Madness {R}, …, buyback {4}{R}") is NOT stripped, because buyback's kept
 * return-to-hand effect lives only on that line.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const S = (name, oracle, type = "Sorcery", mana = "{1}{R}") => ({ name, oracle, type, keywords: [], mana });
const MADNESS = (cost) => `\nMadness ${cost} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)`;
const JUMPSTART = "\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)";
const RETRACE = "\nRetrace (You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.)";

describe("altcast-strip — a modeled body flips native once the alt-cast line is stripped", () => {
  it("jump-start bodies (draw / burn / pump+grant) flip native-spell", () => {
    expect(classifyCard(S("Chemister's Insight", "Draw two cards." + JUMPSTART, "Instant", "{3}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Direct Current", "Direct Current deals 2 damage to any target." + JUMPSTART, "Sorcery", "{1}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Maximize Velocity", "Target creature gets +1/+1 and gains haste until end of turn." + JUMPSTART, "Instant", "{R}"))).toBe("native-spell");
  });
  it("retrace bodies (burn / target-discard / count-scaled token) flip native-spell", () => {
    expect(classifyCard(S("Flame Jab", "Flame Jab deals 1 damage to any target." + RETRACE, "Sorcery", "{R}"))).toBe("native-spell");
    expect(classifyCard(S("Raven's Crime", "Target player discards a card." + RETRACE, "Sorcery", "{B}"))).toBe("native-spell");
    expect(classifyCard(S("Worm Harvest", "Create a 1/1 black and green Worm creature token for each land card in your graveyard." + RETRACE, "Sorcery", "{3}{B}{G}"))).toBe("native-spell");
  });
  it("madness bodies (burn / bounce / mass -X/-X / counter) flip native-spell", () => {
    expect(classifyCard(S("Fiery Temper", "Fiery Temper deals 3 damage to any target." + MADNESS("{R}"), "Instant", "{1}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Just the Wind", "Return target creature to its owner's hand." + MADNESS("{U}"), "Instant", "{2}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Biting Rain", "All creatures get -2/-2 until end of turn." + MADNESS("{2}{B}"), "Sorcery", "{3}{B}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Broken Concentration", "Counter target spell." + MADNESS("{3}{U}"), "Instant", "{4}{U}"))).toBe("native-spell");
  });
  it("escape bodies (draw / lose-life) flip native-spell — the 'Exile N cards' alt-cost is vacuous for normal cast", () => {
    expect(classifyCard(S("Glimpse of Freedom", "Draw a card.\nEscape—{2}{U}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)", "Instant", "{U}"))).toBe("native-spell");
    expect(classifyCard(S("Fruit of Tizerus", "Target player loses 2 life.\nEscape—{3}{B}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)", "Sorcery", "{B}"))).toBe("native-spell");
  });
});

describe("altcast-strip — CREED: a kept/payoff rider keeps the card on the Arbiter", () => {
  it("a COMPOUND madness line (madness + buyback) is NOT stripped — buyback's return-to-hand is non-vacuous (Blast from the Past)", () => {
    expect(classifyCard(S("Blast from the Past", "Madness {R}, cycling {1}{R}, kicker {2}{R}, flashback {3}{R}, buyback {4}{R}\nBlast from the Past deals 2 damage to any target. If this spell was kicked, create a 1/1 red Goblin creature token.", "Instant", "{3}{R}"))).not.toMatch(/^native/);
  });
  it("a madness-cost-paid PAYOFF rider in the body stays arbiter even though the madness line is stripped (Avacyn's Judgment)", () => {
    expect(classifyCard(S("Avacyn's Judgment", "Avacyn's Judgment deals 2 damage divided as you choose among any number of targets. If this spell's madness cost was paid, it deals X damage divided as you choose among those permanents and/or players instead." + MADNESS("{X}{R}"), "Sorcery", "{3}{R}"))).not.toMatch(/^native/);
  });
  it("an escape spell with an unmodeled body clause stays arbiter (Sleep of the Dead — doesn't untap)", () => {
    expect(classifyCard(S("Sleep of the Dead", "Tap target creature. It doesn't untap during its controller's next untap step.\nEscape—{2}{U}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)", "Sorcery", "{1}{U}"))).not.toMatch(/^native/);
  });
});
