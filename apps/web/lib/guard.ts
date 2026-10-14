import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeReturnTo, AuthFault } from "@helios/backend";
import { identity } from "./identity";
export async function requirePage(path: string) {
  try {
    return await identity().requireActive(new Headers(await headers()));
  } catch (e) {
    if (e instanceof AuthFault)
      redirect("/login?returnTo=" + encodeURIComponent(safeReturnTo(path)));
    throw e;
  }
}
