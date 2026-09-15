import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold leading-snug",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        primary: "bg-primary-subtle text-primary-subtle-foreground",
        accent: "bg-brand-accent-subtle text-brand-accent-hover",
        solid: "bg-primary text-primary-foreground",
      },
      pill: {
        true: "rounded-full px-3 py-1",
        false: "rounded-sm px-2 py-0.5",
      },
    },
    defaultVariants: {
      tone: "neutral",
      pill: true,
    },
  },
);

function Badge({
  className,
  tone,
  pill,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone, pill, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
