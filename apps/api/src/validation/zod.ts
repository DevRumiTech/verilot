import { z } from "zod";

import type { FieldErrors } from "../errors/api-error.js";

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    const messages = fieldErrors[field] ?? [];
    messages.push(issue.message);
    fieldErrors[field] = messages;
  }

  return fieldErrors;
}
