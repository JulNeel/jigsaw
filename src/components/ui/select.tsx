import * as React from "react";
import { cn } from "@/lib/utils";

// A plain styled native `<select>` — matches the canvas's own `Select`
// exactly and avoids pulling in radix-ui's `Select` (already a project
// dependency, per `dialog.tsx`, but a bigger composition of its own
// Trigger/Content/Item parts) for what's currently just a single flat
// piece-count list. Revisit if a future `<select>` needs option groups or
// custom item rendering radix would handle better.
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "w-full min-h-[38px] cursor-pointer rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-shadow duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
