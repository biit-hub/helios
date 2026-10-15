import { routine } from "../../../lib/routine";
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
    const kind = u.searchParams.get("kind");
    const result = kind
      ? await routine().details(
          r.headers,
          u.searchParams.get("id") ?? "",
          kind,
          u.searchParams.get("contextId") ?? undefined,
        )
      : await routine().snapshot(
          r.headers,
          u.searchParams.get("day") ?? undefined,
        );
    return Response.json(result, { headers });
  } catch (error) {
    const result = publicWorkError(error);
    return Response.json(result.body, { status: result.status, headers });
  }
}
