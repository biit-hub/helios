import { guardedDomainPost } from "../../../../lib/domain-route";
import { termihub } from "../../../../lib/termihub";
export const runtime = "nodejs";
export const POST = (r: Request, c: { params: Promise<{ action: string }> }) =>
  guardedDomainPost(r, c, termihub, ["refresh"], 65536);
