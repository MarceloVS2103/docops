import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite trae su propio binario WASM: no debe pasar por el bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Hay otro package-lock.json en una carpeta superior; fija la raíz al proyecto.
  outputFileTracingRoot: path.resolve(__dirname),
  // Las migraciones se leen del disco al arrancar; deben viajar en el bundle de Vercel.
  outputFileTracingIncludes: { "/**": ["./src/db/migrations/**"] },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
