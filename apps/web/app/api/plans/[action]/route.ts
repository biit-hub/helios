import { guardedDomainPost } from "../../../../lib/domain-route";
import { planning } from "../../../../lib/planning";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return guardedDomainPost(
    request,
    context,
    planning,
    ["confirm", "resume", "admit", "reserve-close"],
    action === "reorder" ? 131072 : 8192,
  );
}
