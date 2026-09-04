import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * The words inside an uploaded file.
 *
 * A model cannot read a PDF the way a person does, and this platform has no
 * document-conversion service to hand one to. So the text layer is pulled out
 * here, in Node, with no dependency beyond zlib — the same portability rule
 * the rest of the platform keeps: a Node process and a database.
 *
 * The limits are real and are reported rather than hidden. This reads the text
 * a producing application embedded. It does not read a scan, because a scan
 * has no text to read, and OCR is a different product. Where a file yields
 * nothing usable the caller is told which file and why, so somebody can paste
 * the relevant clause in by hand instead of wondering why the answer was thin.
 */

export type TextResult =
  | { ok: true; text: string; note: string | null }
  | { ok: false; reason: string };

/** Enough to hold a long agreement; past it we are decompressing for its own sake. */
const MAX_TEXT = 400_000;

export function textFrom(contentType: string, bytes: Buffer): TextResult {
  switch (contentType) {
    case "text/plain":
    case "text/csv":
      return finish(bytes.toString("utf8"));
    case "application/pdf":
      return fromPdf(bytes);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return fromDocx(bytes);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return fromXlsx(bytes);
    case "application/msword":
    case "application/vnd.ms-excel":
      return {
        ok: false,
        reason:
          "This is a pre-2007 Office file, whose text cannot be read without a converter. " +
          "Save it as .docx or PDF and attach that.",
      };
    case "image/png":
    case "image/jpeg":
      return {
        ok: false,
        reason:
          "This is an image, so it has no text to read. Reading a scanned agreement " +
          "needs OCR, which the platform does not do.",
      };
    default:
      return { ok: false, reason: `${contentType || "That file type"} cannot be read as text.` };
  }
}

function finish(raw: string): TextResult {
  const text = tidy(raw);
  if (text.length < 40) {
    return {
      ok: false,
      reason:
        "Almost no text came out of this file. If it is a scan, it has no text layer " +
        "and needs OCR before anything can read it.",
    };
  }
  const note = raw.length > MAX_TEXT ? "Only the first part of this file was read." : null;
  return { ok: true, text: text.slice(0, MAX_TEXT), note };
}

function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    // Soft hyphens and zero-width characters, which PDF producers scatter about.
    .replace(/[­​-‍﻿]/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Is this text, or is it what a wrongly-decoded font looks like?
 *
 * A PDF whose fonts are subset with a custom encoding decodes to plausible
 * bytes that are not plausible words. Sending that to a model wastes a request
 * and invites it to invent structure in noise, so it is caught here.
 */
function looksLikeProse(text: string): boolean {
  if (text.length < 200) return false;
  const sane = text.match(/[\p{L}\p{N}\s.,;:()/&'"£$€%–—-]/gu)?.length ?? 0;
  return sane / text.length >= 0.85;
}

/* ------------------------------------------------------------------ PDF */

function fromPdf(bytes: Buffer): TextResult {
  const objects = pdfObjects(bytes);
  const fonts = fontMaps(objects);
  const pieces: string[] = [];
  let total = 0;

  for (const object of objects.values()) {
    if (total > MAX_TEXT) break;
    if (!object.stream || !isContentStream(object.stream)) continue;
    const text = pdfTextOperators(object.stream.toString("latin1"), fonts);
    if (!text) continue;
    pieces.push(text);
    total += text.length;
  }

  const joined = tidy(pieces.join("\n"));
  if (!joined) {
    return {
      ok: false,
      reason:
        "No text layer was found in this PDF. A scanned agreement is a picture of " +
        "words, and needs OCR before anything can read it.",
    };
  }
  if (!looksLikeProse(joined)) {
    return {
      ok: false,
      reason:
        "The text in this PDF could not be decoded into readable words — its fonts " +
        "carry no readable character map. Re-export it from the original application, " +
        "or paste the relevant clauses in by hand.",
    };
  }
  return finish(joined);
}

type PdfObject = { dict: string; stream: Buffer | null };

/**
 * The file's objects, including those hidden inside object streams.
 *
 * From PDF 1.5 a producer may pack most objects into a compressed ObjStm,
 * which is what Word and LibreOffice do. Skipping those loses the font
 * dictionaries, and without those every subset font is unreadable — so they
 * are unpacked here rather than treated as opaque.
 */
function pdfObjects(bytes: Buffer): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const raw = bytes.toString("latin1");
  const header = /(\d+)\s+\d+\s+obj\b/g;

  for (const match of raw.matchAll(header)) {
    const number = Number(match[1]);
    const from = match.index + match[0].length;
    const endObj = raw.indexOf("endobj", from);
    const streamAt = raw.indexOf("stream", from);

    const hasStream = streamAt !== -1 && (endObj === -1 || streamAt < endObj);
    const dict = raw.slice(from, hasStream ? streamAt : endObj === -1 ? from : endObj);

    let stream: Buffer | null = null;
    if (hasStream) {
      let start = streamAt + "stream".length;
      if (bytes[start] === 0x0d) start += 1;
      if (bytes[start] === 0x0a) start += 1;
      const stop = raw.indexOf("endstream", start);
      if (stop !== -1 && stop - start <= 16_000_000) stream = inflateIfPossible(bytes.subarray(start, stop));
    }
    objects.set(number, { dict, stream });
  }

  for (const object of [...objects.values()]) {
    if (object.stream && /\/Type\s*\/ObjStm/.test(object.dict)) unpackObjStm(object, objects);
  }
  return objects;
}

function inflateIfPossible(raw: Buffer): Buffer {
  if (raw.length === 0) return raw;
  try {
    return inflateSync(raw);
  } catch {
    try {
      return inflateRawSync(raw);
    } catch {
      return Buffer.from(raw);
    }
  }
}

/** An object stream is a header of number/offset pairs, then the objects. */
function unpackObjStm(container: PdfObject, into: Map<number, PdfObject>) {
  const body = container.stream!.toString("latin1");
  const count = Number(/\/N\s+(\d+)/.exec(container.dict)?.[1] ?? 0);
  const first = Number(/\/First\s+(\d+)/.exec(container.dict)?.[1] ?? 0);
  if (!count || !first) return;

  const pairs = body.slice(0, first).trim().split(/\s+/).map(Number);
  for (let i = 0; i < count; i += 1) {
    const number = pairs[i * 2];
    const offset = pairs[i * 2 + 1];
    if (!Number.isFinite(number) || !Number.isFinite(offset)) continue;
    const next = i + 1 < count ? first + pairs[i * 2 + 3] : body.length;
    // Objects packed this way never carry a stream of their own.
    if (!into.has(number)) into.set(number, { dict: body.slice(first + offset, next), stream: null });
  }
}

/**
 * Font resource name to character map.
 *
 * A content stream says `/F4 12 Tf` and then shows a string of glyph numbers.
 * Those numbers mean nothing on their own — a subset font renumbers from one —
 * so the font's /ToUnicode map is what turns them back into characters. Every
 * font is keyed by the resource name that selects it, because two subset fonts
 * in one file will both use glyph 1 for different letters.
 */
function fontMaps(objects: Map<number, PdfObject>): Map<string, CharMap> {
  const byName = new Map<string, CharMap>();

  for (const object of objects.values()) {
    const fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(object.dict);
    if (!fontDict) continue;
    for (const entry of fontDict[1].matchAll(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g)) {
      const font = objects.get(Number(entry[2]));
      if (!font) continue;
      const toUnicode = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(font.dict);
      if (!toUnicode) continue;
      const cmap = objects.get(Number(toUnicode[1]));
      if (!cmap?.stream) continue;
      const parsed = parseCMap(cmap.stream.toString("latin1"));
      if (parsed.codes.size > 0) byName.set(entry[1], parsed);
    }
  }
  return byName;
}

type CharMap = { codes: Map<number, string>; bytesPerCode: 1 | 2 };

function parseCMap(text: string): CharMap {
  const codes = new Map<number, string>();
  let wide = false;

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (pair[1].length > 2) wide = true;
      codes.set(parseInt(pair[1], 16), utf16be(pair[2]));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    // <lo> <hi> [<a> <b> ...] — one destination each, in order.
    for (const listed of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      if (listed[1].length > 2) wide = true;
      let code = parseInt(listed[1], 16);
      for (const item of listed[3].matchAll(/<([0-9A-Fa-f]+)>/g)) codes.set(code++, utf16be(item[1]));
    }
    // <lo> <hi> <first> — consecutive destinations from <first>.
    const spans = block[1].replace(/<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*\[[\s\S]*?\]/g, " ");
    for (const span of spans.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      if (span[1].length > 2) wide = true;
      const lo = parseInt(span[1], 16);
      const hi = parseInt(span[2], 16);
      const base = parseInt(span[3], 16);
      // A runaway range would be a corrupt file; a page of text is far smaller.
      if (hi < lo || hi - lo > 65_535) continue;
      for (let code = lo; code <= hi; code += 1) {
        codes.set(code, String.fromCodePoint(base + (code - lo)));
      }
    }
  }
  return { codes, bytesPerCode: wide ? 2 : 1 };
}

function utf16be(hex: string): string {
  const bytes = Buffer.from(hex.length % 2 ? `${hex}0` : hex, "hex");
  let out = "";
  for (let at = 0; at + 1 < bytes.length; at += 2) out += String.fromCharCode(bytes.readUInt16BE(at));
  return out || String.fromCharCode(bytes[0] ?? 0);
}

/**
 * Does this stream hold drawing instructions, or is it a font?
 *
 * A PDF's streams are mostly not text: embedded fonts, colour profiles and
 * images all inflate happily, and scanning them for text operators finds
 * thousands of parenthesised byte sequences that are not words. That noise
 * then fails the prose check and a perfectly readable agreement is refused —
 * which is exactly what happened before this filter existed.
 */
function isContentStream(stream: Buffer): boolean {
  const head = stream.subarray(0, 2048);
  let printable = 0;
  for (const byte of head) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) printable += 1;
  }
  if (head.length === 0 || printable / head.length < 0.9) return false;
  // BT ... ET delimits a text object. No text object, no text.
  return /\bBT\b/.test(stream.subarray(0, 65536).toString("latin1"));
}

/**
 * The text-showing operators of a content stream.
 *
 * Tj and ' take one string; TJ takes an array of strings interleaved with
 * kerning numbers. A large negative kern is how a producer draws a space
 * without emitting one, so it is read as a word break — without that, whole
 * sentences arrive welded into a single token.
 *
 * Line breaks come from the vertical position, not from the mere presence of a
 * positioning operator. Some producers reposition mid-word to kern a pair, and
 * treating every Tm or Td as a new line split "Two" into "T" and "wo".
 */
function pdfTextOperators(content: string, fonts: Map<string, CharMap>): string {
  const token =
    /\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|-?\d+(?:\.\d+)?|\/[^\s/<>[\]()]+|\bT[Jjm*]|\bTD\b|\bTd\b|\bTf\b|\bET\b|\bBT\b|'|"/g;

  const out: string[] = [];
  let pending: string[] = [];
  let font: CharMap | null = null;
  let lastName: string | null = null;
  let inArray = false;
  let numbers: number[] = [];
  let y: number | null = null;

  const flush = () => {
    if (pending.length) out.push(pending.join(""));
    pending = [];
  };
  const moveTo = (next: number | null) => {
    flush();
    if (next === null || y === null || Math.abs(next - y) > 0.6) out.push("\n");
    y = next;
  };

  for (const match of content.matchAll(token)) {
    const text = match[0];
    if (text.startsWith("/")) {
      lastName = text.slice(1);
      continue;
    }
    if (/^-?[\d.]+$/.test(text)) {
      // Inside a TJ array a wide negative kern is a space the producer chose
      // not to emit. Elsewhere the numbers are operands, kept for the operator.
      if (inArray && Number(text) <= -100) pending.push(" ");
      else if (!inArray) numbers.push(Number(text));
      continue;
    }

    switch (text) {
      case "Tf":
        font = (lastName && fonts.get(lastName)) || null;
        break;
      case "[":
        inArray = true;
        break;
      case "]":
        inArray = false;
        break;
      case "TJ":
      case "Tj":
      case "'":
      case '"':
        flush();
        break;
      case "Tm":
        // a b c d e f Tm — f is the vertical translation.
        moveTo(numbers.length >= 6 ? numbers[numbers.length - 1] : null);
        break;
      case "Td":
      case "TD":
        // tx ty Td, relative to the current line.
        moveTo(
          numbers.length >= 2 && y !== null ? y + numbers[numbers.length - 1] : null,
        );
        break;
      case "T*":
      case "ET":
      case "BT":
        moveTo(null);
        break;
      default:
        if (text.startsWith("(")) pending.push(decodeString(pdfLiteralBytes(text.slice(1, -1)), font));
        else if (text.startsWith("<")) pending.push(decodeString(hexBytes(text.slice(1, -1)), font));
        break;
    }
    numbers = [];
  }
  flush();
  return out.join("").replace(/\n{2,}/g, "\n");
}

function decodeString(bytes: Buffer, font: CharMap | null): string {
  if (!font) {
    // No character map: the bytes are the characters, which is true of the
    // standard encodings and near enough for Latin-1 text.
    return bytes.toString("latin1");
  }
  let out = "";
  if (font.bytesPerCode === 2) {
    for (let at = 0; at + 1 < bytes.length; at += 2) out += font.codes.get(bytes.readUInt16BE(at)) ?? "";
  } else {
    for (const byte of bytes) out += font.codes.get(byte) ?? "";
  }
  return out;
}

function pdfLiteralBytes(body: string): Buffer {
  const decoded = body.replace(/\\(\d{1,3}|[\s\S])/g, (_, escape: string) => {
    if (/^\d+$/.test(escape)) return String.fromCharCode(parseInt(escape, 8));
    switch (escape) {
      case "n":
      case "r":
        return "\n";
      case "t":
        return "\t";
      case "b":
      case "f":
        return " ";
      case "\n":
        return "";
      default:
        return escape;
    }
  });
  return Buffer.from(decoded, "latin1");
}

function hexBytes(body: string): Buffer {
  const digits = body.replace(/\s+/g, "");
  if (!digits) return Buffer.alloc(0);
  return Buffer.from(digits.length % 2 ? `${digits}0` : digits, "hex");
}

/* --------------------------------------------------------------- OOXML */

function fromDocx(bytes: Buffer): TextResult {
  const xml = zipEntry(bytes, "word/document.xml");
  if (!xml) return { ok: false, reason: "This .docx file could not be opened." };
  const text = xml
    .toString("utf8")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\b[^>]*\/>/g, "\n");
  return finish(stripTags(text));
}

function fromXlsx(bytes: Buffer): TextResult {
  // The shared string table holds every text cell in the workbook. Cell
  // positions are lost, which for a list of sub-processors costs nothing and
  // saves parsing every sheet.
  const xml = zipEntry(bytes, "xl/sharedStrings.xml");
  if (!xml) {
    return {
      ok: false,
      reason: "No text was found in this spreadsheet — it may hold only numbers or formulas.",
    };
  }
  const text = xml.toString("utf8").replace(/<\/si>/g, "\n");
  return finish(stripTags(text));
}

function stripTags(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/**
 * One file out of a zip archive.
 *
 * An OOXML document is a zip, and Node ships the decompressor but not the
 * container, so the central directory is walked by hand. Only what is needed:
 * stored and deflated entries, no zip64, no encryption.
 */
function zipEntry(bytes: Buffer, wanted: string): Buffer | null {
  const eocd = lastIndexOf(bytes, 0x06054b50);
  if (eocd === -1) return null;

  let at = bytes.readUInt32LE(eocd + 16);
  const count = bytes.readUInt16LE(eocd + 10);

  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) return null;
    const method = bytes.readUInt16LE(at + 10);
    const compressedSize = bytes.readUInt32LE(at + 20);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localAt = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");

    if (name === wanted) {
      if (bytes.readUInt32LE(localAt) !== 0x04034b50) return null;
      const localName = bytes.readUInt16LE(localAt + 26);
      const localExtra = bytes.readUInt16LE(localAt + 28);
      const from = localAt + 30 + localName + localExtra;
      const data = bytes.subarray(from, from + compressedSize);
      try {
        return method === 0 ? Buffer.from(data) : inflateRawSync(data);
      } catch {
        return null;
      }
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

function lastIndexOf(bytes: Buffer, signature: number): number {
  for (let at = bytes.length - 22; at >= 0; at -= 1) {
    if (bytes.readUInt32LE(at) === signature) return at;
  }
  return -1;
}

/* ---------------------------------------------------------------- HTML */

/**
 * A fetched page as text.
 *
 * Script and style are dropped rather than stripped of tags, because their
 * contents are not prose and a sub-processor table drowns in minified CSS.
 */
export function textFromHtml(html: string): string {
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " · ");
  return tidy(stripTags(body)).slice(0, MAX_TEXT);
}
