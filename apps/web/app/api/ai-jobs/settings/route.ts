import { aiJobs } from "../../../../lib/ai-jobs";
import { identity } from "../../../../lib/identity";
import { publicWorkError } from "@helios/backend";
import { guardedDomainPost } from "../../../../lib/domain-route";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    await identity().requireActive(request.headers);
    return Response.json(await aiJobs().settings(request.headers), { headers });
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
export const POST = (request: Request) =>
  guardedDomainPost(
    request,
    { params: Promise.resolve({ action: "settings" }) },
    aiJobs,
  );
