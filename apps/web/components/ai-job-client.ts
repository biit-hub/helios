"use client";
export class AiJobRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function jobRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new AiJobRequestError(
      data.error?.message ??
        "Die Anfrage ist fehlgeschlagen. Eingaben bleiben erhalten.",
      response.status,
    );
  return data as T;
}
export const jobDate = (value: string) =>
  new Date(value).toLocaleString("de-CH");
