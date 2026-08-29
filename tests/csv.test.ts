import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOM, csvCell, exportFilename, toCsv } from "@/lib/csv";

describe("csv cells", () => {
  it("quotes what would otherwise break the row", () => {
    assert.equal(csvCell("plain"), "plain");
    assert.equal(csvCell("has,comma"), '"has,comma"');
    assert.equal(csvCell('has"quote'), '"has""quote"');
    assert.equal(csvCell("has\nnewline"), '"has\nnewline"');
  });

  it("neutralises a formula so a spreadsheet does not run it", () => {
    // Governance exports are full of free text somebody else typed, and they
    // get emailed to auditors. A live payload in that document is the worst
    // possible outcome of a feature meant to demonstrate diligence.
    // Prefixed so it is inert, and quoted because it also contains commas and
    // quotes — the two rules compose.
    assert.equal(
      csvCell('=HYPERLINK("http://x","click")'),
      `"'=HYPERLINK(""http://x"",""click"")"`,
    );
    assert.ok(csvCell("=1+1").startsWith("'"));
    assert.ok(csvCell("+1").startsWith("'"));
    assert.ok(csvCell("-1").startsWith("'"));
    assert.ok(csvCell("@SUM(A1)").startsWith("'"));
    assert.ok(csvCell("\tstarts with tab").startsWith("'"));
  });

  it("leaves an ordinary negative number readable", () => {
    // It is prefixed, because a leading minus is exactly the injection vector.
    // The apostrophe is stripped on display, so the reader still sees -5.
    const cell = csvCell(-5);
    assert.equal(cell, "'-5");
  });

  it("renders dates and objects predictably", () => {
    assert.equal(csvCell(new Date("2026-08-29T10:00:00Z")), "2026-08-29T10:00:00.000Z");
    assert.equal(csvCell({ a: 1 }), '"{""a"":1}"');
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
  });
});

describe("csv documents", () => {
  it("leads with a byte order mark so Excel reads UTF-8", () => {
    const doc = toCsv(["name"], [["Ünïcode"]]);
    assert.ok(doc.startsWith("﻿"));
    assert.ok(doc.includes("Ünïcode"));
  });

  it("separates rows the way every spreadsheet expects", () => {
    const doc = toCsv(["a", "b"], [[1, 2], [3, 4]]);
    assert.equal(doc.replace("﻿", ""), "a,b\r\n1,2\r\n3,4\r\n");
  });

  it("names a file somebody can find again", () => {
    assert.equal(
      exportFilename("risks", "BBC Group", new Date("2026-08-29T00:00:00Z")),
      "bbc-group-risks-2026-08-29.csv",
    );
  });
});

describe("where the byte order mark goes", () => {
  it("can be left off when something else goes first", () => {
    const withMark = toCsv(["a"], [["x"]]);
    const without = toCsv(["a"], [["x"]], false);
    assert.ok(withMark.startsWith(BOM));
    assert.ok(!without.startsWith(BOM));
    assert.ok(without.startsWith("a"));
  });

  it("never lands in the middle, where it corrupts the first column name", () => {
    // The audit export leads with commentary. A mark after that is not a mark
    // at all: a parser reads the first header as "﻿Sequence" and every
    // lookup by name fails.
    const document = BOM + "# a note\n\n" + toCsv(["Sequence", "At"], [[1, "x"]], false);

    // What a reader actually does: strip the mark, then find the header. This
    // is the step that used to yield "\ufeffSequence" and break every
    // lookup by column name.
    const stripped = document.replace(/^\ufeff/, "");
    const header = stripped.split("\n").find((l) => !l.startsWith("#") && l.trim());
    assert.equal(header?.replace(/\r$/, ""), "Sequence,At");
    assert.ok(!stripped.includes(BOM), "no stray mark left anywhere in the file");
  });
});

describe("a connection string that was never filled in", () => {
  // The guard lives in db/client, which connects on import — so the rule is
  // tested here rather than by importing it.
  const PLACEHOLDER = /[…]|<[^>]*>|\bxxx+\b|\byour[-_]?(password|db|database)\b/i;

  it("catches a password abbreviated for display", () => {
    // Documentation writes `postgres:AMdWY…@host` and somebody pastes it. The
    // failure is otherwise a password rejection under a forty-line query dump,
    // which points at the wrong thing entirely.
    assert.ok(PLACEHOLDER.test("postgresql://postgres:AMdWY…@host:5432/railway"));
  });

  it("catches an unreplaced placeholder", () => {
    assert.ok(PLACEHOLDER.test("<DATABASE_PUBLIC_URL>"));
    assert.ok(PLACEHOLDER.test("postgresql://user:xxxxx@host/db"));
    assert.ok(PLACEHOLDER.test("postgresql://user:your-password@host/db"));
  });

  it("leaves a real connection string alone", () => {
    assert.ok(!PLACEHOLDER.test("postgresql://govern:govern@localhost:55432/govern"));
    assert.ok(
      !PLACEHOLDER.test(
        "postgresql://postgres:AMdWYHKIXzRaNWSSgxySaeijheCXebRw@kodama.proxy.rlwy.net:46227/railway",
      ),
    );
  });
});
