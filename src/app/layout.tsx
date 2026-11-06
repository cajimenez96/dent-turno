import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Turnos", template: "%s · Turnos" },
  description: "Agenda, pacientes, trabajos y cobros del consultorio.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="font-primary min-h-dvh bg-canvas text-ink">{children}</body>
    </html>
  );
}
