import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDatabase } from "../db";
import { loadIdentityConfig } from "./config";
import { bootstrapIdentity, adminRecovery } from "./service";
async function secret(label: string) {
  if (!stdin.isTTY) throw new Error("Interactive terminal required");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish();
          reject(new Error("Cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b")
          value = value.slice(0, -1);
        else if (character >= " " && value.length < 129) value += character;
      }
    };
    stdin.on("data", onData);
  });
}
async function main() {
  if (
    !stdin.isTTY ||
    !stdout.isTTY ||
    process.argv.length !== 3 ||
    !["bootstrap", "recover"].includes(process.argv[2]!)
  )
    throw new Error("Usage in interactive terminal: cli.ts bootstrap|recover");
  const mode = process.argv[2]!;
  const rl = createInterface({ input: stdin, output: stdout });
  let username = "";
  if (mode === "bootstrap")
    username = (await rl.question("Benutzername: ")).trim();
  else if (
    (await rl.question(
      "Lokale Wiederherstellung widerruft alle Sitzungen. RECOVER eingeben: ",
    )) !== "RECOVER"
  )
    throw new Error("Cancelled");
  rl.close();
  const password = await secret(
    "Neues Passwort (mindestens 12 Zeichen, verborgen): ",
  );
  const confirmation = await secret("Passwort wiederholen (verborgen): ");
  if (password !== confirmation) throw new Error("Passwords differ");
  const config = loadIdentityConfig();
  const database = createDatabase(config.DATABASE_URL);
  try {
    const result =
      mode === "bootstrap"
        ? await bootstrapIdentity(database, config, username, password)
        : await adminRecovery(database, config, password);
    stdout.write(
      "Einmaliger Setupnachweis (10 Minuten gültig):\n" +
        result.proof +
        "\nIm lokalen Browser /setup öffnen und den Nachweis im Formular eingeben. Nicht in URLs, Logs oder Screenshots speichern.\n",
    );
  } finally {
    await database.close();
  }
}
main().catch(() => {
  console.error(
    "Lokale Kontoeinrichtung fehlgeschlagen. Konfiguration, bestehenden Kontostand und Eingaben prüfen. Keine Geheimnisse protokolliert.",
  );
  process.exitCode = 1;
});
