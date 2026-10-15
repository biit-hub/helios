import { publicWorkError } from "../../packages/backend/src/work/service";
import { AuthFault } from "../../packages/backend/src/identity/policy";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type RequestListener } from "node:http";
import {
  addressKind,
  cleanOrigin,
  createTransport,
  networkConfig,
  resolveTarget,
  type TermiHubNetworkConfig,
} from "../../packages/backend/src/termihub/transport";
import { createTermiHubReader } from "../../packages/backend/src/termihub/reader";
import {
  envelope,
  eventSchema,
} from "../../packages/backend/src/termihub/wire";
const cfg: TermiHubNetworkConfig = {
  timeoutMs: 100,
  maxBytes: 1000,
  privateOrigins: [],
  fixtureOrigin: null,
};
const serverList: Server[] = [];
async function fixture(handler: RequestListener) {
  const server = createServer(handler);
  serverList.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("fixture missing address");
  const origin = "http://127.0.0.1:" + address.port;
  return {
    origin,
    transport: createTransport({ ...cfg, fixtureOrigin: origin }),
  };
}
afterEach(async () => {
  for (const server of serverList.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
describe("TermiHub read boundary", () => {
  it.each([
    "http://calendar.example.invalid",
    "https://u:p@calendar.example.invalid",
    "https://calendar.example.invalid/api",
    "https://calendar.example.invalid?token=x",
    "https://calendar.example.invalid/#x",
  ])("rejects unsafe origin shape %s", async (url) => {
    if (url.startsWith("http:"))
      await expect(resolveTarget(url, cfg)).rejects.toMatchObject({
        code: "TERMIHUB_URL_BLOCKED",
      });
    else expect(() => cleanOrigin(url)).toThrow();
  });
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "169.254.169.254",
    "100.100.100.200",
    "168.63.129.16",
    "224.0.0.1",
    "::1",
    "::ffff:7f00:1",
    "fe80::1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "2001:0db8::1",
  ])("blocks unsafe target %s", (address) => {
    expect(addressKind(address)).toBe("unsafe");
  });
  it("requires operator opt-in for private instances and rejects mixed DNS answers", async () => {
    const resolver = async () => [{ address: "192.168.5.10", family: 4 }];
    await expect(
      resolveTarget("https://calendar.example.invalid", cfg, resolver),
    ).rejects.toMatchObject({ code: "TERMIHUB_URL_BLOCKED" });
    const allowed = {
      ...cfg,
      privateOrigins: ["https://calendar.example.invalid"],
    };
    expect(
      (
        await resolveTarget(
          "https://calendar.example.invalid",
          allowed,
          resolver,
        )
      ).pinned.address,
    ).toBe("192.168.5.10");
    await expect(
      resolveTarget("https://calendar.example.invalid", cfg, async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toMatchObject({ code: "TERMIHUB_URL_BLOCKED" });
  });
  it("revalidates DNS instead of trusting a formerly public host", async () => {
    let calls = 0;
    const resolver = async () => [
      { address: calls++ ? "10.0.0.1" : "93.184.216.34", family: 4 },
    ];
    await resolveTarget("https://calendar.example.invalid", cfg, resolver);
    await expect(
      resolveTarget("https://calendar.example.invalid", cfg, resolver),
    ).rejects.toMatchObject({ code: "TERMIHUB_URL_BLOCKED" });
  });
  it("restricts fixture bypass to test-loopback and private origins to HTTPS", () => {
    expect(() =>
      networkConfig({
        HELIOS_ENV: "production",
        TERMIHUB_TEST_ORIGIN: "http://127.0.0.1:1234",
      }),
    ).toThrow();
    expect(() =>
      networkConfig({
        HELIOS_ENV: "test",
        TERMIHUB_TEST_ORIGIN: "http://10.0.0.1:1234",
      }),
    ).toThrow();
    expect(() =>
      networkConfig({
        TERMIHUB_PRIVATE_ORIGINS: "http://calendar.example.invalid",
      }),
    ).toThrow();
    expect(
      networkConfig({
        HELIOS_ENV: "test",
        TERMIHUB_TEST_ORIGIN: "http://127.0.0.1:1234",
      }).fixtureOrigin,
    ).toBe("http://127.0.0.1:1234");
  });
  it("uses GET and header credentials, strips private event text, and never uses admin paths", async () => {
    const f = await fixture((req, res) => {
      expect(req.method).toBe("GET");
      expect(req.url).toBe("/api/v1/external/events?limit=500");
      expect(req.headers.authorization).toBe("Bearer synthetic-termihub-token");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          data: [event()],
          meta: { count: 1, timezone: "Europe/Zurich" },
        }),
      );
    });
    const raw = await f.transport(
      f.origin,
      "events",
      new URLSearchParams({ limit: "500" }),
      "synthetic-termihub-token",
    );
    const parsed = envelope(eventSchema).parse(raw);
    expect(JSON.stringify(parsed)).not.toContain(
      "Private synthetic description",
    );
    expect(JSON.stringify(parsed)).not.toContain(
      "Synthetic confidential title",
    );
    await expect(
      f.transport(
        f.origin,
        "../api-tokens",
        new URLSearchParams(),
        "synthetic-termihub-token",
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_REQUEST_INVALID" });
  });
  it("never follows a redirect carrying the bearer token", async () => {
    let calls = 0;
    const f = await fixture((_req, res) => {
      calls++;
      res.writeHead(302, { Location: "http://169.254.169.254/" });
      res.end();
    });
    await expect(
      f.transport(
        f.origin,
        "calendars",
        new URLSearchParams(),
        "synthetic-termihub-token",
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_REDIRECT" });
    expect(calls).toBe(1);
  });
  it.each([
    [401, "TERMIHUB_AUTH"],
    [403, "TERMIHUB_PERMISSION"],
    [429, "TERMIHUB_RATE_LIMIT"],
    [503, "TERMIHUB_RESPONSE"],
  ])("redacts rejection %s", async (status, code) => {
    const f = await fixture((_req, res) => {
      res.writeHead(Number(status), { "Retry-After": "90" });
      res.end("synthetic-private-response");
    });
    await expect(
      f.transport(
        f.origin,
        "calendars",
        new URLSearchParams(),
        "synthetic-termihub-token",
      ),
    ).rejects.toMatchObject({ code, message: code });
  });
  it("bounds malformed, oversized and slow responses", async () => {
    const malformed = await fixture((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end("{private-invalid");
    });
    await expect(
      malformed.transport(
        malformed.origin,
        "calendars",
        new URLSearchParams(),
        "synthetic-token",
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_CONTRACT" });
    const oversized = await fixture((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end('"' + "x".repeat(1500) + '"');
    });
    await expect(
      oversized.transport(
        oversized.origin,
        "calendars",
        new URLSearchParams(),
        "synthetic-token",
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_TOO_LARGE" });
    const slow = await fixture(() => undefined);
    await expect(
      slow.transport(
        slow.origin,
        "calendars",
        new URLSearchParams(),
        "synthetic-token",
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_TIMEOUT" });
  });
  it("rejects contradictory envelope metadata and invalid all-day shapes", () => {
    expect(
      envelope(eventSchema).safeParse({
        data: [event()],
        meta: { count: 0, timezone: "Europe/Zurich" },
      }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...event(), all_day: true }).success).toBe(
      false,
    );
    expect(
      eventSchema.safeParse({
        ...event(),
        all_day: true,
        start: null,
        end: null,
        start_date: "2026-10-25",
        end_date: "2026-10-26",
      }).success,
    ).toBe(true);
  });
  it("uses actual repeated real/virtual calendar filters and bounded explicit windows", async () => {
    const requests: { path: string; query: URLSearchParams }[] = [];
    const reader = createTermiHubReader(async (_base, _path, _query) => {
      requests.push({ path: _path, query: _query });
      return { data: [], meta: { count: 0, timezone: "Europe/Zurich" } };
    });
    const ids = [
      "b2222222-2222-4222-8222-222222222222",
      "a1111111-1111-4111-8111-111111111111",
    ];
    await reader.events(
      "https://calendar.example.invalid",
      "synthetic-token",
      { start: "2026-10-24T22:00:00Z", end: "2026-10-25T23:00:00Z" },
      ids,
    );
    expect(requests[0]!.query.getAll("calendar_ids")).toEqual([...ids].sort());
    expect(requests[0]!.query.has("virtual_calendar_ids")).toBe(false);
    expect(requests[0]!.query.get("include_virtual")).toBe("true");
    expect(requests[0]!.query.get("limit")).toBe("500");
    await expect(
      reader.events(
        "https://calendar.example.invalid",
        "synthetic-token",
        { start: "2026-10-25T00:00:00Z", end: "2026-10-26T00:00:00Z" },
        [],
      ),
    ).rejects.toMatchObject({ code: "TERMIHUB_CALENDAR_MAPPING" });
  });
});
function event() {
  return {
    id: "synthetic-event",
    title: "Synthetic confidential title",
    description: "Private synthetic description",
    start: "2026-10-25T08:00:00+01:00",
    end: "2026-10-25T09:00:00+01:00",
    start_date: null,
    end_date: null,
    all_day: false,
    timezone: "Europe/Zurich",
    calendar: { id: "synthetic-calendar", type: "real" },
    availability: "BUSY",
    status: "confirmed",
    recurring: false,
    series_id: null,
  };
}

it("keeps external credential rejection distinct from a Helios login failure", async () => {
  const { TermiHubFault } =
    await import("../../packages/backend/src/termihub/transport");
  expect(publicWorkError(new TermiHubFault("TERMIHUB_AUTH", 401)).status).toBe(
    409,
  );
  expect(publicWorkError(new AuthFault()).status).toBe(401);
  const blocked = publicWorkError(
    new TermiHubFault("TERMIHUB_URL_BLOCKED", 400),
  );
  expect(blocked.status).toBe(400);
  expect(blocked.body.error.message).toContain("nicht freigegeben");
});
it("rejects a server that ignores the selected calendar filter", async () => {
  const reader = createTermiHubReader(async () => ({
    data: [event()],
    meta: { count: 1, timezone: "Europe/Zurich" },
  }));
  await expect(
    reader.events(
      "https://calendar.example.invalid",
      "synthetic-token",
      { start: "2026-10-25T00:00:00Z", end: "2026-10-26T00:00:00Z" },
      ["a1111111-1111-4111-8111-111111111111"],
    ),
  ).rejects.toMatchObject({ code: "TERMIHUB_SCOPE" });
});
it("bounds chunked payloads without trusting a missing content length", async () => {
  const f = await fixture((_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Transfer-Encoding": "chunked",
    });
    res.write('"');
    res.write("x".repeat(1500));
    res.end('"');
  });
  await expect(
    f.transport(
      f.origin,
      "calendars",
      new URLSearchParams(),
      "synthetic-token",
    ),
  ).rejects.toMatchObject({ code: "TERMIHUB_TOO_LARGE" });
});
