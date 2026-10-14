export function log(level: "info" | "error", event: string) {
  console[level === "error" ? "error" : "log"](
    JSON.stringify({ level, event, time: new Date().toISOString() }),
  );
}
// Deliberately do not serialize raw errors, payloads or configuration.
export function publicError() {
  return {
    error: {
      code: "SERVICE_UNAVAILABLE",
      message: "Dienst vorübergehend nicht verfügbar.",
    },
  };
}
