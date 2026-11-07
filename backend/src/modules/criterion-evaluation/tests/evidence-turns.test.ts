import assert from "node:assert/strict";
import test from "node:test";
import { evidenceMessageIdsToTurns, messageIdToEvidenceTurn } from "../application/evidence-turns.js";

test("converts zero-based stable message IDs to original one-based transcript turns", () => {
  assert.equal(messageIdToEvidenceTurn("m0000"), 1);
  assert.equal(messageIdToEvidenceTurn("p1-ru-001:m0009"), 10);
  assert.deepEqual(evidenceMessageIdsToTurns(["m0011", "conversation:m0001"]), [12, 2]);
});

test("rejects non-stable evidence IDs", () => assert.throws(() => messageIdToEvidenceTurn("operator-1")));
