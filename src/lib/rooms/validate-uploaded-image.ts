const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export type UploadValidationResult =
  | { valid: true }
  | { valid: false; messageKey: "unsupportedFormat" | "invalidFile" | "fileTooLarge" };

/**
 * Client-side UX check only — `type`/`size` are caller-supplied and
 * trivially spoofable. Once Story 2.4 wires the real Supabase Storage
 * upload, the server side must re-validate the actual file content;
 * this function does not substitute for that.
 *
 * Returns a message *key* (from the "Rooms" i18n namespace) rather than a
 * hardcoded string, so callers can translate it via next-intl.
 */
export function validateUploadedImage(file: {
  type: string;
  size: number;
}): UploadValidationResult {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { valid: false, messageKey: "unsupportedFormat" };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { valid: false, messageKey: "invalidFile" };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, messageKey: "fileTooLarge" };
  }
  return { valid: true };
}
