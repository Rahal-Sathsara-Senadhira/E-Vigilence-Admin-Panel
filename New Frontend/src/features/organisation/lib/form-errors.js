import { ApiError } from "@/lib/api.js";

/**
 * Puts backend field errors next to their fields, anything else on the form.
 * @param {unknown} err
 * @param {(field: any, error: { type: string, message: string }) => void} setError
 */
export function showErrors(err, setError) {
  if (err instanceof ApiError && Object.keys(err.fields).length) {
    for (const [field, message] of Object.entries(err.fields)) {
      setError(field, { type: "server", message });
    }
  } else {
    setError("root", {
      type: "server",
      message: err instanceof Error ? err.message : "Please try again.",
    });
  }
}
