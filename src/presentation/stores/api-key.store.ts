import {
	ApiKeyFailure,
	type ApiKeyPort,
	type ApiKeySummary,
	type CreatedApiKey,
	type NewApiKey,
} from "@/domain/ports/api-key.port";
import { ApiKeyHttpAdapter } from "@/infrastructure/auth/api-key-http.adapter";
import { create } from "zustand";

export type ApiKeyListStatus = "idle" | "loading" | "ready" | "error";

export interface ApiKeyState {
	/** Null until the first answer; never a guess. */
	keys: readonly ApiKeySummary[] | null;
	status: ApiKeyListStatus;
	/** The server's own sentence for the last refusal, shown as written. */
	error: string | null;
	creating: boolean;
	/**
	 * The key just made, with the only copy of its secret. It lives here until it
	 * is dismissed or the store is reset (sign-out, the keys view closing), never
	 * in storage, so a reload loses it.
	 */
	created: CreatedApiKey | null;
	/** The prefix being revoked, while its request is open. */
	revoking: string | null;
	load(): Promise<void>;
	/** True when a key was made; false for a refusal (see `error`) or a create already open. */
	create(input: NewApiKey): Promise<boolean>;
	dismissCreated(): void;
	/** True when the key is gone from the list; false when the server refused (see `error`). */
	revoke(prefix: string): Promise<boolean>;
	reset(): void;
}

export interface ApiKeyStoreOptions {
	readonly port?: ApiKeyPort;
}

const INITIAL = {
	keys: null,
	status: "idle",
	error: null,
	creating: false,
	created: null,
	revoking: null,
} as const;

function sentenceOf(error: unknown): string {
	return error instanceof ApiKeyFailure ? error.message : "API keys are not available right now.";
}

export function createApiKeyStore({ port = new ApiKeyHttpAdapter() }: ApiKeyStoreOptions = {}) {
	// An answer that comes back after a reset belongs to someone who has left.
	let epoch = 0;
	return create<ApiKeyState>((set, get) => ({
		...INITIAL,

		load: async () => {
			const started = epoch;
			set({ status: "loading", error: null });
			try {
				const keys = await port.list();
				if (started === epoch) set({ keys, status: "ready" });
			} catch (error) {
				if (started === epoch) set({ status: "error", error: sentenceOf(error) });
			}
		},

		create: async (input) => {
			if (get().creating) return false;
			const started = epoch;
			set({ creating: true, error: null });
			try {
				const made = await port.create(input);
				if (started !== epoch) return false;
				set({ creating: false, created: made, keys: [made.created, ...(get().keys ?? [])] });
				return true;
			} catch (error) {
				if (started === epoch) set({ creating: false, error: sentenceOf(error) });
				return false;
			}
		},

		dismissCreated: () => set({ created: null }),

		revoke: async (prefix) => {
			const started = epoch;
			set({ revoking: prefix, error: null });
			try {
				await port.revoke(prefix);
				if (started !== epoch) return false;
				set({
					revoking: null,
					keys: (get().keys ?? []).filter((key) => key.prefix !== prefix),
					// A key revoked while its secret is still on screen has nothing left to copy.
					created: get().created?.created.prefix === prefix ? null : get().created,
				});
				return true;
			} catch (error) {
				if (started === epoch) set({ revoking: null, error: sentenceOf(error) });
				return false;
			}
		},

		reset: () => {
			epoch += 1;
			set({ ...INITIAL });
		},
	}));
}

export const useApiKeyStore = createApiKeyStore();
