import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { buildDefine, buildInfo } from "./web/build-info.ts";

const info = buildInfo(process.env, new Date());

/** Writes build.json next to index.html, so the bundle says which commit it was built from. */
function buildJson(): Plugin {
  return {
    name: "build-json",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build.json",
        source: JSON.stringify(info) + "\n",
      });
    },
  };
}

export default defineConfig({
  root: "web",
  // The app is same-origin and needs no env files; .env* are off limits anyway.
  envDir: false,
  plugins: [react(), buildJson()],
  define: buildDefine(info),
  build: {
    outDir: "../pb_public",
    emptyOutDir: true,
  },
  server: {
    // Same origin in development as in prod: the browser only ever talks to Vite.
    proxy: {
      "/api": "http://127.0.0.1:8090",
    },
  },
});
