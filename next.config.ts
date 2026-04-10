import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Workaround: Turbopack misparses certain key formats in .env.local.
// Read the file ourselves and inject missing vars directly.
function loadEnvFallbacks() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFallbacks();

const nextConfig: NextConfig = {
  // pdf-parse and mammoth require native bindings that can't be bundled by Turbopack.
  serverExternalPackages: ["pdf-parse", "mammoth"],
};

export default nextConfig;
