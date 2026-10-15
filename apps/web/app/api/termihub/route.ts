import { termihub } from "../../../lib/termihub";
import { publicWorkError } from "@helios/backend";
export const runtime = "nodejs";
export async function GET(r: Request) {
  const headers = {
    "Cache-Control": "no-store, private",
    "Referrer-Policy": "no-referrer",
  };
  try {
    return Response.json(await termihub().settings(r.headers), { headers });
  } catch (e) {
    const out = publicWorkError(e);
    return Response.json(out.body, { status: out.status, headers });
  }
}
