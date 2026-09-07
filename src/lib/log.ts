/**
 * One JSON object per line, to stdout.
 *
 * There is no logging library here for the same reason there is no queue: the
 * platform is a Node process and a database, and a log line is a string. A
 * hosting platform collects stdout, and one object per line is what makes
 * those lines greppable and machine-readable without an agent.
 *
 * THE RULE, which matters more than the format: fields describe the SHAPE of
 * what happened, never its content. Counts, lengths, durations, identifiers,
 * outcomes — yes. The text of an agreement, an answer to an assessment, a
 * person's name, the contents of a model's reply — no. A governance platform
 * that quietly copies its customers' contracts into a hosting provider's log
 * aggregator has created the disclosure it exists to prevent, and nobody would
 * find out until somebody read the logs.
 *
 * `assistantBodies()` is the one deliberate exception, off by default, loud
 * about what it does, and documented as unfit for production.
 */

export type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Whether to put excerpts of what the model said into the logs.
 *
 * Off unless ASSISTANT_DEBUG_BODIES is set. It exists because "the model
 * answered, but not in a shape that could be read" is very hard to chase
 * without seeing the answer — and a model's reply quotes the document it read,
 * so switching this on puts extracts of somebody's contract into the log
 * stream. For a short debugging session on a system you control, then off.
 */
export function assistantBodies(): boolean {
  return process.env.ASSISTANT_DEBUG_BODIES === "true";
}

/** A bounded excerpt, only ever used behind `assistantBodies()`. */
export function excerpt(text: string, limit = 800): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}… (${text.length} characters)`;
}
