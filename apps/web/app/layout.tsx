import type { Metadata } from "next";
import "@helios/ui/styles.css";
import "./identity.css";
export const metadata: Metadata = {
  title: "Helios – Ein ruhiger Start",
  description:
    "Lokale Tagesplanung und Morgenroutine. Technische Grundlage E1.1.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
