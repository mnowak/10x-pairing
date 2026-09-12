/**
 * Shared error-visibility helper. Every catch site that would otherwise
 * discard the real error calls this instead, so the actual message and
 * stack trace reach Cloudflare Workers Logs (server-side) or the browser
 * console (client-side) rather than being replaced by a generic message.
 */
export function logError(context: string, error: unknown): void {
  const payload =
    error instanceof Error
      ? { context, timestamp: new Date().toISOString(), message: error.message, stack: error.stack }
      : { context, timestamp: new Date().toISOString(), message: String(error) };

  // eslint-disable-next-line no-console -- this is the intended sink for error visibility
  console.error(JSON.stringify(payload));
}
