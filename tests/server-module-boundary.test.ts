import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * What a "use server" file may export.
 *
 * Only async functions. Anything else — a constant, a type's runtime value, an
 * object — does not survive to the client: the import resolves to undefined,
 * and the first property read on it throws while rendering.
 *
 * This is not a style rule. A constant exported this way took down every
 * assessment page in any organisation that had configured a model, because the
 * assistant panel initialised its state from one. It failed nowhere else,
 * because the panel only renders when a provider exists — so a local instance
 * without one looked perfectly healthy, and the build did not complain.
 */

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const serverModules = sourceFiles("src").filter((path) => {
  const head = readFileSync(path, "utf8").slice(0, 200);
  return /^\s*["']use server["'];/m.test(head);
});

describe("what a server-action module exports", () => {
  it("finds the server modules to check", () => {
    assert.ok(serverModules.length > 3, `expected several, found ${serverModules.length}`);
  });

  for (const path of serverModules) {
    it(`${path} exports only async functions`, () => {
      const source = readFileSync(path, "utf8");
      const offenders: string[] = [];

      // export const X = ... — unless it is an async arrow function.
      for (const match of source.matchAll(/^export\s+(const|let|var)\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(.*)$/gm)) {
        if (!/^async\s*(\(|function)/.test(match[3].trim())) offenders.push(match[2]);
      }
      // export function X — must be async.
      for (const match of source.matchAll(/^export\s+function\s+([A-Za-z0-9_]+)/gm)) {
        offenders.push(match[1]);
      }
      // export { X } — re-exporting a value from here has the same problem.
      for (const match of source.matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
        if (!/^\s*type\s/.test(match[1])) offenders.push(match[1].trim());
      }

      assert.deepEqual(
        offenders,
        [],
        `${path} exports ${offenders.join(", ")} from a "use server" module. ` +
          `Only async functions survive to the client; move these to a plain module.`,
      );
    });
  }
});
