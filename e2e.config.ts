import { google } from "@ai-sdk/google";
import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

// The key comes from the shell (GOOGLE_GENERATIVE_AI_API_KEY), never from a
// file. Recorded agent.act steps replay without a model; only a first run and
// the judgments (agent.assert, agent.waitFor, agent.extract) call it.
export default {
	agents: {
		default: {
			model: google("gemini-flash-latest"),
			system: "You are a thorough QA agent. Verify every outcome.",
		},
	},
	targets: [
		{
			engine: web(),
			app: {
				url: process.env.APP_URL ?? "http://localhost:5173",
				// Without APP_URL the runner starts the Vite dev server itself.
				command: process.env.APP_URL ? undefined : { executable: "pnpm", args: ["dev"] },
			},
		},
	],
} satisfies E2EConfig;
