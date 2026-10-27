"use client";

import type { ReactNode } from "react";
import type { EditResult } from "@/lib/edit-result";
import { useRefusableAction } from "@/lib/use-refusable-action";

/**
 * A form that edits something already saved.
 *
 * Submitted through `useRefusableAction`, so React never resets it: a refused
 * save leaves every field as the person typed it, with the reason beside the
 * button, and they correct it rather than start again. A successful save is
 * shown by the page re-rendering with the new values; the caller keys the form
 * on them (`savedKey`) so anything the server normalised is shown as saved.
 *
 * The children are the fields and the submit button, rendered by the page.
 */
export function EditForm({
  action,
  className,
  children,
}: {
  action: (previous: EditResult, formData: FormData) => Promise<EditResult>;
  className?: string;
  children: ReactNode;
}) {
  const { result, pending, formProps } = useRefusableAction<EditResult>(action, {
    resetOnSuccess: false,
  });

  return (
    <form {...formProps} aria-busy={pending} className={className}>
      {children}
      {result && !result.ok ? (
        <p role="alert" className="basis-full text-sm text-red-800 sm:col-span-full">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
