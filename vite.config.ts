import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { absoluteOgImage } from "./vite-plugin-absolute-og";
import { lapse } from "./vite-plugin-lapse";
import { studioPreload } from "./vite-plugin-studio-preload";

export default defineConfig({
	// `lapse` is a no-op unless @aiforui/lapse is installed locally, and it never
	// applies to a build. See vite-plugin-lapse.ts.
	plugins: [react(), tailwindcss(), lapse(), absoluteOgImage(), studioPreload()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	server: {
		proxy: {
			"/api": {
				// Several dev servers can run side by side, each against its own API
				// process, when the port is not hardcoded.
				target: process.env.TYPELAPSE_API_URL ?? "http://localhost:3001",
				changeOrigin: true,
			},
			// Public render pages are the API's own documents (server/routes/render-page.ts).
			"^/v/": {
				target: process.env.TYPELAPSE_API_URL ?? "http://localhost:3001",
				changeOrigin: true,
			},
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
		setupFiles: ["./tests/setup.ts"],
		// Migrates the contract-test database once, before any worker starts.
		globalSetup: ["./tests/global-setup.ts"],
	},
});
