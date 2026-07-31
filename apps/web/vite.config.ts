import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          changeOrigin: false,
          target: environment.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3000",
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
    },
  };
});
