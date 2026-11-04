import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Turnos", template: "%s · Turnos" },
  description: "Agenda, pacientes, trabajos y cobros del consultorio.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#08090a", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="font-linear min-h-dvh bg-linear-void text-linear-bone">{children}</body>
    </html>
  );
}
