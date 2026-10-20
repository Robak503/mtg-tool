/**
 * softCounterPanelWording.test.jsx — the pay-or-be-countered panel (SoftCounterPanel) says what is threatened and offers every way
 * the ward can be paid.
 *
 *   · A ward on an ABILITY (CR 702.21a — "a spell or ability an opponent controls") threatens the ability, not its source card: the
 *     panel read "<b>Ravenous Chupacabra</b> will be countered" for the Chupacabra's enters trigger, as if the creature spell were
 *     about to be countered. The driver now says which (`decision.objectKind`, "spell" | "ability").
 *   · A ward with two ways to pay ("Ward—Discard a card or pay {2}", Titania, Rugged Rumbler) is one button per way, each enabled by
 *     its own affordability (`decision.optionsAffordable`); a cost of several parts ("Ward—{2}, Pay 2 life") reads as all of them;
 *     a cost the game can't take says so.
 *
 * SSR render via react-dom/server (the project bans jsdom/RTL — see SimCenter.test.jsx). The spell wording is pinned unchanged by
 * LearnViewRenderFingerprint.test.jsx's snapshot as well.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SoftCounterPanel, wardCostLabel } from "./learnDecisionPanels.jsx";

const MANA_2 = { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };
const render = (decision) => renderToStaticMarkup(<SoftCounterPanel decision={{ kind: "soft-counter", ...decision }} onChoose={() => {}} />);
/** Each button's label and whether it is disabled. */
const buttons = (html) => [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map((m) => [m[2], /\bdisabled=""/.test(m[1])]);

describe("SoftCounterPanel — what is threatened", () => {
  it("⭐ a ward on an ability names the ability, not the card: \"Ravenous Chupacabra’s ability will be countered unless you pay {2}.\"", () => {
    const html = render({ cost: MANA_2, spellName: "Ravenous Chupacabra", sourceName: "Leonin Lightbringer", objectKind: "ability" });
    console.log(`  WITNESS panel-ability ${JSON.stringify(html.match(/<b>.*?\./)?.[0] ?? html)}`);
    expect(html).toContain("<b>Ravenous Chupacabra</b>’s ability will be countered unless you pay {2}.");
    expect(html).not.toContain("<b>Ravenous Chupacabra</b> will be countered");
  });

  it("control: a spell reads as before — \"Murder will be countered unless you pay {2}.\" (both trees)", () => {
    expect(render({ cost: MANA_2, spellName: "Murder", sourceName: "Leonin Lightbringer", objectKind: "spell" })).toContain("<b>Murder</b> will be countered unless you pay {2}.");
    expect(render({ cost: MANA_2, sourceName: "S" })).toContain("Your spell will be countered unless you pay {2}.");
  });
});

describe("SoftCounterPanel — every way to pay", () => {
  it("⭐ 'Discard a card or pay {2}': one button per way, the one you can't afford disabled, and the decline", () => {
    const html = render({ cost: { kind: "any", options: [{ kind: "discard", n: 1 }, MANA_2] }, optionsAffordable: [false, true], affordable: true, spellName: "Murder", objectKind: "spell", sourceName: "Titania, Rugged Rumbler" });
    const row = buttons(html);
    console.log(`  WITNESS panel-any ${JSON.stringify(row)}`);
    expect(row).toEqual([["Discard a card", true], ["Pay {2}", false], ["Let it be countered", false]]);
  });

  it("⭐ a cost of several parts reads as all of them; a random discard and a cost the game can't take name themselves", () => {
    const row = [
      wardCostLabel({ cost: { kind: "all", parts: [MANA_2, { kind: "life", life: 2 }] } }),
      wardCostLabel({ cost: { kind: "all", parts: [{ kind: "life", life: 3 }, { kind: "discard", n: 1 }] } }),
      wardCostLabel({ cost: { kind: "discard-random", count: 1 } }),
      wardCostLabel({ cost: { kind: "unpayable", text: "Sacrifice a creature" } }),
    ];
    console.log(`  WITNESS panel-labels ${JSON.stringify(row)}`);
    expect(row).toEqual(["Pay {2} and 2 life", "Pay 3 life and discard a card", "Discard a card at random", "Sacrifice a creature"]);
  });

  it("⭐ a cost the game can't take: the pay button is disabled and the panel says why", () => {
    const html = render({ cost: { kind: "unpayable", text: "Sacrifice a creature" }, affordable: false, spellName: "Murder", objectKind: "spell", sourceName: "Vein Ripper" });
    console.log(`  WITNESS panel-unpayable ${JSON.stringify(buttons(html))}`);
    expect(buttons(html)).toEqual([["Sacrifice a creature", true], ["Let it be countered", false]]);
    expect(html).toContain("This game can’t take that payment yet");
  });
});
