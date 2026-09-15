import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Label + hint/error wrapper around a form control — deduplicates the
 * label/input/error markup previously repeated inline in every form file
 * (sign-in, sign-up, create-room). `htmlFor` must match the child control's
 * own `id`; the error `<p>` uses `role="alert"` so it's announced the
 * instant it appears, same as the inline blocks it replaces. Its own `id`
 * is derived predictably from `htmlFor` (`${htmlFor}-error`) — see
 * `fieldErrorId` — so the control can reference it via `aria-describedby`
 * without `Field` needing to return anything back to the caller.
 */
function fieldErrorId(htmlFor: string | undefined): string | undefined {
  return htmlFor ? `${htmlFor}-error` : undefined;
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <div data-slot="field" className={cn("flex flex-col gap-1", className)} {...props}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-semibold">
          {label}
        </label>
      ) : null}
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p id={fieldErrorId(htmlFor)} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field, fieldErrorId };
