import Link from "next/link";
import { Foundation } from "@helios/ui";
import { requirePage } from "../lib/guard";
import { Logout } from "../components/identity-forms";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePage("/");
  return (
    <>
      <Foundation />
      <div className="shell">
        <Link href="/settings/security">Sicherheitseinstellungen</Link>
        <Logout />
      </div>
    </>
  );
}
