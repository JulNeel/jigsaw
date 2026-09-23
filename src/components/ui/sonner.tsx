"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// This app has one fixed brand palette (DESIGN.md), no dark mode/theme
// toggle anywhere — `next-themes` would be a dependency with nothing to
// read, so `theme` is hardcoded rather than wired to a `ThemeProvider` that
// doesn't exist.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      // Bottom centre: a toast here comments on something the player just
      // did on the canvas, and the canvas fills the screen. A corner puts
      // the explanation as far as possible from the gesture that caused it.
      position="bottom-center"
      // Lets a typed toast carry its own colour instead of the neutral
      // popover fill. Untyped `toast()` calls are unaffected — they stay
      // exactly as they were.
      richColors
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--warning-bg": "var(--warning-subtle)",
          "--warning-text": "var(--warning)",
          "--warning-border": "var(--sand-400)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
