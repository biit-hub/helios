import { guardedDomainPost } from "../../../../lib/domain-route";
import { tasks } from "../../../../lib/tasks";
export const runtime = "nodejs";
export const POST = (r: Request, c: { params: Promise<{ action: string }> }) =>
  guardedDomainPost(r, c, tasks, ["submit", "resume"], 65536);
