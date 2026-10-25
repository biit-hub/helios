const statement =
  "TRUNCATE auth_user,auth_flows,auth_limits,auth_rate_limit,auth_verification,auth_totp_uses,security_events CASCADE";

// A PostgreSQL deadlock rolls back this one fixture-reset statement completely.
// Never retry bootstrap or application/remote operations here.
export async function resetBrowserFixture(
  query: (sql: string) => Promise<unknown>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await query(statement);
      return;
    } catch (error) {
      if (
        attempt >= 2 ||
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "40P01"
      )
        throw error;
      await wait((attempt + 1) * 100);
    }
  }
}
