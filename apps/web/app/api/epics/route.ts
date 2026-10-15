import { epics } from "../../../lib/epics";
import { identity } from "../../../lib/identity";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(r: Request) {
  const headers = { "Cache-Control": "no-store, private" };
  try {
    await identity().requireActive(r.headers);
    const q = new URL(r.url).searchParams,
      context = q.get("contextId") ?? "";
    return Response.json(
      q.has("taskId")
        ? await epics().detail(r.headers, context, q.get("taskId") ?? "")
        : await epics().list(r.headers, context),
      { headers },
    );
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
