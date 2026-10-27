"use client";

import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";

/**
 * A form action that may be refused, without losing what was typed.
 *
 * React resets a form after its action runs, whatever the action returned. For
 * a form whose action can refuse — "it cannot have passed", "say how it was
 * resolved" — that wipes a paragraph somebody wrote in order to tell them one
 * field was missing. Submitting through a transition instead keeps the fields,
 * and the form is cleared only once the action says it succeeded.
 *
 * `resetOnSuccess: false` keeps the fields after success too, for forms that
 * edit something in place rather than add something new.
 */
export function useRefusableAction<R extends { ok: boolean } | null>(
  action: (previous: R, formData: FormData) => Promise<R>,
  { resetOnSuccess = true }: { resetOnSuccess?: boolean } = {},
) {
  const [result, dispatch, acting] = useActionState<R, FormData>(
    action as (previous: Awaited<R>, formData: FormData) => Promise<R>,
    null as Awaited<R>,
  );
  const [transitioning, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && result?.ok) ref.current?.reset();
  }, [result, resetOnSuccess]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // Which button was pressed, where the form has more than one.
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    startTransition(() => dispatch(data));
  }

  // POST, so a submit that lands before the page is interactive — when no
  // handler is attached yet — never puts what was typed into the address bar,
  // the browser history or a server log, as a GET of the fields would.
  return {
    result,
    pending: acting || transitioning,
    formProps: { ref, onSubmit, method: "post" as const },
  };
}
