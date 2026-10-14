import { LoginForm } from "../../components/identity-forms";
import { safeReturnTo } from "@helios/backend";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  return <LoginForm returnTo={safeReturnTo((await searchParams).returnTo)} />;
}
