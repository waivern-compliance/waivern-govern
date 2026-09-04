import { NextResponse } from "next/server";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { ContentAltered, readDocument, recordDownload } from "@/services/documents";

export const dynamic = "force-dynamic";

/**
 * Hand back one stored file.
 *
 * Behind the session rather than a signed link, because a processor agreement
 * is not something to make guessable. The check is the same one the record
 * itself uses: whoever may read the supplier or the breach may read what is
 * attached to it, scoped to the entity where the document carries one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let document;
  try {
    document = await readDocument(id, active.membership.organisationId);
  } catch (error) {
    if (error instanceof ContentAltered) {
      // Refused rather than served. A file that no longer matches its hash is
      // exactly what this platform exists to notice.
      return NextResponse.json(
        { error: "This file does not match the hash recorded when it was uploaded." },
        { status: 409 },
      );
    }
    throw error;
  }
  if (!document) return NextResponse.json({ error: "No such document" }, { status: 404 });

  if (
    !can(
      active.membership.grants,
      "record.read",
      document.entityId ?? undefined,
    )
  ) {
    return NextResponse.json({ error: "Not part of your access" }, { status: 403 });
  }

  await recordDownload({
    organisationId: active.membership.organisationId,
    document,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  return new NextResponse(new Uint8Array(document.content), {
    status: 200,
    headers: {
      "content-type": document.contentType,
      // Attachment, always. A PDF rendered inline from a governance record is
      // content somebody else supplied being displayed by our origin.
      "content-disposition": `attachment; filename="${document.filename.replace(/"/g, "")}"`,
      "content-length": String(document.byteSize),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
