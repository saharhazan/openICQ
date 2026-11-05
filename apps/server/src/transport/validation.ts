/** Turns zod failures into a short human message for the client. */
import type { z } from 'zod';

export function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}
