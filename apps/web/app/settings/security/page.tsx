import { SecurityForm } from "../../../components/identity-forms";
import { requirePage } from "../../../lib/guard";
export const dynamic = "force-dynamic";
export default async function Security() {
  await requirePage("/settings/security");
  return <SecurityForm />;
}
