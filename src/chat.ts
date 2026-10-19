/**
 * Reply-phrasing options of `POST /v1/chat/completions` (the OpenAI-compatible
 * drop-in chat). This SDK has no chat client; pass these fields in the request
 * body of any OpenAI-compatible client (for example as extra body fields).
 */

/**
 * How a personal question answered from stored memory is phrased:
 * `natural` (server default) composes a plain reply from the selected stored
 * sources, checked to add no name or value they lack; `quote` returns the
 * stored source text verbatim. Sources stay cited in `evidence_ids`.
 */
export type ChatAnswerStyle = "natural" | "quote";

export interface ChatAnswerOptions {
  answerStyle?: ChatAnswerStyle;
  /** Reply when no stored source answers (default "I don't know that yet."). */
  noInformationReply?: string;
}

/** Wire fields for `ChatAnswerOptions`; unset options are omitted. */
export interface ChatAnswerFields {
  answer_style?: ChatAnswerStyle;
  no_information_reply?: string;
}

/** Validate `options` and return the request-body fields to send. */
export function chatAnswerFields(options: ChatAnswerOptions = {}): ChatAnswerFields {
  const fields: ChatAnswerFields = {};
  if (options.answerStyle !== undefined) {
    if (options.answerStyle !== "natural" && options.answerStyle !== "quote") {
      throw new Error("answerStyle must be 'natural' or 'quote'");
    }
    fields.answer_style = options.answerStyle;
  }
  if (options.noInformationReply !== undefined) {
    const reply = options.noInformationReply;
    if (typeof reply !== "string" || reply.length < 1 || reply.length > 500) {
      throw new Error("noInformationReply must be 1-500 characters");
    }
    fields.no_information_reply = reply;
  }
  return fields;
}
