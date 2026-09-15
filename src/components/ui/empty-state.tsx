import * as React from "react";
import { cn } from "@/lib/utils";

function EmptyState({
  glyph = "🧩",
  title,
  body,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  glyph?: string | null;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-3 py-16 text-center", className)}
      {...props}
    >
      {glyph ? (
        <span className="text-4xl" aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {body ? <p className="max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      {action}
    </div>
  );
}

export { EmptyState };
