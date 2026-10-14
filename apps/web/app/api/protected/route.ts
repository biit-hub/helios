import { AuthFault } from "@helios/backend";
import { identity } from "../../../lib/identity";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await identity().requireActive(request.headers);
    return Response.json(
      { authenticated: true },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (e) {
    return Response.json(
      { error: { code: "AUTH_REQUIRED" } },
      {
        status: e instanceof AuthFault ? 401 : 503,
        headers: { "Cache-Control": "no-store, private" },
      },
    );
  }
}
