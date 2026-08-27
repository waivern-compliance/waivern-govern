import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { organisations, templateVersions } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import type { TemplateDefinition } from "@/lib/templates/schema";
import {
  createDraftFrom,
  createTemplate,
  publishVersion,
  TemplateNotPublishable,
  updateDraft,
} from "@/services/templates";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

function messageChain(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

function simple(label: string): TemplateDefinition {
  return {
    schema: {
      sections: [
        {
          key: "s",
          title: label,
          questions: [
            {
              key: "a",
              label: "A question",
              type: "boolean",
              required: true,
              legalRefs: [],
              evidence: "none",
            },
          ],
        },
      ],
    },
    scoring: { method: "none" },
  };
}

async function freshOrg(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Publishing ${label}`, slug: `pub-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  return org;
}

after(async () => {
  await pg.end();
});

describe("template publishing", () => {
  it("publishes a valid draft and records who did it", async () => {
    const org = await freshOrg("valid");
    const { version } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "Test DPIA",
      definition: simple("First"),
      actor: ACTOR,
    });

    const published = await publishVersion({
      organisationId: org.id,
      versionId: version.id,
      actor: ACTOR,
    });

    assert.equal(published.status, "published");
    assert.notEqual(published.publishedAt, null);
  });

  it("refuses to publish a template that would break at runtime", async () => {
    const org = await freshOrg("invalid");
    const broken: TemplateDefinition = {
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              {
                key: "a",
                label: "A",
                type: "boolean",
                required: false,
                legalRefs: [],
                evidence: "none",
                showWhen: { op: "answered", question: "does_not_exist" },
              },
            ],
          },
        ],
      },
      scoring: { method: "none" },
    };
    const { version } = await createTemplate({
      organisationId: org.id,
      kind: "custom",
      name: "Broken",
      definition: broken,
      actor: ACTOR,
    });

    await assert.rejects(
      publishVersion({ organisationId: org.id, versionId: version.id, actor: ACTOR }),
      (err) => err instanceof TemplateNotPublishable,
    );

    // The draft must survive the failed publish so the author can fix it.
    const [after] = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, version.id));
    assert.equal(after.status, "draft");
  });

  it("retires the previous version so only one is live", async () => {
    const org = await freshOrg("supersede");
    const { template, version: v1 } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "Versioned",
      definition: simple("First"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: v1.id, actor: ACTOR });

    const v2 = await createDraftFrom({
      organisationId: org.id,
      templateId: template.id,
      definition: simple("Second"),
      notes: "Reworded the first question",
      actor: ACTOR,
    });
    assert.equal(v2.version, 2);
    await publishVersion({ organisationId: org.id, versionId: v2.id, actor: ACTOR });

    const live = await db
      .select()
      .from(templateVersions)
      .where(
        and(
          eq(templateVersions.templateId, template.id),
          eq(templateVersions.status, "published"),
        ),
      );
    assert.equal(live.length, 1, "exactly one version may be live at a time");
    assert.equal(live[0].version, 2);
  });

  it("refuses a second open draft", async () => {
    const org = await freshOrg("onedraft");
    const { template, version } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "One draft",
      definition: simple("First"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: version.id, actor: ACTOR });
    await createDraftFrom({ organisationId: org.id, templateId: template.id, actor: ACTOR });

    await assert.rejects(
      createDraftFrom({ organisationId: org.id, templateId: template.id, actor: ACTOR }),
      /already has an open draft/,
    );
  });

  it("keeps a published definition frozen at the database", async () => {
    const org = await freshOrg("frozen");
    const { version } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "Frozen",
      definition: simple("Original"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: version.id, actor: ACTOR });

    // Assessments read their questions back from the version they ran against.
    // Editing a published definition would silently rewrite the questions that
    // completed assessments were answering.
    await assert.rejects(
      db.execute(
        sql`update template_version set definition = '{}'::jsonb where id = ${version.id}`,
      ),
      (err) => /is published and cannot be changed/.test(messageChain(err)),
    );
  });

  it("refuses an edit to a published version through the service too", async () => {
    const org = await freshOrg("service-frozen");
    const { version } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "Service frozen",
      definition: simple("Original"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: version.id, actor: ACTOR });

    await assert.rejects(
      updateDraft({
        organisationId: org.id,
        versionId: version.id,
        definition: simple("Changed"),
        actor: ACTOR,
      }),
      /Only a draft version can be edited/,
    );
  });

  it("leaves an intact audit chain behind the whole lifecycle", async () => {
    const org = await freshOrg("audited");
    const { template, version } = await createTemplate({
      organisationId: org.id,
      kind: "dpia",
      name: "Audited",
      definition: simple("First"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: version.id, actor: ACTOR });
    const v2 = await createDraftFrom({
      organisationId: org.id,
      templateId: template.id,
      actor: ACTOR,
    });
    await updateDraft({
      organisationId: org.id,
      versionId: v2.id,
      definition: simple("Second"),
      actor: ACTOR,
    });
    await publishVersion({ organisationId: org.id, versionId: v2.id, actor: ACTOR });

    const result = await verifyAuditChain(org.id);
    assert.equal(result.ok, true);
    // created, published, drafted, edited, published
    assert.equal(result.ok && result.events, 5);
  });
});
