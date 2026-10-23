// One error shape for every response:
//   { "error": { "code": "validation", "message": "...", "fields": { "email": "..." } } }

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { InvalidTransitionError } from "@ev/shared";
import type { Response } from "express";
import { ZodError } from "zod";

export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, extra?: Record<string, unknown>) {
    super({ error: { code, message, ...extra } }, status);
  }
}

export const badRequest = (code: string, message: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, code, message);
export const forbidden = (message = "You don't have permission to do this.", code = "forbidden") =>
  new ApiError(HttpStatus.FORBIDDEN, code, message);
export const notFound = (message = "Not found.") =>
  new ApiError(HttpStatus.NOT_FOUND, "not_found", message);
export const conflict = (code: string, message: string) =>
  new ApiError(HttpStatus.CONFLICT, code, message);
export const unauthorized = (message = "Please sign in.", code = "unauthorized") =>
  new ApiError(HttpStatus.UNAUTHORIZED, code, message);

const CODE_BY_STATUS: Record<number, string> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  429: "rate_limited",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of exception.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] ??= issue.message;
      }
      return res.status(400).json({
        error: { code: "validation", message: "Check the highlighted fields.", fields },
      });
    }

    if (exception instanceof InvalidTransitionError) {
      return res.status(409).json({
        error: { code: "invalid_transition", message: exception.message },
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "object" && body !== null && "error" in body) {
        return res.status(status).json(body);
      }
      const message =
        status === 429
          ? "Too many requests. Please wait a moment and try again."
          : typeof body === "string"
            ? body
            : ((body as { message?: string | string[] }).message?.toString() ?? exception.message);
      return res
        .status(status)
        .json({ error: { code: CODE_BY_STATUS[status] ?? "error", message } });
    }

    this.logger.error(exception);

    return res.status(500).json({
      error: { code: "internal", message: "Something went wrong. The problem has been logged." },
    });
  }
}
