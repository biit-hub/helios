import { tasks } from "../../../lib/tasks";
import { identity } from "../../../lib/identity";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(r: Request) {
  const headers = { "Cache-Control": "no-store, private" };
  try {
    await identity().requireActive(r.headers);
    const u = new URL(r.url);
    return Response.json(
      u.searchParams.has("taskId")
        ? await tasks().inspect(
            r.headers,
            u.searchParams.get("contextId") ?? "",
            u.searchParams.get("taskId") ?? "",
          )
        : u.searchParams.has("projectId")
          ? await tasks().options(
              r.headers,
              u.searchParams.get("projectId") ?? "",
            )
          : await tasks().operations(r.headers),
      { headers },
    );
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
