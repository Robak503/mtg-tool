import assert from "node:assert/strict";
import test from "node:test";
import { createReadingPreferences } from "../src/readingPreferences.js";
import { createConversationSession } from "../src/conversationSession.js";

test("reading preferences persist only the allowed fields and report failed saves", () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const preferences = createReadingPreferences(storage);
  assert.equal(preferences.update({ largeText: true, conversation: "private" }).saved, true);
  assert.equal(saved.includes("private"), false);
  assert.equal(createReadingPreferences(storage).snapshot().largeText, true);
  assert.equal(preferences.reset().largeText, false);
  assert.equal(createReadingPreferences({ setItem() { throw new Error("full"); } }).update({ showArt: false }).saved, false);
  saved = '{"schemaVersion":1,"largeText":"false","showArt":false}';
  assert.equal(createReadingPreferences(storage).snapshot().largeText, false);
  assert.equal(createReadingPreferences(storage).snapshot().showArt, false);
});

test("session never guesses what a pronoun means in a new interaction", () => {
  const session = createConversationSession();
  session.remember({ answerTrusted: true, subject: { kind: "card", name: "Omnath" } });
  assert.equal(session.resolve("Can it survive combat?").contextLabel, null);
  assert.equal(session.resolve("show it again").contextLabel, "Omnath");
  session.remember({ answerTrusted: false });
  assert.equal(session.resolve("show it again").contextLabel, null);
});
