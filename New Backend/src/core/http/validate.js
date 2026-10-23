// Checks a request body or query against a zod schema (docs/19 §4.2). The
// parsed value replaces the raw one, so controllers only ever see clean input.

import { validationError } from "../errors.js";

/**
 * @param {import("zod").ZodType} schema
 * @param {unknown} value
 */
export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;
  /** @type {Record<string, string>} */
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  throw validationError(fields);
}

/**
 * Express middleware: validates `req.body`.
 * @param {import("zod").ZodType} schema
 * @returns {import("express").RequestHandler}
 */
export const body = (schema) => (req, _res, next) => {
  req.body = parseOrThrow(schema, req.body);
  next();
};

/**
 * Express middleware: validates `req.query` into `req.validQuery`
 * (Express 5's `req.query` is read-only).
 * @param {import("zod").ZodType} schema
 * @returns {import("express").RequestHandler}
 */
export const query = (schema) => (req, _res, next) => {
  req.validQuery = parseOrThrow(schema, req.query);
  next();
};
