import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { documents, entities, organisations } from "@/db/schema";
import {
  ACCEPTED,
  ContentAltered,
  MAX_BYTES,
  UploadRefused,
  attachDocument,
  documentsFor,
  readDocument,
  removeDocument,
} from "@/services/documents";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "documents.test" };
const PDF = Buffer.from("%PDF-1.7\nnot really a pdf, but the bytes are the point\n");

after(async () => {
  await pg.end();
});

async function scratch() {
  const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Docs ${s}`, slug: `docs-${s}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity, subjectId: entity.id };
}

describe("attaching a file", () => {
  it("stores the bytes and records their hash", async () => {
    const { org, subjectId } = await scratch();
    await attachDocument({
      organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
      filename: "processing-schedule.pdf", contentType: "application/pdf",
      content: PDF, actor: ACTOR,
    });

    const [stored] = await documentsFor(org.id, "dpa", subjectId);
    assert.equal(stored.filename, "processing-schedule.pdf");
    assert.equal(stored.byteSize, PDF.byteLength);
    assert.equal(stored.sha256, createHash("sha256").update(PDF).digest("hex"));
  });

  it("gives back exactly what went in", async () => {
    const { org, subjectId } = await scratch();
    await attachDocument({
      organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
      filename: "a.pdf", contentType: "application/pdf", content: PDF, actor: ACTOR,
    });
    const [stored] = await documentsFor(org.id, "dpa", subjectId);
    const read = await readDocument(stored.id, org.id);
    assert.ok(read);
    assert.ok(Buffer.from(read!.content).equals(PDF), "the bytes should round-trip unchanged");
  });

  it("keeps several files against one agreement", async () => {
    // A master agreement, a processing schedule and a sub-processor annexe are
    // three documents describing one arrangement.
    const { org, subjectId } = await scratch();
    for (const name of ["master.pdf", "schedule.pdf", "annexe.pdf"]) {
      await attachDocument({
        organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
        filename: name, contentType: "application/pdf", content: PDF, actor: ACTOR,
      });
    }
    const all = await documentsFor(org.id, "dpa", subjectId);
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((d) => d.filename), ["master.pdf", "schedule.pdf", "annexe.pdf"]);
  });

  it("strips a path a browser included", async () => {
    const { org, subjectId } = await scratch();
    await attachDocument({
      organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
      filename: "C:\\\\Users\\\\someone\\\\Desktop\\\\dpa.pdf",
      contentType: "application/pdf", content: PDF, actor: ACTOR,
    });
    const [stored] = await documentsFor(org.id, "dpa", subjectId);
    assert.equal(stored.filename, "dpa.pdf");
  });
});

describe("what is refused", () => {
  it("refuses an empty file", async () => {
    const { org, subjectId } = await scratch();
    await assert.rejects(
      () => attachDocument({
        organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
        filename: "empty.pdf", contentType: "application/pdf",
        content: Buffer.alloc(0), actor: ACTOR,
      }),
      UploadRefused,
    );
  });

  it("refuses something too large, and says how large it was", async () => {
    const { org, subjectId } = await scratch();
    const huge = Buffer.alloc(MAX_BYTES + 1024);
    await assert.rejects(
      () => attachDocument({
        organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
        filename: "huge.pdf", contentType: "application/pdf", content: huge, actor: ACTOR,
      }),
      (e: Error) => e instanceof UploadRefused && /10MB/.test(e.message),
    );
  });

  it("refuses a type that is not on the list", async () => {
    // An allowlist, because these files are handed back to people later and
    // nothing executable belongs on it.
    const { org, subjectId } = await scratch();
    for (const type of ["application/x-msdownload", "text/html", "image/svg+xml", ""]) {
      await assert.rejects(
        () => attachDocument({
          organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
          filename: "x", contentType: type, content: PDF, actor: ACTOR,
        }),
        UploadRefused,
        `${type || "(none)"} should be refused`,
      );
    }
  });

  it("accepts the formats an agreement actually arrives in", () => {
    for (const type of [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]) {
      assert.ok(ACCEPTED.has(type), `${type} should be accepted`);
    }
  });
});

describe("noticing that a file changed underneath", () => {
  it("refuses to serve content that no longer matches its hash", async () => {
    // The whole argument of this platform is a record you can check. Serving a
    // contract that has changed since upload would undermine it quietly.
    const { org, subjectId } = await scratch();
    await attachDocument({
      organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
      filename: "a.pdf", contentType: "application/pdf", content: PDF, actor: ACTOR,
    });
    const [stored] = await documentsFor(org.id, "dpa", subjectId);

    await db
      .update(documents)
      .set({ content: Buffer.from("tampered") })
      .where(eq(documents.id, stored.id));

    await assert.rejects(() => readDocument(stored.id, org.id), ContentAltered);
  });
});

describe("removing one", () => {
  it("deletes it and leaves the fact in the audit trail", async () => {
    const { org, subjectId } = await scratch();
    await attachDocument({
      organisationId: org.id, entityId: null, subjectType: "dpa", subjectId,
      filename: "wrong.pdf", contentType: "application/pdf", content: PDF, actor: ACTOR,
    });
    const [stored] = await documentsFor(org.id, "dpa", subjectId);
    await removeDocument({ id: stored.id, organisationId: org.id, actor: ACTOR });

    assert.deepEqual(await documentsFor(org.id, "dpa", subjectId), []);
  });

  it("does not reach into another organisation", async () => {
    const a = await scratch();
    const b = await scratch();
    await attachDocument({
      organisationId: a.org.id, entityId: null, subjectType: "dpa", subjectId: a.subjectId,
      filename: "theirs.pdf", contentType: "application/pdf", content: PDF, actor: ACTOR,
    });
    const [stored] = await documentsFor(a.org.id, "dpa", a.subjectId);

    await removeDocument({ id: stored.id, organisationId: b.org.id, actor: ACTOR });
    assert.equal((await documentsFor(a.org.id, "dpa", a.subjectId)).length, 1, "it should survive");
    assert.equal(await readDocument(stored.id, b.org.id), null, "and be invisible from there");
  });
});
