import { describe, expect, it } from "vitest";
import { validateUploadedImage } from "./validate-uploaded-image";

describe("validateUploadedImage", () => {
  it("accepts a valid JPEG under the size limit", () => {
    expect(
      validateUploadedImage({ type: "image/jpeg", size: 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it("accepts a valid PNG", () => {
    expect(
      validateUploadedImage({ type: "image/png", size: 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it("accepts a valid WebP", () => {
    expect(
      validateUploadedImage({ type: "image/webp", size: 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it("rejects an oversized file", () => {
    const result = validateUploadedImage({
      type: "image/jpeg",
      size: 11 * 1024 * 1024,
    });
    expect(result).toEqual({ valid: false, messageKey: "fileTooLarge" });
  });

  it("rejects an unsupported MIME type", () => {
    const result = validateUploadedImage({
      type: "application/pdf",
      size: 1024,
    });
    expect(result).toEqual({ valid: false, messageKey: "unsupportedFormat" });
  });

  it("accepts a file exactly at the size boundary", () => {
    expect(
      validateUploadedImage({ type: "image/jpeg", size: 10 * 1024 * 1024 }),
    ).toEqual({ valid: true });
  });

  it("rejects an empty (0-byte) file", () => {
    const result = validateUploadedImage({ type: "image/jpeg", size: 0 });
    expect(result).toEqual({ valid: false, messageKey: "invalidFile" });
  });

  it("rejects a non-finite size", () => {
    const result = validateUploadedImage({ type: "image/jpeg", size: NaN });
    expect(result).toEqual({ valid: false, messageKey: "invalidFile" });
  });
});
