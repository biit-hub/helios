import { aiJobs } from "../../../lib/ai-jobs";
import { identity } from "../../../lib/identity";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    await identity().requireActive(request.headers);
    const params = new URL(request.url).searchParams;
    if (params.has("refTask"))
      return Response.json(
        await aiJobs().reference(
          request.headers,
          params.get("contextId") ?? "",
          params.get("refTask") ?? "",
        ),
        { headers },
      );
    const id = params.get("id");
    const result = id
      ? await aiJobs().detail(request.headers, id)
      : await aiJobs().list(request.headers, {
          page: params.get("page") ?? 1,
          status: params.get("status") ?? undefined,
          oldest: params.get("sort") === "oldest",
          search: params.get("q") ?? "",
        });
    return Response.json(result, { headers });
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
