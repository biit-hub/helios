import { guardedDomainPost } from "../../../../lib/domain-route";
import { aiJobs } from "../../../../lib/ai-jobs";
export const runtime = "nodejs";
export const POST = (
  request: Request,
  context: { params: Promise<{ action: string }> },
) => guardedDomainPost(request, context, aiJobs, ["create"], 65536);
