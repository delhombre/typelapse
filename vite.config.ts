import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			// Lapse patches the clock APIs, which has to happen before Motion caches
			// them, so the entry imports it statically and a DEV check cannot wrap
			// it. Swapping the module at build time keeps those patches out of
			// production entirely. See src/dev/lapse-noop.ts.
			...(command === "build"
				? { "@aiforui/lapse/install": resolve(__dirname, "./src/dev/lapse-noop.ts") }
				: {}),
		},
	},
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
			},
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
		include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
	},
}));
