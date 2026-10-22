import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocOps · Gestión documental de operarios",
  description: "Control de vigencia de documentos de operarios con lectura automática por IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
