export { Icon } from "./icon";
import type { ReactNode } from "react";
export function Brand() {
  return (
    <a href="/" className="brand" aria-label="Helios Startseite">
      <span aria-hidden="true" className="brand-orb" />
      <span className="brand-copy">
        <span className="brand-kicker">Lokaler Fokusassistent</span>
        <span className="brand-title">HELIOS</span>
        <span className="brand-tagline">Bringt Licht ins Chaos</span>
      </span>
    </a>
  );
}
export function Foundation({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={mobile ? "shell mobile" : "shell"}>
      <header>
        <Brand />
        <span className="stage">Technische Vorschau</span>
      </header>
      <main>
        <div className="eyebrow">EIN RUHIGER START</div>
        <h1>
          Platz für das,
          <br />
          was heute zählt.
        </h1>
        <p className="lead">
          Helios wird dich bei deiner Morgenroutine, Tagesplanung und dem
          nächsten sinnvollen Schritt begleiten.
        </p>
        <section className="card" aria-labelledby="foundation-title">
          <span className="pill">E1.2 · Sicherer Zugang</span>
          <h2 id="foundation-title">Willkommen in deinem Arbeitsraum.</h2>
          <p>
            Webanwendung, Datenbank und Hintergrundverarbeitung bilden den
            Anfang. Aufgaben und persönliche Daten werden hier noch nicht
            angezeigt.
          </p>
          <p className="notice">
            Dein Zugang ist geschützt. Aufgabenverbindungen und Tagesplanung
            folgen in den nächsten Etappen.
          </p>
        </section>
        <div className="grid">
          <Info title="Ein Schritt nach dem anderen">
            Eine klare Fokusansicht und überschaubare Tagesauswahl sind geplant.
          </Info>
          <Info title="Deine Kontexte">
            Arbeit und Privat erhalten eigene Pläne und Routinen.
          </Info>
          <Info title="Lokal gedacht">
            Später unterstützt lokale KI mit Vorschlägen, die du selbst prüfst.
          </Info>
        </div>
        <nav aria-label="Ansichten">
          <a href={mobile ? "/" : "/mobile"}>
            {mobile ? "Desktop-Grundlayout" : "Mobiles Grundlayout"} →
          </a>
        </nav>
      </main>
      <footer>Helios · Im Aufbau · Noch keine Aufgabenverbindungen</footer>
    </div>
  );
}
function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="info">
      <h2>{title}</h2>
      <p>{children}</p>
      <span>Geplant</span>
    </section>
  );
}
export { HeliosSphereLoader } from "./helios-sphere-loader";
export {
  Button,
  ActionButton,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch,
  FormField,
  Card,
  Badge,
  StatusMessage,
  Accordion,
  Dialog,
  DialogSurface,
} from "./primitives";
export type { ButtonProps, BadgeTone, AccordionProps } from "./primitives";
