import { identity } from "../../../../lib/identity";
import { aiJobs } from "../../../../lib/ai-jobs";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    await identity().requireActive(request.headers);
    const params = new URL(request.url).searchParams;
    const file = await aiJobs().artifact(
      request.headers,
      params.get("job") ?? "",
      params.get("id") ?? "",
    );
    return new Response(new Uint8Array(file.data), {
      headers: {
        ...headers,
        "Content-Type": file.mime,
        "Content-Length": String(file.size),
        "Content-Disposition": 'attachment; filename="' + file.filename + '"',
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    const result = publicWorkError(error);
    return Response.json(result.body, { status: result.status, headers });
  }
}
