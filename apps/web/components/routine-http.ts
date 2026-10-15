export async function routineRequest(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error?.message ??
        "Die Anfrage ist fehlgeschlagen. Der gespeicherte Stand bleibt erhalten.",
    );
  return value;
}
export type RoutineAction = (
  action: string,
  body?: Record<string, unknown>,
) => Promise<unknown>;
