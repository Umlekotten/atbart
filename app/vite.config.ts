import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    fs: {
      // Tillåt hela repot (relativt app-roten) så att ../data/recipe-schema.ts kan serveras i dev-läge.
      allow: [".."],
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
