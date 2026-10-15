import { guardedDomainPost } from "../../../../lib/domain-route";
import { ai } from "../../../../lib/ai";
export const runtime = "nodejs";
export const POST = (r: Request, c: { params: Promise<{ action: string }> }) =>
  guardedDomainPost(r, c, ai, ["start", "apply", "retry"], 65536);
