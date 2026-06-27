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

/**
 * ALTCAST-STRIP-2 — the alternate-COST / alternate-TIMING family: spectacle / prowl / surge / miracle (a
 * different cost/timing to cast, body identical for the normal cast) and awaken (ESCAPE-CLASS — the
 * `Awaken N—{cost}` bonus is conditional on the awaken cast, so the normal-cast resolution is the body
 * alone; not offering awaken is a SAFE FN). Same vacuous-line precedent, zero new resolver.
 */
const SPECTACLE = (cost) => `\nSpectacle ${cost} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)`;
const PROWL = (cost) => `\nProwl ${cost} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)`;
const SURGE = (cost) => `\nSurge ${cost} (You may cast this spell for its surge cost if you or a teammate has cast another spell this turn.)`;
const MIRACLE = (cost) => `\nMiracle ${cost} (You may cast this card for its miracle cost when you draw it if it's the first card you drew this turn.)`;
const AWAKEN = (n, cost) => `\nAwaken ${n}—${cost} (If you cast this spell for ${cost}, also put ${n} +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste. It's still a land.)`;

describe("altcast-strip-2 — alt-cost / alt-timing keyword lines are vacuous for the normal cast", () => {
  it("surge bodies flip native (target-draw; uncounterable counter)", () => {
    expect(classifyCard(S("Comparative Analysis", "Target player draws two cards." + SURGE("{2}{U}"), "Instant", "{3}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Overwhelming Denial", "This spell can't be countered.\nCounter target spell." + SURGE("{U}{U}"), "Instant", "{3}{U}"))).toBe("native-spell");
  });
  it("miracle bodies flip native (burn; X-token; tuck)", () => {
    expect(classifyCard(S("Thunderous Wrath", "Thunderous Wrath deals 5 damage to any target." + MIRACLE("{R}"), "Sorcery", "{4}{R}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Entreat the Angels", "Create X 4/4 white Angel creature tokens with flying." + MIRACLE("{X}{W}{W}"), "Sorcery", "{X}{W}{W}{W}"))).toBe("native-spell");
    expect(classifyCard(S("Vanishment", "Put target nonland permanent on top of its owner's library." + MIRACLE("{U}"), "Sorcery", "{3}{U}"))).toBe("native-spell");
  });
  it("awaken bodies flip native — the awaken bonus is gated on the awaken cast (bounce; destroy c-or-pw; counter; opp mass dmg; tapped-restriction)", () => {
    expect(classifyCard(S("Clutch of Currents", "Return target creature to its owner's hand." + AWAKEN(3, "{4}{U}"), "Sorcery", "{U}"))).toBe("native-spell");
    expect(classifyCard(S("Ruinous Path", "Destroy target creature or planeswalker." + AWAKEN(4, "{5}{B}{B}"), "Sorcery", "{2}{B}{B}"))).toBe("native-spell");
    expect(classifyCard(S("Scatter to the Winds", "Counter target spell." + AWAKEN(3, "{4}{U}{U}"), "Instant", "{1}{U}{U}"))).toBe("native-spell");
    expect(classifyCard(S("Boiling Earth", "Boiling Earth deals 1 damage to each creature your opponents control." + AWAKEN(4, "{6}{R}"), "Sorcery", "{1}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Sheer Drop", "Destroy target tapped creature." + AWAKEN(3, "{5}{W}"), "Sorcery", "{3}{W}"))).toBe("native-spell");
  });
  it("spectacle / prowl lines are stripped too (proven on a modeled synthetic body)", () => {
    expect(classifyCard(S("Skewer the Critics", "Skewer the Critics deals 3 damage to any target." + SPECTACLE("{R}"), "Sorcery", "{2}{R}"))).toBe("native-spell");
    expect(classifyCard(S("Morsel Theft", "Target player loses 2 life and you gain 2 life." + PROWL("{1}{B}"), "Instant", "{3}{B}"))).toBe("native-spell");
  });
});

describe("altcast-strip-2 — CREED: a kept/payoff rider or modal add-cost keeps the card on the Arbiter", () => {
  it("a surge-cost-paid PAYOFF rider in the body stays arbiter even though the surge line is stripped (Crush of Tentacles)", () => {
    expect(classifyCard(S("Crush of Tentacles", "Return all nonland permanents to their owners' hands. If this spell's surge cost was paid, create an 8/8 blue Octopus creature token." + SURGE("{3}{U}{U}"), "Sorcery", "{5}{U}{U}"))).not.toMatch(/^native/);
  });
  it("the `Awaken N—` anchor does NOT strip a face-name line ('Awaken the Blood Avatar - Sorcery') — unmodeled body stays arbiter", () => {
    expect(classifyCard(S("Awaken the Blood Avatar", "Awaken the Blood Avatar - Sorcery {6}{B}{R}\nAs an additional cost to cast this spell, you may sacrifice any number of creatures. This spell costs {2} less to cast for each creature sacrificed this way.\nEach opponent sacrifices a creature of their choice. Create a 3/6 black and red Avatar creature token with haste.", "Sorcery", "{6}{B}{R}"))).not.toMatch(/^native/);
  });
  it("a spree card (modal additional costs that add effects) stays arbiter (Lively Dirge)", () => {
    expect(classifyCard(S("Lively Dirge", "Spree (Choose one or more additional costs.)\n+ {1} — Search your library for a card, put it into your graveyard, then shuffle.\n+ {2} — Return up to two creature cards with total mana value 4 or less from your graveyard to the battlefield.", "Sorcery", "{X}{B}"))).not.toMatch(/^native/);
  });
});
