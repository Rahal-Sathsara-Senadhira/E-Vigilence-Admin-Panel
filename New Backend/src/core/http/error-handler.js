// One error shape for every response (docs/19 §5):
//   { error: { code, message, fields? } }

import { AppError } from "../errors.js";

/** Unknown URL. @param {import("express").Request} _req @param {import("express").Response} res */
export const notFoundHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Not found." } });
};

/** @type {import("express").ErrorRequestHandler} */
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }
  // Body too large or not valid JSON — the client's mistake, not ours.
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "too_large", message: "The request is too large." } });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: { code: "bad_json", message: "The request is not valid JSON." } });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({
    error: { code: "server_error", message: "Something went wrong on our side. Please try again." },
  });
};
