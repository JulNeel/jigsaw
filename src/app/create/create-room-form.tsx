"use client";

import { startTransition, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";
import { validateUploadedImage } from "@/lib/rooms/validate-uploaded-image";
import { getImageDimensions } from "@/lib/rooms/get-image-dimensions";
import {
  getLargestSufficientPieceCount,
  isResolutionSufficient,
} from "@/lib/rooms/is-resolution-sufficient";
import { PIECE_COUNT_OPTIONS } from "@/lib/rooms/piece-count-options";
import { computeGridDimensions } from "@/lib/piece-cutting/compute-grid-dimensions";
import { sliceImageIntoTiles } from "@/lib/piece-cutting/slice-image";
import { createSeededRotations, createSeededScatter } from "@/lib/piece-cutting/seeded-scatter";
import { removePieceTiles, uploadPieceTiles } from "@/lib/rooms/upload-piece-tiles";
import { createRoom, type CreateRoomPieceInput } from "@/lib/rooms/actions";

type SubmitStage = "idle" | "slicing" | "uploading" | "saving";

type SelectedImage =
  | { kind: "library"; id: string }
  | { kind: "upload"; file: File }
  | null;

type ImageDimensions = { width: number; height: number } | null;

type SuccessResult = { inviteUrl: string; name: string; pieceCount: number };

async function loadImageBitmap(selectedImage: SelectedImage): Promise<ImageBitmap> {
  if (selectedImage?.kind === "upload") {
    return createImageBitmap(selectedImage.file);
  }
  if (selectedImage?.kind === "library") {
    const image = LIBRARY_IMAGES.find((entry) => entry.id === selectedImage.id);
    if (!image) {
      throw new Error("Unknown library image.");
    }
    const response = await fetch(image.src);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }
  throw new Error("No image selected.");
}

export function CreateRoomForm() {
  const tCreate = useTranslations("Create");
  const tRooms = useTranslations("Rooms");
  const [roomName, setRoomName] = useState("");
  const [selectedImage, setSelectedImage] = useState<SelectedImage>(null);
  const [uploadErrorKey, setUploadErrorKey] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions>(null);
  const [isProbingDimensions, setIsProbingDimensions] = useState(false);
  // The Participant's latest piece-count *attempt* — may currently be
  // invalid for `imageDimensions` (e.g. the image changed underneath it, or
  // it was never valid in the first place). Deliberately not withheld at
  // the setter: validity is derived at render time below (`isPieceCountValid`)
  // and is what actually gates AC #3 ("not retained as valid"), so a single
  // source of truth for "what did the user last pick" can't drift from a
  // separately-tracked "confirmed" value.
  const [pieceCount, setPieceCount] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<SubmitStage>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<SuccessResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const uploadInputId = useId();
  const pieceCountId = useId();
  const roomNameId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dimensionRequestId = useRef(0);
  const isMountedRef = useRef(true);
  // React state updates aren't synchronous — checking `isSubmitting` alone
  // in the click handler left a window for a rapid double-click/double-Enter
  // to start two submissions before the re-render lands. This ref is the
  // synchronous source of truth for "a submission is already running".
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isPieceCountValid =
    pieceCount !== null &&
    imageDimensions !== null &&
    isResolutionSufficient(imageDimensions.width, imageDimensions.height, pieceCount);
  // Suppressed while a dimension probe is in flight — "unknown" must never
  // be presented as "confirmed insufficient".
  const resolutionWarningCount =
    !isProbingDimensions && pieceCount !== null && !isPieceCountValid
      ? pieceCount
      : null;
  const suggestedPieceCount =
    resolutionWarningCount !== null && imageDimensions !== null
      ? getLargestSufficientPieceCount(
          imageDimensions.width,
          imageDimensions.height,
          PIECE_COUNT_OPTIONS,
        )
      : null;
  const canSubmit =
    roomName.trim().length > 0 &&
    selectedImage !== null &&
    imageDimensions !== null &&
    isPieceCountValid &&
    !isSubmitting;

  async function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const result = validateUploadedImage(file);
    if (!result.valid) {
      setUploadErrorKey(result.messageKey);
      // Clear the input so re-selecting the same rejected file still fires
      // onChange (browsers don't emit a change event for an unchanged value).
      event.target.value = "";
      return;
    }

    setUploadErrorKey(null);
    setSelectedImage({ kind: "upload", file });
    setImageDimensions(null);
    setIsProbingDimensions(true);

    const requestId = ++dimensionRequestId.current;
    try {
      const dimensions = await getImageDimensions(file);
      if (dimensionRequestId.current === requestId && isMountedRef.current) {
        setImageDimensions(dimensions);
      }
    } catch {
      if (dimensionRequestId.current === requestId && isMountedRef.current) {
        setImageDimensions(null);
        setUploadErrorKey("imageReadError");
      }
    } finally {
      if (dimensionRequestId.current === requestId && isMountedRef.current) {
        setIsProbingDimensions(false);
      }
    }
  }

  function handleLibrarySelect(id: string) {
    setUploadErrorKey(null);
    setSelectedImage({ kind: "library", id });
    dimensionRequestId.current++; // invalidate any in-flight upload dimension probe
    setIsProbingDimensions(false);
    const image = LIBRARY_IMAGES.find((entry) => entry.id === id);
    setImageDimensions(
      image ? { width: image.width, height: image.height } : null,
    );
    // A previously chosen upload file must not linger in the file input's
    // DOM state once a library image becomes the active choice.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit() {
    if (isSubmittingRef.current) {
      return;
    }
    if (!selectedImage || !imageDimensions || pieceCount === null || !canSubmit) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    // The Next.js docs are explicit: a Server Action must be invoked from a
    // form, or from an event handler wrapped in `startTransition` — calling
    // it directly from a plain onClick isn't the supported path. Without
    // this, the automatic RSC re-render/"seeded navigation" Next.js performs
    // after a Server Action call could race the plain setState calls below
    // and the success screen would never visibly commit, even though the
    // Room was genuinely created server-side (the bug reported in testing).
    startTransition(async () => {
      let uploadedTilePaths: string[] = [];

      try {
        const roomId = crypto.randomUUID();
        const { rows, cols } = computeGridDimensions(
          pieceCount,
          imageDimensions.width / imageDimensions.height,
        );

        setSubmitStage("slicing");
        const bitmap = await loadImageBitmap(selectedImage);
        const { tiles, tileWidth, tileHeight } = await sliceImageIntoTiles(
          bitmap,
          rows,
          cols,
        );

        setSubmitStage("uploading");
        const tilePaths = await uploadPieceTiles(roomId, tiles, { rows, cols });
        uploadedTilePaths = tilePaths;

        const scatterPositions = createSeededScatter(
          roomId,
          rows * cols,
          (cols * tileWidth) / 2,
          (rows * tileHeight) / 2,
          tileWidth,
          tileHeight,
        );
        const rotations = createSeededRotations(roomId, rows * cols);

        const pieces: CreateRoomPieceInput[] = [];
        let index = 0;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            pieces.push({
              row,
              col,
              imageAssetRef: tilePaths[index],
              scatterX: scatterPositions[index].x,
              scatterY: scatterPositions[index].y,
              rotation: rotations[index],
            });
            index++;
          }
        }

        setSubmitStage("saving");
        const trimmedName = roomName.trim();
        const result = await createRoom({
          roomId,
          name: trimmedName,
          imageSource: selectedImage.kind,
          imageLibraryId: selectedImage.kind === "library" ? selectedImage.id : null,
          pieceCountNominal: pieceCount,
          grid: { rows, cols },
          tileWidth,
          tileHeight,
          pieces,
        });

        if (!result.success) {
          // Room row (and therefore the pieces) were never committed —
          // don't leave the uploaded tiles behind as permanent orphans.
          await removePieceTiles(uploadedTilePaths);
          if (isMountedRef.current) {
            setSubmitError(result.error.message);
          }
          return;
        }

        if (isMountedRef.current) {
          setSuccessResult({
            inviteUrl: result.inviteUrl,
            name: trimmedName,
            pieceCount: rows * cols,
          });
        }
      } catch (err) {
        console.error("Room creation failed:", err);
        await removePieceTiles(uploadedTilePaths);
        if (isMountedRef.current) {
          setSubmitError(tCreate("genericError"));
        }
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          setIsSubmitting(false);
          setSubmitStage("idle");
        }
      }
    });
  }

  async function handleCopyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch {
      // Clipboard API unavailable/denied — link text is still visible and
      // selectable manually, so this isn't a blocking failure.
    }
  }

  if (successResult) {
    const fullUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}${successResult.inviteUrl}`
        : successResult.inviteUrl;
    const shareMessage = tCreate("shareMessage", {
      name: successResult.name,
      url: fullUrl,
    });

    return (
      <div className="flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-foreground">
          {tCreate("successBadge")}
        </span>
        <div>
          <h2 className="text-lg font-semibold">
            {tCreate("successHeading", { name: successResult.name })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tCreate("successLead", { pieceCount: successResult.pieceCount })}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <span className="flex-1 truncate font-mono text-sm">{fullUrl}</span>
          <Button type="button" onClick={() => handleCopyLink(fullUrl)}>
            {linkCopied ? tCreate("linkCopied") : tCreate("copyLink")}
          </Button>
        </div>

        <div className="flex gap-2">
          <a
            className="flex-1 rounded-lg border border-border p-3 text-center text-sm"
            href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tCreate("shareWhatsApp")}
          </a>
          <a
            className="flex-1 rounded-lg border border-border p-3 text-center text-sm"
            href={`mailto:?body=${encodeURIComponent(shareMessage)}`}
          >
            {tCreate("shareEmail")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={roomNameId} className="text-sm font-semibold">
          {tCreate("roomNameLabel")}
        </label>
        <input
          id={roomNameId}
          type="text"
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          placeholder={tCreate("roomNamePlaceholder")}
          className="rounded-lg border border-border bg-background p-2 text-sm"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">{tCreate("imageLabel")}</label>

        <div className="grid grid-cols-4 gap-2">
          {LIBRARY_IMAGES.map((image) => {
            const isSelected =
              selectedImage?.kind === "library" && selectedImage.id === image.id;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => handleLibrarySelect(image.id)}
                aria-pressed={isSelected}
                className={`relative aspect-square overflow-hidden rounded-lg ${
                  isSelected ? "outline outline-3 outline-offset-2 outline-primary" : ""
                }`}
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>

        <label
          htmlFor={uploadInputId}
          className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground"
        >
          {tCreate("uploadButton")}
        </label>
        <input
          ref={fileInputRef}
          id={uploadInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUploadChange}
          className="sr-only"
          aria-describedby={uploadErrorKey ? `${uploadInputId}-error` : undefined}
        />

        {selectedImage?.kind === "upload" && !uploadErrorKey && (
          <p className="text-xs text-muted-foreground">
            {tCreate("uploadedFile", { filename: selectedImage.file.name })}
          </p>
        )}

        {uploadErrorKey && (
          <p id={`${uploadInputId}-error`} role="alert" className="text-sm text-destructive">
            {tRooms(uploadErrorKey)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={pieceCountId} className="text-sm font-semibold">
          {tCreate("pieceCountLabel")}
        </label>
        <select
          id={pieceCountId}
          value={pieceCount ?? ""}
          disabled={imageDimensions === null}
          onChange={(event) => setPieceCount(Number(event.target.value))}
          aria-describedby={
            resolutionWarningCount !== null ? `${pieceCountId}-warning` : undefined
          }
          className="rounded-lg border border-border bg-background p-2 text-sm"
        >
          <option value="" disabled>
            {isProbingDimensions
              ? tCreate("pieceCountLoading")
              : imageDimensions === null
                ? tCreate("pieceCountPlaceholder")
                : tCreate("pieceCountLabel")}
          </option>
          {PIECE_COUNT_OPTIONS.map((count) => {
            const isFeasible =
              imageDimensions === null ||
              isResolutionSufficient(imageDimensions.width, imageDimensions.height, count);
            return (
              <option key={count} value={count} disabled={!isFeasible}>
                {tCreate("pieceCountOption", { count })}
              </option>
            );
          })}
        </select>

        {resolutionWarningCount !== null && (
          <p
            id={`${pieceCountId}-warning`}
            role="alert"
            className="text-sm text-destructive"
          >
            {suggestedPieceCount !== null
              ? tCreate("resolutionWarningWithSuggestion", {
                  pieceCount: resolutionWarningCount,
                  suggestedCount: suggestedPieceCount,
                })
              : tCreate("resolutionWarningNoSuggestion", {
                  pieceCount: resolutionWarningCount,
                })}
          </p>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
        {isSubmitting ? tCreate(`submitPending_${submitStage}`) : tCreate("submit")}
      </Button>
    </div>
  );
}
