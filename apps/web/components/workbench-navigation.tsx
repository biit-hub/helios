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
  | "security";
export function WorkbenchNavigation({
  view,
  contextId,
  busy,
}: Readonly<{ view: View; contextId: string; busy: boolean }>) {
  const links = [
    { id: "focus", label: "Fokus", path: "/?context=" + contextId },
    {
      id: "morning",
      label: "Morgenroutine",
      path: "/morning?context=" + contextId,
    },
    { id: "plan", label: "Tagesplan", path: "/plan?context=" + contextId },
    { id: "tasks", label: "Aufgaben", path: "/tasks?context=" + contextId },
    { id: "epics", label: "Epics", path: "/epics?context=" + contextId },
    {
      id: "settings",
      label: "Einstellungen",
      path: "/settings/contexts?context=" + contextId,
    },
    { id: "security", label: "Sicherheit", path: "/settings/security" },
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
      {(["context", "general"] as const).map((scope) => (
        <div
          key={scope}
          className="nav-group"
          role="group"
          aria-label={scope === "context" ? "Aktiver Kontext" : "Allgemein"}
        >
          <span className="nav-group-label">
            {scope === "context" ? "Aktiver Kontext" : "Allgemein"}
          </span>
          {links
            .filter(
              (link) =>
                (["morning", "settings", "security"].includes(link.id)
                  ? "general"
                  : "context") === scope,
            )
            .map((link) => (
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
        </div>
      ))}
    </nav>
  );
}
export function SettingsJumpLinks() {
  return (
    <nav className="settings-jumps" aria-label="Einstellungsbereiche">
      <a href="#contexts-settings">Arbeitgeber & Privat</a>
      <a href="#todoist-settings">Todoist</a>
      <a href="#termihub-settings">TermiHub & Kalender</a>
      <a href="#sensitive-changes">Sensible Änderungen</a>
      <a href="#integration-problems">Verbindungen & Probleme</a>
    </nav>
  );
}
