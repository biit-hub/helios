import { headers } from "next/headers";
import { SetupForm } from "../../components/identity-forms";
import { identity } from "../../lib/identity";
export const dynamic = "force-dynamic";
export default async function Setup() {
  const purpose = await identity().enrollmentPurpose(
    new Headers(await headers()),
  );
  return (
    <SetupForm
      recovering={purpose === "recovery" || purpose === "enrollment"}
    />
  );
}
