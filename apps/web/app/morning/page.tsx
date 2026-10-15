import { requirePage } from "../../lib/guard";
import { Workbench } from "../../components/workbench";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePage("/morning");
  return <Workbench routine />;
}
