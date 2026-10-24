import { Workbench } from "../../components/workbench";
import { requirePage } from "../../lib/guard";
export const dynamic = "force-dynamic";
export default async function ProblemsPage() {
  await requirePage("/problems");
  return <Workbench problems />;
}
