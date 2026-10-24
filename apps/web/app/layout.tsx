import "./work.css";
import type { Metadata } from "next";
import "@helios/ui/styles.css";
import "./identity.css";
import "./design-system.css";
import "./ux-redesign.css";
export const metadata: Metadata = {
  title: "Helios – Ein ruhiger Start",
  description: "Eine bewusste Tagesauswahl und ein ruhiger nächster Schritt.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
