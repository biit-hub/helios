import { contextIdSchema } from "@helios/contracts";
import { identity } from "../../../lib/identity";
import { work } from "../../../lib/work";
import { publicWorkError } from "@helios/backend";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
};
export async function GET(request: Request) {
  try {
    await identity().requireActive(request.headers);
    const url = new URL(request.url);
    const contextId = url.searchParams.get("contextId");
    const data = contextId
      ? await work().tasks(request.headers, contextIdSchema.parse(contextId))
      : await work().snapshot(request.headers);
    return Response.json(data, { headers });
  } catch (e) {
    const r = publicWorkError(e);
    return Response.json(r.body, { status: r.status, headers });
  }
}
