import { guardedDomainPost } from "../../../../lib/domain-route";
import { routine } from "../../../../lib/routine";
export const runtime = "nodejs";
export const POST = (r: Request, c: { params: Promise<{ action: string }> }) =>
  guardedDomainPost(
    r,
    c,
    routine,
    ["inbox-move", "inbox-delete", "review-close"],
    65536,
  );
