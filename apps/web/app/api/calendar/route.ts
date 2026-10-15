import { identity } from "../../../lib/identity";
import { termihub } from "../../../lib/termihub";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(r: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    await identity().requireActive(r.headers);
    const q = new URL(r.url).searchParams;
    const input = Object.fromEntries(q.entries());
    return Response.json(await termihub().orientations(r.headers, input), {
      headers,
    });
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
