import { guardedDomainPost } from "../../../../lib/domain-route";
import { planning } from "../../../../lib/planning";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return guardedDomainPost(request, context, planning, ["confirm", "resume"]);
}
