import { healthSchema } from "@helios/contracts";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    healthSchema.parse({ status: "ok", service: "web", stage: "E8" }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
