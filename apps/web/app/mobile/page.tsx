import Link from "next/link";
import { Foundation } from "@helios/ui";
import { requirePage } from "../../lib/guard";
import { Logout } from "../../components/identity-forms";
export const dynamic = "force-dynamic";
export default async function Mobile() {
  await requirePage("/mobile");
  return (
    <>
      <Foundation mobile />
      <div className="shell mobile">
        <Link href="/settings/security">Sicherheitseinstellungen</Link>
        <Logout />
      </div>
    </>
  );
}
