import { it, expect } from "vitest";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  createDatabase,
  loadWorkConfig,
  bootstrapIdentity,
} from "@helios/backend";
it("upgrades an existing E1.2 account additively and provisions its private context", async () => {
  const config = loadWorkConfig({
    ...process.env,
    HELIOS_ENV: "test",
    AUTH_SECRET: "e".repeat(64),
    AUTH_ORIGIN: "http://127.0.0.1:3100",
  });
  const admin = createDatabase(config.DATABASE_URL);
  const name = "helios_upgrade_" + process.pid + "_test";
  if (!/^helios_upgrade_[0-9]+_test$/.test(name))
    throw new Error("Unsafe test database");
  let created = false;
  let db: ReturnType<typeof createDatabase> | undefined;
  try {
    await admin.pool.query('CREATE DATABASE "' + name + '"');
    created = true;
    const url = new URL(config.DATABASE_URL);
    url.pathname = "/" + name;
    db = createDatabase(url.toString());
    const folder = resolve("private", name);
    mkdirSync(resolve(folder, "meta"), { recursive: true });
    const journal = JSON.parse(
      readFileSync("packages/backend/migrations/meta/_journal.json", "utf8"),
    );
    journal.entries = journal.entries.filter(
      (e: { idx: number }) => e.idx <= 2,
    );
    writeFileSync(
      resolve(folder, "meta/_journal.json"),
      JSON.stringify(journal),
    );
    for (const e of journal.entries)
      copyFileSync(
        "packages/backend/migrations/" + e.tag + ".sql",
        resolve(folder, e.tag + ".sql"),
      );
    await migrate(db.db, { migrationsFolder: folder });
    await bootstrapIdentity(
      db,
      { ...config, DATABASE_URL: url.toString() },
      "synthetic_upgrade",
      "Synthetic upgrade password 84!",
    );
    const old = await db.pool.query("SELECT id FROM auth_user");
    await migrate(db.db, {
      migrationsFolder: resolve("packages/backend/migrations"),
    });
    expect((await db.pool.query("SELECT id FROM auth_user")).rows).toEqual(
      old.rows,
    );
    expect(
      (
        await db.pool.query("SELECT kind,name FROM contexts WHERE user_id=$1", [
          old.rows[0].id,
        ])
      ).rows,
    ).toEqual([{ kind: "private", name: "Privat" }]);
    expect(
      (await db.pool.query("SELECT read_claim FROM integrations LIMIT 1")).rows,
    ).toHaveLength(0);
  } finally {
    await db?.close();
    if (created) await admin.pool.query('DROP DATABASE "' + name + '"');
    await admin.close();
  }
});
