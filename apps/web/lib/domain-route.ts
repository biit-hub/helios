import { AuthFault, publicWorkError } from "@helios/backend";
import { identity } from "./identity";
export async function guardedDomainPost(
  request: Request,
  context: { params: Promise<{ action: string }> },
  service: () => {
    handle: (
      action: string,
      headers: Headers,
      input: unknown,
    ) => Promise<unknown>;
  },
  accepted: readonly string[] = [],
) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    await identity().withActive(
      request.headers,
      { mutation: true },
      async () => {},
    );
    const reader = request.body?.getReader();
    if (!reader) throw new AuthFault("INVALID_REQUEST", 400);
    const timer = setTimeout(() => void reader.cancel(), 5000);
    const chunks: Uint8Array[] = [];
    let size = 0;
    let input: unknown;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) throw new AuthFault("INVALID_REQUEST", 413);
        chunks.push(value);
      }
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new AuthFault("INVALID_REQUEST", 400);
      }
    } finally {
      clearTimeout(timer);
      await reader.cancel();
    }
    const { action } = await context.params;
    return Response.json(
      await service().handle(action, request.headers, input),
      {
        headers,
        status: accepted.includes(action) ? 202 : 200,
      },
    );
  } catch (e) {
    const r = publicWorkError(e);
    return Response.json(r.body, { status: r.status, headers });
  }
}
