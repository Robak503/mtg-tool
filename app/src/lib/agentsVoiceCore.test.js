/**
 * agentsVoiceCore.test.js — the VOICE-FIDELITY GUARD (roadmap wave 2 item 7).
 *
 * The room guides are one mind wearing different faces. That claim is only true if every face actually
 * carries the same core, and the failure mode is silent: someone edits one face's prompt, the shared block
 * drifts or is dropped, and the faces begin contradicting each other in ways no test notices because every
 * prompt is still a valid string.
 *
 * Omnath specced this guard so it cannot be hollow, and his wording is the spec: "assert ROOM_GUIDE_CORE is
 * a substring of each composed prompt, for all five faces. Mutation-check it by deleting the core from one
 * face's composition and watching that face's assertion — and ONLY that one — fail. A test that passes when
 * the core is removed is not a guard."
 *
 * MUTATION-CHECKED as specced: deleting ROOM_GUIDE_CORE from composeGuidePrompt fails all three composed
 * chat faces; deleting it from a single rail's array fails that rail alone. Both were run before this file
 * was committed.
 *
 * WHY TWO SURFACES. The faces exist twice, and both must carry the core or the claim is half-true:
 *   - the CHAT prompts in agents.js (Jace / Karn / Tibalt), composed by composeGuidePrompt
 *   - the ROOM prompts in the rail components (jaceSystem / karnSystem / teferiSystem / vihaanSystem)
 * Tibalt has no rail on purpose — he is a mode, not a room — so his core arrives via the chat prompt only.
 */
import { describe, expect, it } from "vitest";

import {
  ROOM_GUIDE_CORE,
  composeGuidePrompt,
  JACE_DELTA, KARN_DELTA, TIBALT_DELTA, VIHAAN_DELTA, TEFERI_DELTA,
  JACE_PROMPT, KARN_PROMPT, TIBALT_PROMPT,
  ARBITER_PROMPT, AGENTS,
} from "./agents.js";

describe("the core itself", () => {
  it("is a non-trivial block, not an empty string a drop would hide", () => {
    // A guard that asserts `includes("")` passes on every input. Pin the size so the assertions below mean
    // something.
    expect(ROOM_GUIDE_CORE.length).toBeGreaterThan(800);
    expect(ROOM_GUIDE_CORE).toContain("one mind wearing different faces");
    expect(ROOM_GUIDE_CORE).toContain("TRUTH CONDUCT");
  });

  it("composeGuidePrompt puts core FIRST, then the delta, then the body", () => {
    const out = composeGuidePrompt("DELTA-MARKER", "BODY-MARKER");
    expect(out.indexOf(ROOM_GUIDE_CORE)).toBe(0);
    expect(out.indexOf("DELTA-MARKER")).toBeGreaterThan(0);
    expect(out.indexOf("BODY-MARKER")).toBeGreaterThan(out.indexOf("DELTA-MARKER"));
  });
});

describe("CHAT surface — every composed face carries the core AND its own delta", () => {
  const FACES = [
    ["Jace", JACE_PROMPT, JACE_DELTA],
    ["Karn", KARN_PROMPT, KARN_DELTA],
    ["Tibalt", TIBALT_PROMPT, TIBALT_DELTA],
  ];

  it.each(FACES)("%s", (_name, prompt, delta) => {
    expect(prompt).toContain(ROOM_GUIDE_CORE);
    expect(prompt).toContain(delta);
  });

  it("and the AGENTS registry serves the COMPOSED prompt, not a bare body", () => {
    // The registry is what the UI and the chat routes actually read. If it ever pointed at a raw body the
    // faces would silently lose the core in production while this file still passed on the exports.
    expect(AGENTS.jace.prompt).toContain(ROOM_GUIDE_CORE);
    expect(AGENTS.karn.prompt).toContain(ROOM_GUIDE_CORE);
    expect(AGENTS.tibalt.prompt).toContain(ROOM_GUIDE_CORE);
  });

  it("the functional BODY survives composition — the delta is voice, not a replacement", () => {
    // Karn's deck-inventory discipline is law (Omnath's read-through said so explicitly). Composing must
    // not have swallowed it.
    expect(KARN_PROMPT).toContain("MANDATORY DECK INVENTORY");
    expect(JACE_PROMPT.length).toBeGreaterThan(ROOM_GUIDE_CORE.length + JACE_DELTA.length);
  });
});

describe("ROOM surface — the four rail guides carry the core too", () => {
  // The faces exist TWICE, and covering only the chat prompts would make this guard half a guard: the room
  // rails are what the user actually talks to inside a wing. Reached through each rail's exported *_GUIDE
  // config (its `systemPrompt`), which is the same object the RoomRail renders — so if the registry ever
  // pointed somewhere else, this fails rather than testing a function nobody calls.
  it.each([
    ["Jace / Academy", () => import("../components/mtg/AcademyRail.jsx").then((m) => m.JACE_GUIDE), JACE_DELTA],
    ["Teferi / Crucible", () => import("../components/mtg/CrucibleRail.jsx").then((m) => m.TEFERI_GUIDE), TEFERI_DELTA],
    ["Karn / Foundry", () => import("../components/mtg/FoundryRail.jsx").then((m) => m.KARN_GUIDE), KARN_DELTA],
    ["Vihaan / Vault", () => import("../components/mtg/VaultRail.jsx").then((m) => m.VIHAAN_GUIDE), VIHAAN_DELTA],
  ])("%s", async (_label, load, delta) => {
    const guide = await load();
    const prompt = guide.systemPrompt(null);   // null payload — the live-data tail is irrelevant here
    expect(prompt).toContain(ROOM_GUIDE_CORE);
    expect(prompt).toContain(delta);
  });

  it("and no rail still points at THE AGENTS — a room wave-3 re-homes away", () => {
    // Omnath's read-through caught this: the surviving lane lines named a room that the Foundry re-home
    // deletes, which would send the user somewhere that no longer exists. The deltas are room-agnostic
    // ("Karn's bench"); the charters now match.
    return Promise.all([
      import("../components/mtg/AcademyRail.jsx").then((m) => m.JACE_GUIDE),
      import("../components/mtg/CrucibleRail.jsx").then((m) => m.TEFERI_GUIDE),
      import("../components/mtg/FoundryRail.jsx").then((m) => m.KARN_GUIDE),
      import("../components/mtg/VaultRail.jsx").then((m) => m.VIHAAN_GUIDE),
    ]).then((guides) => {
      for (const g of guides) expect(g.systemPrompt(null)).not.toContain("The Agents");
    });
  });
});

describe("the deltas stay distinct — a copy-paste drift would collapse them", () => {
  it("no two faces share a delta", () => {
    const deltas = [JACE_DELTA, KARN_DELTA, TIBALT_DELTA, VIHAAN_DELTA, TEFERI_DELTA];
    expect(new Set(deltas).size).toBe(deltas.length);
  });

  it("each delta names its own face", () => {
    expect(JACE_DELTA).toContain("You are JACE");
    expect(KARN_DELTA).toContain("You are KARN");
    expect(TIBALT_DELTA).toContain("You are TIBALT");
    expect(VIHAAN_DELTA).toContain("You are VIHAAN");
    expect(TEFERI_DELTA).toContain("You are TEFERI");
  });
});

describe("CREED — the core is scoped to the room guides, and only them", () => {
  it("the ARBITER does NOT carry it", () => {
    // The Arbiter is an instrument, not a face. The core opens "you are one of several guides", which would
    // be a false frame for a deterministic rules engine — and it is Ollama-only by standing rule.
    expect(ARBITER_PROMPT).not.toContain(ROOM_GUIDE_CORE);
  });

  it("OMNATH does NOT carry it either, and that is deliberate", () => {
    // Omnath's room is the LONG VIEW, not a sixth guide — the core's "one of several guides" is the wrong
    // frame for the room that keeps the shape of the whole thing. His truth conduct is restated in-prompt
    // instead, so the exclusion costs nothing; that restatement is pinned here so the exclusion can never
    // quietly become a gap.
    const p = AGENTS.omnath.prompt;
    expect(p).not.toContain(ROOM_GUIDE_CORE);
    expect(p).toContain("IRON RULES");
    expect(p).toContain("never from memory");
    expect(p).toContain("Never invent a rule number");
  });
});

describe("KARN's collection lane (Forge-as-a-Karn-function, Colton's O3 ruling)", () => {
  it("Karn may read OWNERSHIP as a build input", () => {
    // Colton's ruling, verbatim: "just make a function of the ai inside the foundry to help you forge
    // decks." Forge is a CAPABILITY of Karn, not a room — so the bench needs ownership as an input.
    expect(KARN_DELTA).toContain("COLLECTION:");
    expect(KARN_DELTA).toContain("build input");
  });

  it("…and still routes VALUE to Vihaan — the boundary that stops the faces colliding", () => {
    // Same card, two different questions: Karn asks "do you own it?", Vihaan asks "what is it worth?".
    // Without this line the two faces would both answer collection questions and contradict each other,
    // which is precisely what the shared-core design exists to prevent.
    expect(KARN_DELTA).toContain("Vihaan's lane");
    expect(KARN_PROMPT).toContain("COLLECTION:");
  });
});
