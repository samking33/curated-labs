import { PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Validates a body/query against a shared Zod contract. Throwing ZodError is
 * intentional: the exception filter turns it into the BAD_REQUEST envelope with
 * per-field details, so validation shape is defined once in `shared/`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
