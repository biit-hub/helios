import { contextIdSchema } from "@helios/contracts";
import { publicWorkError } from "@helios/backend";
import { planning } from "../../../lib/planning";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const url = new URL(request.url);
    const id = contextIdSchema.parse(url.searchParams.get("contextId"));
    return Response.json(
      await planning().snapshot(
        request.headers,
        id,
        url.searchParams.get("day") ?? undefined,
      ),
      { headers },
    );
  } catch (e) {
    const r = publicWorkError(e);
    return Response.json(r.body, { status: r.status, headers });
  }
}
