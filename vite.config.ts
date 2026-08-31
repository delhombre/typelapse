import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { lapse } from "./vite-plugin-lapse";

export default defineConfig({
	// `lapse` is a no-op unless @aiforui/lapse is installed locally, and it never
	// applies to a build. See vite-plugin-lapse.ts.
	plugins: [react(), tailwindcss(), lapse()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
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
		setupFiles: ["./tests/setup.ts"],
	},
});
