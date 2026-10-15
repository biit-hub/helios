import { epics } from "../../../../lib/epics";
import { guardedDomainPost } from "../../../../lib/domain-route";
export const runtime = "nodejs";
export const POST = (r: Request, c: { params: Promise<{ action: string }> }) =>
  guardedDomainPost(r, c, epics, [], 64000);
