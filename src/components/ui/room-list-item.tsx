import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A dashboard Room row — `href` wraps only the thumbnail/name/meta column,
 * never the whole `<li>`: `action` (the delete button) renders as a sibling,
 * since a `<button>` nested inside an `<a>` is invalid HTML and would fight
 * the Link's own click target.
 */
function RoomListItem({
  href,
  thumbnail,
  name,
  meta,
  action,
  className,
  ...props
}: React.ComponentProps<"li"> & {
  href: string;
  thumbnail: React.ReactNode;
  name: React.ReactNode;
  meta: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors duration-150 hover:bg-muted",
        className,
      )}
      {...props}
    >
      <Link href={href} className="flex flex-1 items-center gap-3 overflow-hidden">
        {thumbnail}
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{meta}</span>
        </div>
      </Link>
      {action}
    </li>
  );
}

export { RoomListItem };
