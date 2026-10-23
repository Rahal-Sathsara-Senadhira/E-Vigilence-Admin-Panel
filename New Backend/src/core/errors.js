// Errors the API sends on purpose (docs/19 §5). Anything else is a bug and
// becomes a 500 with no details for the caller.

export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code stable, machine-readable code, e.g. "invalid_credentials"
   * @param {string} message plain-language message for the person using the panel
   * @param {Record<string, string>} [fields] per-field messages for forms
   */
  constructor(status, code, message, fields) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** @param {Record<string, string>} fields */
export const validationError = (fields, message = "Check the highlighted fields.") =>
  new AppError(400, "validation", message, fields);

export const unauthorized = (code = "not_signed_in", message = "Please sign in.") =>
  new AppError(401, code, message);

export const forbidden = (message = "You don't have permission to do this.") =>
  new AppError(403, "forbidden", message);

/** Also used for records outside the user's scope, so their existence isn't revealed. */
export const notFound = (message = "Not found.") => new AppError(404, "not_found", message);

/** @param {string} code @param {string} message */
export const conflict = (code, message) => new AppError(409, code, message);

/** @param {string} message */
export const locked = (message) => new AppError(423, "account_locked", message);

/** @param {string} message */
export const tooManyRequests = (message) => new AppError(429, "rate_limited", message);
