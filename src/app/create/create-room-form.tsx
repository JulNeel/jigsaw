"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";
import { validateUploadedImage } from "@/lib/rooms/validate-uploaded-image";
import { getImageDimensions } from "@/lib/rooms/get-image-dimensions";
import {
  getLargestSufficientPieceCount,
  isResolutionSufficient,
} from "@/lib/rooms/is-resolution-sufficient";
import { PIECE_COUNT_OPTIONS } from "@/lib/rooms/piece-count-options";

type SelectedImage =
  | { kind: "library"; id: string }
  | { kind: "upload"; file: File }
  | null;

type ImageDimensions = { width: number; height: number } | null;

export function CreateRoomForm() {
  const tCreate = useTranslations("Create");
  const tRooms = useTranslations("Rooms");
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
  const uploadInputId = useId();
  const pieceCountId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dimensionRequestId = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
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

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
