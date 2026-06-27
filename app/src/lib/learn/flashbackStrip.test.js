/**
 * flashbackStrip.test.js — FLASHBACK-STRIP: a "Flashback {cost}" line is a from-graveyard recast option,
 * vacuous for normal-cast resolution (the spell's effect is identical), so stripCastKeywordLines now drops
 * it (joining foretell/suspend/splice/cycling/…). A flashback spell flips native iff its BODY is a fully
 * modeled program (all-or-nothing); not modeling the graveyard recast is a SAFE false-negative.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const S = (name, oracle, type = "Sorcery", mana = "{1}{R}") => ({ name, oracle, type, keywords: [], mana });

describe("flashback-strip — a modeled body flips native once the flashback line is stripped", () => {
  it("simple bodies (draw / burn / token / reanimate) flip native-spell", () => {
    expect(classifyCard(S("Think Twice", "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)", "Instant", "{1}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Firebolt", "Firebolt deals 2 damage to any target.\nFlashback {4}{R}", "Sorcery", "{R}"))).toBe("native-spell");
    expect(classifyCard(S("Roar of the Wurm", "Create a 6/6 green Wurm creature token.\nFlashback {3}{G}", "Sorcery", "{5}{G}"))).toBe("native-spell");
    expect(classifyCard(S("Unburial Rites", "Return target creature card from your graveyard to the battlefield.\nFlashback {3}{W}", "Sorcery", "{4}{B}"))).toBe("native-spell");
  });
  it("a multi-clause body (Faithless Looting) + an X body (Devil's Play) flip native", () => {
    expect(classifyCard(S("Faithless Looting", "Draw two cards, then discard two cards.\nFlashback {2}{R}", "Sorcery", "{R}"))).toBe("native-spell");
    expect(classifyCard(S("Devil's Play", "Devil's Play deals X damage to any target.\nFlashback {X}{R}{R}{R}", "Sorcery", "{X}{R}"))).toBe("native-spell");
  });
  it("the flashback-cost-reduction rider (on the flashback line) is stripped with it — body still flips", () => {
    expect(classifyCard(S("Visions of Glory", "Create a 1/1 white Human creature token for each creature you control.\nFlashback {8}{W}{W}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone.", "Sorcery", "{4}{W}{W}"))).toBe("native-spell");
  });
});

describe("flashback-strip — CREED: a non-flashback rider keeps the card on the Arbiter", () => {
  it("a 'if this spell was cast from a graveyard' conditional body stays arbiter (Increasing Confusion)", () => {
    expect(classifyCard(S("Increasing Confusion", "Target player mills X cards. If this spell was cast from a graveyard, that player mills twice that many cards instead.\nFlashback {X}{U}", "Sorcery", "{X}{U}"))).not.toMatch(/^native/);
  });
  it("an unmodeled body (same-name mass exile) stays arbiter (Sever the Bloodline)", () => {
    expect(classifyCard(S("Sever the Bloodline", "Exile target creature and all other creatures with the same name as that creature.\nFlashback {5}{B}{B}", "Sorcery", "{2}{B}"))).not.toMatch(/^native/);
  });
});
