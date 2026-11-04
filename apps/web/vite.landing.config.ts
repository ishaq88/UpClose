import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url));

function appOrigin(raw: string | undefined, allowLocal: boolean): string {
  if (!raw)
    throw new Error(
      "Landing build requires explicit VITE_APP_ORIGIN (the HTTPS product origin).",
    );
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("VITE_APP_ORIGIN must be an absolute origin URL.");
  }
  const loopback = ["localhost", "app.localhost", "127.0.0.1", "[::1]"].includes(
    parsed.hostname,
  );
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !(
      parsed.protocol === "https:" ||
      (allowLocal && parsed.protocol === "http:" && loopback)
    )
  ) {
    throw new Error(
      "VITE_APP_ORIGIN must be HTTPS with no credentials, path, query or fragment. HTTP loopback needs explicit LANDING_ALLOW_LOCAL_APP=true for builds.",
    );
  }
  return parsed.origin;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, webRoot, [
    "VITE_APP_ORIGIN",
    "LANDING_ALLOW_LOCAL_APP",
  ]);
  const development = command === "serve";
  const raw =
    process.env.VITE_APP_ORIGIN ??
    env.VITE_APP_ORIGIN ??
    (development ? "http://localhost:5173" : undefined);
  const allowLocal =
    development ||
    (process.env.LANDING_ALLOW_LOCAL_APP ?? env.LANDING_ALLOW_LOCAL_APP) ===
      "true";
  const origin = appOrigin(raw, allowLocal);
  return {
    root: fileURLToPath(new URL("./marketing", import.meta.url)),
    envDir: webRoot,
    plugins: [react(), tailwindcss()],
    define: { "import.meta.env.VITE_APP_ORIGIN": JSON.stringify(origin) },
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
    preview: { host: "127.0.0.1", port: 5180, strictPort: true },
    build: { outDir: "../dist-landing", emptyOutDir: true },
  };
});
