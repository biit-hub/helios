export class EpicRequestFailure extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
export async function epicRequest(path: string, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new EpicRequestFailure(
      "Verbindung unterbrochen. Deine Eingaben bleiben erhalten; einen möglichen Schreibauftrag zuerst im Journal prüfen.",
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new EpicRequestFailure(
      "Antwort nicht sicher lesbar. Deine Eingaben bleiben erhalten; einen möglichen Schreibauftrag zuerst im Journal prüfen.",
    );
  }
  if (!response.ok)
    throw new EpicRequestFailure(
      result.error?.message ??
        "Die Anfrage ist fehlgeschlagen. Deine Eingaben bleiben erhalten.",
      response.status,
    );
  return result;
}
