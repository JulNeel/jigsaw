import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

function ImageChoiceTile({
  src,
  alt = "",
  selected = false,
  sizes,
  className,
  ...props
}: React.ComponentProps<"button"> & { src: string; alt?: string; selected?: boolean; sizes?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg bg-muted outline-offset-2 outline-primary",
        selected && "outline-3",
        className,
      )}
      {...props}
    >
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
      {selected ? (
        <span className="absolute top-1.5 left-1.5 size-3.5 rounded-full bg-primary ring-2 ring-card" aria-hidden="true" />
      ) : null}
    </button>
  );
}

export { ImageChoiceTile };
