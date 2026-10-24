"use client";
import Link from "next/link";
import { Icon } from "@helios/ui";
type View =
  | "focus"
  | "morning"
  | "plan"
  | "tasks"
  | "epics"
  | "settings"
  | "security"
  | "problems";
export function WorkbenchNavigation({
  view,
  contextId,
  busy,
}: Readonly<{ view: View; contextId: string; busy: boolean }>) {
  const links = [
    { id: "focus", label: "Fokus", path: "/?context=" + contextId },
    { id: "plan", label: "Tagesplan", path: "/plan?context=" + contextId },
    { id: "tasks", label: "Aufgaben", path: "/tasks?context=" + contextId },
    { id: "epics", label: "Epics", path: "/epics?context=" + contextId },
    { id: "morning", label: "Morgenroutine", path: "/morning" },
    { id: "problems", label: "Probleme", path: "/problems" },
    { id: "settings", label: "Einstellungen", path: "/settings/contexts" },
  ] as const;
  return (
    <nav
      className="work-nav"
      aria-label="Hauptnavigation"
      onClickCapture={(event) => {
        if (busy) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {links.map((link) => (
        <Link
          key={link.id}
          aria-disabled={busy}
          href={link.path}
          aria-current={view === link.id ? "page" : undefined}
        >
          <Icon name={link.id} />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
export function SettingsChapters({
  chapter,
  select,
  busy,
}: Readonly<{
  chapter: string;
  select: (chapter: string) => void;
  busy: boolean;
}>) {
  return (
    <nav className="settings-jumps" aria-label="Einstellungsbereiche">
      {[
        ["contexts", "Kontexte & Projekte"],
        ["connections", "Verbindungen"],
        ["hours", "Arbeitszeiten & Kalender"],
        ["security", "Sicherheit"],
      ].map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-current={chapter === id ? "page" : undefined}
          disabled={busy}
          onClick={() => select(id!)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
