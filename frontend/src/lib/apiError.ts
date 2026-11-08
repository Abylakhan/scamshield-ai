export class ApiError extends Error {
  constructor(public status: number, message: string, public fieldMessage?: string) {
    super(message);
  }
}

/** Status 0 = network failure, 408 = client-side timeout. */
export type ErrorKind = "network" | "timeout" | "invalid" | "rateLimit" | "notFound" | "unavailable" | "server";

export function errorKind(err: unknown): ErrorKind {
  if (!(err instanceof ApiError)) return "server";
  if (err.status === 0) return "network";
  if (err.status === 408) return "timeout";
  if (err.status === 422 || err.status === 400) return "invalid";
  if (err.status === 429) return "rateLimit";
  if (err.status === 404) return "notFound";
  if (err.status === 503) return "unavailable";
  return "server";
}
