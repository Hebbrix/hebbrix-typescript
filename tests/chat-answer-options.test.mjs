import assert from "node:assert/strict";
import test from "node:test";
import { chatAnswerFields } from "../dist/index.mjs";

test("chat answer options map to the wire fields and are omitted unless set", () => {
  assert.deepEqual(chatAnswerFields(), {});
  assert.deepEqual(chatAnswerFields({ answerStyle: "quote", noInformationReply: "Not on file yet." }), {
    answer_style: "quote",
    no_information_reply: "Not on file yet.",
  });
  assert.deepEqual(chatAnswerFields({ answerStyle: "natural" }), { answer_style: "natural" });
});

for (const options of [
  { answerStyle: "verbatim" },
  { noInformationReply: "" },
  { noInformationReply: "x".repeat(501) },
]) {
  test(`invalid chat answer options are rejected: ${JSON.stringify(options).slice(0, 40)}`, () => {
    assert.throws(() => chatAnswerFields(options), /answerStyle|noInformationReply/);
  });
}
