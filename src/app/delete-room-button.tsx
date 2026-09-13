"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteRoom } from "@/lib/rooms/actions";

/**
 * A sibling of `RoomList`'s per-Room `<Link>`, never nested inside it
 * (`room-list.tsx` renders this as a separate flex item within the same
 * `<li>`) — a `<button>` inside an `<a>` is invalid HTML and would fight
 * the Link's own click target.
 */
export function DeleteRoomButton({ roomId, roomName }: { roomId: string; roomName: string }) {
  const t = useTranslations("Home");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteRoom(roomId);
      if (!result.success) {
        setErrorMessage(result.error.message);
        return;
      }
      setOpen(false);
      // No cache-revalidation convention exists elsewhere in this codebase
      // (`createRoom` lets the client navigate instead) — a plain refresh
      // re-runs the Server Component tree, which is exactly what's needed
      // for the now-deleted Room to disappear from this list.
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setErrorMessage(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("deleteRoomAriaLabel", { name: roomName })}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogDescription>{t("deleteConfirmBody", { name: roomName })}</DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("deleteConfirmCancel")}
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? t("deleteConfirmSubmitPending") : t("deleteConfirmSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
