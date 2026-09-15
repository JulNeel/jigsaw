import * as React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

type IconButtonSize = Extract<
  VariantProps<typeof buttonVariants>["size"],
  "icon" | "icon-xs" | "icon-sm" | "icon-lg"
>;

/**
 * A square, icon-only `Button` — `label` doubles as the required
 * `aria-label` (an icon-only control has no visible text) and the native
 * `title` tooltip.
 */
function IconButton({
  icon: IconComponent,
  label,
  size = "icon",
  variant = "ghost",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children" | "size"> & {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  size?: IconButtonSize;
}) {
  return (
    <Button variant={variant} size={size} aria-label={label} title={label} {...props}>
      <IconComponent aria-hidden={true} />
    </Button>
  );
}

export { IconButton };
