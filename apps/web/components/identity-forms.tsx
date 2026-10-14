"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Brand } from "@helios/ui";
type Payload = {
  error?: { code: string; message: string };
  challenge?: boolean;
  next?: string;
  qr?: string;
  totpURI?: string;
  backupCodes?: string[];
  sessions?: Session[];
};
type Session = {
  id: string;
  device: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  trusted: boolean;
  current: boolean;
};
async function request(
  action: string,
  data: Record<string, unknown> = {},
  method = "POST",
) {
  const r = await fetch("/api/identity/" + action, {
    method,
    headers:
      method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(data) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });
  const body: Payload = await r.json();
  if (!r.ok)
    throw new Error(
      body.error?.code === "CODE_ALREADY_USED"
        ? "Dieser Code wurde bereits verwendet. Bitte neu anmelden und den nächsten Authenticator-Code verwenden."
        : (body.error?.message ?? "Die Anfrage ist fehlgeschlagen."),
    );
  return body;
}
function go(path: string) {
  window.location.assign(
    [
      "/",
      "/tasks",
      "/plan",
      "/login",
      "/setup",
      "/mobile",
      "/settings/security",
      "/settings/contexts",
    ].includes(path)
      ? path
      : "/login",
  );
}
function Frame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="shell auth-shell">
      <header>
        <Brand />
        <span className="stage">Dein sicherer Zugang</span>
      </header>
      <main>
        <section className="card auth-card">
          <h1>{title}</h1>
          {children}
        </section>
      </main>
    </div>
  );
}
function Status({ error, busy }: { error: string; busy: boolean }) {
  return (
    <>
      <p role="alert" className="form-error">
        {error}
      </p>
      {busy && <p role="status">Bitte warten …</p>}
    </>
  );
}
export function LoginForm({ returnTo }: { returnTo: string }) {
  const [stage, setStage] = useState<"password" | "totp" | "recovery">(
    "password",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [trusted, setTrusted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r =
        stage === "password"
          ? await request("login", { username, password, trusted, returnTo })
          : await request(stage === "totp" ? "mfa" : "recover", { code });
      if (stage === "password") {
        setPassword("");
        setStage("totp");
      } else if (r.next) go(r.next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Willkommen bei Helios">
      <p>
        {stage === "password"
          ? "Melde dich mit Benutzername und Passwort an."
          : stage === "totp"
            ? "Gib den aktuellen Code aus deiner Authenticator-App ein."
            : "Ein Recovery-Code startet die kontrollierte Neueinrichtung deines Authenticators."}
      </p>
      <form onSubmit={submit}>
        {stage === "password" ? (
          <>
            <label>
              Benutzername
              <input
                autoComplete="username"
                required
                maxLength={30}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label>
              Passwort
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={trusted}
                onChange={(e) => setTrusted(e.target.checked)}
              />
              Diesem Gerät vertrauen
            </label>
            <p className="help">
              Bis zu 30 Tage. Auf anderen Geräten endet die Sitzung spätestens
              nach 12 Stunden oder 30 Minuten Inaktivität.
            </p>
          </>
        ) : (
          <label>
            {stage === "totp" ? "Authenticator-Code" : "Recovery-Code"}
            <input
              autoComplete={stage === "totp" ? "one-time-code" : "off"}
              inputMode={stage === "totp" ? "numeric" : "text"}
              required
              maxLength={stage === "totp" ? 6 : 100}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
        )}
        <Status error={error} busy={busy} />
        <button disabled={busy}>
          {stage === "password" ? "Weiter" : "Sicher anmelden"}
        </button>
      </form>
      {stage !== "password" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setCode("");
            setError("");
            setStage(stage === "totp" ? "recovery" : "totp");
          }}
        >
          {stage === "totp"
            ? "Authenticator verloren? Recovery-Code verwenden"
            : "Authenticator-Code verwenden"}
        </button>
      )}
      {stage !== "password" && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setStage("password");
            setCode("");
            setError("");
          }}
        >
          Neu anmelden
        </button>
      )}
      <Link className="setup-link" href="/setup">
        Konto mit lokalem Setupnachweis einrichten
      </Link>
    </Frame>
  );
}
export function SetupForm({ recovering = false }: { recovering?: boolean }) {
  const [stage, setStage] = useState<"start" | "totp" | "codes">("start");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (stage === "start") {
        const r = await request("setup", {
          ...(token ? { token } : {}),
          password,
        });
        setQr(r.qr ?? "");
        setUri(r.totpURI ?? "");
        setToken("");
        setPassword("");
        setStage("totp");
      } else if (stage === "totp") {
        const r = await request("verify-enrollment", { code });
        setCodes(r.backupCodes ?? []);
        setQr("");
        setUri("");
        setCode("");
        setStage("codes");
      } else {
        const r = await request("activate", { saved });
        setCodes([]);
        if (r.next) go(r.next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Einrichtung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Dein Helios-Konto einrichten">
      <form onSubmit={submit}>
        {stage === "start" ? (
          <>
            <p>
              {recovering
                ? "Deine bisherigen Sitzungen sind gesperrt. Richte einen neuen Authenticator ein."
                : "Der Setupnachweis wird ausschliesslich über das lokale Verwaltungs-CLI erzeugt und ist zehn Minuten gültig."}
            </p>
            {!recovering && (
              <label>
                Setupnachweis
                <input
                  autoComplete="off"
                  required
                  maxLength={64}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
            )}
            <label>
              Dein Passwort
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        ) : stage === "totp" ? (
          <>
            <p>
              Öffne deine Authenticator-App, füge ein Konto hinzu und scanne
              diesen QR-Code. Der Code wird lokal in Helios erzeugt.
            </p>
            {qr && (
              <Image
                unoptimized
                src={qr}
                width={260}
                height={260}
                alt="QR-Code für den Helios-Authenticator"
              />
            )}
            <details>
              <summary>Manuell einrichten</summary>
              <p className="secret-text">
                {uri ? new URL(uri).searchParams.get("secret") : ""}
              </p>
              <p>Typ: TOTP · 6 Stellen · 30 Sekunden</p>
            </details>
            <label>
              Authenticator-Code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <h2>Recovery-Codes sicher aufbewahren</h2>
            <p>
              Jeder Code ist nur einmal verwendbar. Diese Anzeige erscheint
              einmalig. Speichere die Codes in deinem Passwortmanager oder an
              einem sicheren Offlineort.
            </p>
            <ul className="recovery-codes">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <label className="check">
              <input
                type="checkbox"
                required
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              Ich habe die Recovery-Codes sicher gespeichert.
            </label>
          </>
        )}
        <Status error={error} busy={busy} />
        <button disabled={busy || (stage === "codes" && !saved)}>
          {stage === "start"
            ? "Authenticator einrichten"
            : stage === "totp"
              ? "Code bestätigen"
              : "Konto aktivieren"}
        </button>
      </form>
      <p className="help">
        Bei Unterbruch: mit derselben Einrichtungssitzung erneut öffnen und neu
        beginnen. Nach Ablauf hilft das lokale Recovery-CLI. Es gibt keine
        öffentliche Registrierung.
      </p>
    </Frame>
  );
}
export function Logout() {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="secondary"
        onClick={() =>
          void request("logout")
            .then(() => go("/login"))
            .catch(() =>
              setError("Abmelden fehlgeschlagen. Bitte erneut versuchen."),
            )
        }
      >
        Abmelden
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
export function SecurityForm() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await request("sessions", {}, "GET");
    setSessions(r.sessions ?? []);
  }
  useEffect(() => {
    void request("sessions", {}, "GET")
      .then((r) => setSessions(r.sessions ?? []))
      .catch(() => setError("Sitzungen konnten nicht geladen werden."));
  }, []);
  async function run(action: string, data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await request(action, data);
      if (r.next) {
        go(r.next);
        return;
      }
      if (r.backupCodes) setCodes(r.backupCodes);
      if (action === "step-up") {
        setConfirmed(true);
        setCode("");
        setMessage("Bestätigung für maximal fünf Minuten gültig.");
      } else {
        setMessage("Änderung gespeichert.");
        setPassword("");
        setNewPassword("");
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
      if (e instanceof Error && e.message.includes("bestätigen"))
        setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Frame title="Sicherheit">
      <p>
        Sensible Änderungen benötigen eine Bestätigung mit Passwort und einem
        neuen Authenticator-Code.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("step-up", { password, code });
        }}
      >
        <label>
          Aktuelles Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Neuer Authenticator-Code
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button disabled={busy}>Sicherheitsaktionen bestätigen</button>
      </form>
      <Status error={error} busy={busy} />
      {message && <p role="status">{message}</p>}
      <section>
        <h2>Passwort ändern</h2>
        <label>
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !confirmed || newPassword.length < 12 || !password}
          onClick={() => void run("password", { password, newPassword })}
        >
          Passwort ändern und neu anmelden
        </button>
      </section>
      <section>
        <h2>Authenticator und Recovery</h2>
        <p>
          Ein neuer Authenticator sperrt die bisherigen Sitzungen bis zur
          abgeschlossenen Neueinrichtung. Neue Recovery-Codes ersetzen die
          bisherigen.
        </p>
        <button
          disabled={busy || !confirmed || !password}
          onClick={() => void run("rotate-totp", { password })}
        >
          Authenticator neu einrichten
        </button>
        <button
          className="secondary"
          disabled={busy || !confirmed || !password}
          onClick={() => void run("rotate-recovery", { password })}
        >
          Recovery-Codes erneuern
        </button>
        {codes.length > 0 && (
          <div>
            <ul className="recovery-codes">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button onClick={() => setCodes([])}>
              Codes sicher gespeichert – Anzeige schliessen
            </button>
          </div>
        )}
      </section>
      <section>
        <h2>Aktive Sitzungen</h2>
        <ul className="sessions">
          {sessions.map((s) => (
            <li key={s.id}>
              <strong>
                {s.device}
                {s.current ? " · Diese Sitzung" : ""}
              </strong>
              <p>
                {s.trusted ? "Vertrauenswürdig" : "Normal"} · Ablauf:{" "}
                {new Date(s.expiresAt).toLocaleString("de-CH")}
              </p>
              {!s.current && (
                <button
                  className="secondary"
                  disabled={busy || !confirmed}
                  onClick={() => void run("revoke", { id: s.id })}
                >
                  Sitzung widerrufen
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          disabled={busy || !confirmed}
          onClick={() => void run("revoke-others", {})}
        >
          Alle anderen Sitzungen widerrufen
        </button>
      </section>
      <nav>
        <Link href="/">Zur Anwendung</Link> ·{" "}
        <Link href="/mobile">Mobile Ansicht</Link>
      </nav>
      <Logout />
    </Frame>
  );
}
