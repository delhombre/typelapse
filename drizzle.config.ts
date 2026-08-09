import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs this config in its own process, which loads no .env of its
// own, so the documented "cp .env.example .env" setup would otherwise hand it
// an empty connection string.
if (existsSync(".env")) {
	process.loadEnvFile(".env");
}

export default defineConfig({
	schema: "./server/db/schema.ts",
	out: "./server/db/migrations",
	dialect: "postgresql",
	dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
