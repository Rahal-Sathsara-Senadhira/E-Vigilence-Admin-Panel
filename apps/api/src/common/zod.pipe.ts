import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

/**
 * Validates and converts a request body or query with a schema from
 * @ev/shared — the same schema the web form uses. Failures become a 400 with
 * field messages (see ApiExceptionFilter).
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
