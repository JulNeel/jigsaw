"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { LIBRARY_IMAGES } from "@/lib/rooms/library-images";
import { validateUploadedImage } from "@/lib/rooms/validate-uploaded-image";

type SelectedImage =
  | { kind: "library"; id: string }
  | { kind: "upload"; file: File }
  | null;

export function CreateRoomForm() {
  const tCreate = useTranslations("Create");
  const tRooms = useTranslations("Rooms");
  const [selectedImage, setSelectedImage] = useState<SelectedImage>(null);
  const [uploadErrorKey, setUploadErrorKey] = useState<string | null>(null);
  const uploadInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
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
  }

  function handleLibrarySelect(id: string) {
    setUploadErrorKey(null);
    setSelectedImage({ kind: "library", id });
    // A previously chosen upload file must not linger in the file input's
    // DOM state once a library image becomes the active choice.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
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
  );
}
