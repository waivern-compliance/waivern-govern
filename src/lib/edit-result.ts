import { unstable_rethrow } from "next/navigation";

/** What an edit form's action reports: saved, or refused with the reason. */
export type EditResult = { ok: boolean; message: string } | null;

/**
 * Run an edit, turning a refusal into a message instead of an error page.
 *
 * Edit actions used to throw when a service refused a change, which replaced
 * the whole page with an error and took what the person had typed with it.
 * Returning the refusal lets `EditForm` show it beside the form, with every
 * field as they left it.
 *
 * A service's own refusal is worded for the person reading it, so its message
 * is shown. A database error is not — it can name tables and constraints — so
 * that is logged and reported generically. Navigation (a redirect to sign in,
 * a not-found) is passed through untouched.
 */
export async function refusable(work: () => Promise<unknown>): Promise<EditResult> {
  try {
    await work();
    return { ok: true, message: "Saved." };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof Error && !("code" in error)) {
      return { ok: false, message: error.message };
    }
    console.error("Edit failed", error);
    return { ok: false, message: "That could not be saved. Nothing was changed; try again." };
  }
}
