import { guardedDomainPost } from "../../../../lib/domain-route";
import { work } from "../../../../lib/work";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  return guardedDomainPost(request, context, work);
}
