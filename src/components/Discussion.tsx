import { pathFor } from "@/lib/records";
import { getActiveSession } from "@/lib/session";
import { commentsFor, organisationMembers } from "@/services/collaboration";
import type { Comment } from "@/services/collaboration";
import { postCommentAction, withdrawCommentAction } from "@/app/app/comments/actions";

const when = (d: Date) =>
  `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;

/**
 * The conversation about a record, beside the record.
 *
 * Rendered for anybody who can read the subject — including people who cannot
 * edit it, since they are the ones most likely to have a question.
 */
export async function Discussion({
  subjectType,
  subjectId,
  entityId,
  subjectLabel,
}: {
  subjectType: Comment["subjectType"];
  subjectId: string;
  entityId: string | null;
  subjectLabel: string;
}) {
  const active = await getActiveSession();
  if (!active) return null;

  const [rows, members] = await Promise.all([
    commentsFor(active.membership.organisationId, subjectType, subjectId),
    organisationMembers(active.membership.organisationId),
  ]);

  const context = { subjectType, subjectId, entityId, subjectLabel };
  // Only needed to revalidate this page after a withdrawal.
  const href = pathFor(subjectType, subjectId) ?? "/app";

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Discussion</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          For questions and context. Decisions — approval, acceptance, sign-off
          — are recorded separately and are not made here.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map(({ comment, mentioned }) => (
          <li
            key={comment.id}
            className="rounded border border-line bg-surface px-4 py-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-medium">{comment.authorLabel}</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {when(comment.createdAt)}
              </span>
            </div>
            {comment.deletedAt ? (
              <p className="mt-1.5 text-ink-soft italic">
                Withdrawn {when(comment.deletedAt)}.
              </p>
            ) : (
              <>
                <p className="mt-1.5 whitespace-pre-wrap">{comment.body}</p>
                {mentioned.length > 0 ? (
                  <p className="mt-1.5 text-xs text-ink-soft">
                    Notified: {mentioned.map((m) => m.email).join(", ")}
                  </p>
                ) : null}
                {comment.authorId === active.userId ? (
                  <form
                    action={withdrawCommentAction.bind(null, comment.id, href)}
                    className="mt-1.5"
                  >
                    <button
                      type="submit"
                      className="text-xs text-ink-soft underline hover:text-brand"
                    >
                      Withdraw
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="rounded border border-dashed border-line px-4 py-5 text-sm text-ink-soft">
            Nothing said yet. If something here needs explaining, this is where
            the explanation should live rather than in somebody&rsquo;s mailbox.
          </li>
        ) : null}
      </ul>

      <form
        action={postCommentAction.bind(null, context)}
        className="space-y-2 rounded border border-line bg-surface p-4"
      >
        <label className="block space-y-1">
          <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
            Add to the discussion
            <span className="block font-normal normal-case tracking-normal">
              Type @ and someone&rsquo;s name to notify them — @{" "}
              {members[0]?.email.split("@")[0] ?? "colleague"} or their full
              address. An @ that matches nobody is left as written.
            </span>
          </span>
          <textarea
            name="body"
            rows={3}
            required
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Post
        </button>
      </form>
    </section>
  );
}
