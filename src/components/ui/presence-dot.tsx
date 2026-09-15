import * as React from "react";
import { cn } from "@/lib/utils";

function PresenceDot({
  pulse = false,
  className,
  ...props
}: React.ComponentProps<"span"> & { pulse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-[9px] rounded-full bg-brand-accent",
        pulse && "animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { PresenceDot };
