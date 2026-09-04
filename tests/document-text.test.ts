import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { textFrom, textFromHtml } from "@/lib/documents/text";

/**
 * The fixtures are real files from three producers, not hand-written bytes.
 *
 * That matters more than the count of assertions. Every failure this extractor
 * has had came from a producer doing something legal that a synthetic fixture
 * would never do — embedding a subset font, packing objects into a compressed
 * stream, kerning mid-word with a positioning operator.
 */
const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/fixtures", name));

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("reading an agreement", () => {
  it("reads a PDF with a standard font encoding", () => {
    const read = textFrom(PDF, fixture("simple-text.pdf"));
    assert.ok(read.ok, read.ok ? "" : read.reason);
    assert.match(read.text, /Standard Contractual Clauses/);
    assert.match(read.text, /Twilio Ireland Limited/);
  });

  it("reads a PDF whose fonts are subset, via its character map", () => {
    // Chrome, Word and InDesign all produce these. Before ToUnicode support
    // this file decoded to glyph numbers and was refused.
    const read = textFrom(PDF, fixture("subset-font.pdf"));
    assert.ok(read.ok, read.ok ? "" : read.reason);
    assert.match(read.text, /Amazon Web Services EMEA SARL/);
    assert.match(read.text, /Decision 2021\/914/);
  });

  it("keeps words whole when the producer kerns mid-word", () => {
    const read = textFrom(PDF, fixture("subset-font.pdf"));
    assert.ok(read.ok);
    assert.match(read.text, /Module Two/);
    assert.doesNotMatch(read.text, /\bT\nwo\b/);
  });

  it("finds the address of a sub-processor list held elsewhere", () => {
    const read = textFrom(PDF, fixture("subset-font.pdf"));
    assert.ok(read.ok);
    assert.match(read.text, /https:\/\/example\.com\/legal\/subprocessors/);
  });

  it("reads a .docx", () => {
    const read = textFrom(DOCX, fixture("agreement.docx"));
    assert.ok(read.ok, read.ok ? "" : read.reason);
    assert.match(read.text, /Authorised Sub-processors/);
    assert.match(read.text, /Datadog Inc\./);
  });

  it("reads plain text and CSV as themselves", () => {
    const csv = Buffer.from("supplier,country\nDatadog Inc.,United States\nTwilio,Ireland\n".repeat(3));
    const read = textFrom("text/csv", csv);
    assert.ok(read.ok);
    assert.match(read.text, /Datadog Inc\./);
  });
});

describe("what it will not pretend to read", () => {
  it("refuses an image, and says OCR is the missing thing", () => {
    const read = textFrom("image/png", Buffer.from("\x89PNG\r\n\x1a\n"));
    assert.equal(read.ok, false);
    assert.match(read.ok ? "" : read.reason, /OCR/);
  });

  it("refuses a scanned PDF rather than returning nothing quietly", () => {
    // A PDF with no text object at all — what a scan looks like.
    const scan = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<</Type /Page>>\nendobj\n" +
        "2 0 obj\n<</Length 20>>\nstream\nq 100 0 0 100 0 0 cm /Im1 Do Q\nendstream\nendobj\n%%EOF",
    );
    const read = textFrom(PDF, scan);
    assert.equal(read.ok, false);
    assert.match(read.ok ? "" : read.reason, /no text layer|OCR/i);
  });

  it("refuses a pre-2007 Office file and names the fix", () => {
    const read = textFrom("application/msword", Buffer.from("\xd0\xcf\x11\xe0old word"));
    assert.equal(read.ok, false);
    assert.match(read.ok ? "" : read.reason, /\.docx or PDF/);
  });

  it("refuses a file that yields almost nothing", () => {
    const read = textFrom("text/plain", Buffer.from("hi"));
    assert.equal(read.ok, false);
  });
});

describe("a fetched page", () => {
  it("keeps the table of sub-processors and drops the scaffolding", () => {
    const html = `<html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><h1>Sub-processors</h1>
      <table><tr><td>Amazon Web Services</td><td>Hosting</td><td>Ireland</td></tr>
      <tr><td>Datadog Inc.</td><td>Monitoring</td><td>United States</td></tr></table>
      </body></html>`;
    const text = textFromHtml(html);
    assert.match(text, /Amazon Web Services · Hosting · Ireland/);
    assert.match(text, /Datadog Inc\./);
    assert.doesNotMatch(text, /alert\(1\)/);
    assert.doesNotMatch(text, /color:red/);
  });

  it("decodes the entities a page is written with", () => {
    assert.match(textFromHtml("<p>Smith &amp; Co &lt;EU&gt;</p>"), /Smith & Co <EU>/);
  });
});
