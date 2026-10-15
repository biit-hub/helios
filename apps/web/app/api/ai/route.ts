import { ai } from "../../../lib/ai";
import { identity } from "../../../lib/identity";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(r: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    await identity().requireActive(r.headers);
    const u = new URL(r.url);
    return Response.json(
      await ai().list(r.headers, {
        id: u.searchParams.get("id") ?? undefined,
        contextId: u.searchParams.get("contextId") ?? undefined,
        taskId: u.searchParams.get("taskId") ?? undefined,
      }),
      { headers },
    );
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
