import { AuthFault } from "@helios/backend";
import { identity } from "../../../../lib/identity";
export const dynamic = "force-dynamic";
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthFault("INVALID_REQUEST", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  const timeout = setTimeout(() => void reader.cancel(), 5000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) throw new AuthFault("INVALID_REQUEST", 413);
      chunks.push(value);
    }
    const data = Buffer.concat(chunks);
    return JSON.parse(data.toString("utf8"));
  } finally {
    clearTimeout(timeout);
    await reader.cancel();
  }
}
async function handle(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const outHeaders = new Headers({
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
  });
  try {
    const { action } = await context.params;
    const input = request.method === "GET" ? {} : await readBody(request);
    const result = await identity().handle(
      action,
      request.headers,
      input,
      request.method,
    );
    for (const cookie of result.cookies ?? [])
      outHeaders.append("Set-Cookie", cookie);
    return Response.json(result.body, {
      status: result.status ?? 200,
      headers: outHeaders,
    });
  } catch (e) {
    const status =
      e instanceof AuthFault ? e.status : e instanceof SyntaxError ? 400 : 503;
    return Response.json(
      {
        error: {
          code: "REQUEST_REJECTED",
          message: "Die Anfrage konnte nicht bestätigt werden.",
        },
      },
      { status, headers: outHeaders },
    );
  }
}
export const POST = handle;
export const GET = handle;
