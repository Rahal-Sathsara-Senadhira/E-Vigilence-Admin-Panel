// Runs one sign-in step and turns backend errors into form errors: field
// errors go next to their field, anything else into the form's alert.

import { useState } from "react";
import { ApiError } from "@/lib/api.js";

/**
 * @param {import("react-hook-form").UseFormSetError<any>} setError
 */
export function useStepSubmit(setError) {
  const [formError, setFormError] = useState(/** @type {string | null} */ (null));

  /**
   * @template T
   * @param {() => Promise<T>} call
   * @returns {Promise<T | null>}
   */
  async function run(call) {
    setFormError(null);
    try {
      return await call();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        for (const [field, message] of Object.entries(err.fields)) {
          setError(field, { type: "server", message }, { shouldFocus: true });
        }
      } else {
        setFormError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        );
      }
      return null;
    }
  }

  return { formError, setFormError, run };
}
