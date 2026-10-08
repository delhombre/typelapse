// @vitest-environment jsdom
import type { ClientSession } from "@/application/auth/client-auth.port";
import {
	ApiKeyFailure,
	type ApiKeyPort,
	type ApiKeySummary,
	type CreatedApiKey,
	type NewApiKey,
} from "@/domain/ports/api-key.port";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { feedback } from "@/presentation/haptics";
import { createApiKeyStore } from "@/presentation/stores/api-key.store";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The studio's sound and touch cues: replaced, so the test hears intents, not speakers.
vi.mock("@/presentation/haptics", () => ({ feedback: vi.fn() }));

const NOW = new Date("2026-10-05T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-10-06T12:00:00.000Z"),
};
const NEW_KEY = `tlk_5e6f7a8b_${"0123456789abcdef".repeat(4)}`;

function summary(overrides: Partial<ApiKeySummary> & { prefix: string }): ApiKeySummary {
	return {
		name: "GitHub Action",
		createdAt: new Date(NOW.getTime() - 9 * DAY_MS),
		expiresAt: null,
		lastUsedAt: null,
		...overrides,
	};
}

const GITHUB = summary({
	prefix: "tlk_836ac582",
	lastUsedAt: new Date(NOW.getTime() - 3 * 60_000),
});
const STAGING = summary({
	prefix: "tlk_11112222",
	name: "Staging",
	expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
});
const OLD = summary({
	prefix: "tlk_33334444",
	name: "Old laptop",
	expiresAt: new Date(NOW.getTime() - DAY_MS),
});

function port(keys: readonly ApiKeySummary[], overrides: Partial<ApiKeyPort> = {}) {
	const create = vi.fn(
		async (input: NewApiKey): Promise<CreatedApiKey> => ({
			created: summary({ prefix: "tlk_5e6f7a8b", name: input.name, createdAt: NOW }),
			key: NEW_KEY,
		}),
	);
	const revoke = vi.fn(async (_prefix: string) => undefined);
	return {
		create,
		revoke,
		list: async () => keys,
		...overrides,
	} satisfies ApiKeyPort;
}

function signedIn() {
	const store = createAuthStore({ kind: "local-offline" });
	store.setState({
		status: { kind: "authenticated", session: SESSION },
		operation: "idle",
		canSync: true,
		error: null,
	});
	return store;
}

function renderControl(keyPort: ApiKeyPort, options: { withKeys?: boolean } = {}) {
	const apiKeyStore = createApiKeyStore({ port: keyPort });
	const view = render(
		<StudioAccountControl
			store={signedIn()}
			{...(options.withKeys === false ? {} : { apiKeys: { store: apiKeyStore, now: () => NOW } })}
		/>,
	);
	return { ...view, apiKeyStore };
}

async function openKeys() {
	fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
	fireEvent.click(screen.getByRole("button", { name: "API keys" }));
	await screen.findByRole("heading", { name: "API keys" });
}

const writeText = vi.fn(async (_text: string) => undefined);

beforeEach(() => {
	writeText.mockClear();
	vi.mocked(feedback).mockClear();
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("API keys in the account island", () => {
	it("are offered to a signed-in account and to nobody else", async () => {
		const signedOut = createAuthStore(
			{
				kind: "hosted",
				port: {
					sendSignInCode: async () => undefined,
					signInWithCode: async () => undefined,
					signOut: async () => undefined,
					getSession: async () => null,
				},
			},
			{ now: () => NOW },
		);
		const keyStore = createApiKeyStore({ port: port([]) });
		const { unmount } = render(
			<StudioAccountControl store={signedOut} apiKeys={{ store: keyStore }} />,
		);
		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		expect(screen.queryByRole("button", { name: "API keys" })).toBeNull();
		unmount();

		renderControl(port([]), { withKeys: false });
		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
		expect(screen.queryByRole("button", { name: "API keys" })).toBeNull();
	});

	it("list each key by name, prefix and last use, with its expiry when it has one", async () => {
		renderControl(port([GITHUB, STAGING, OLD]));

		await openKeys();

		const rows = await screen.findAllByRole("listitem");
		expect(rows).toHaveLength(3);
		expect(within(rows[0] as HTMLElement).getByText("GitHub Action")).toBeTruthy();
		expect(within(rows[0] as HTMLElement).getByText("tlk_836ac582")).toBeTruthy();
		expect(within(rows[0] as HTMLElement).getByText("Used 3 min ago")).toBeTruthy();
		expect(within(rows[0] as HTMLElement).queryByText(/Expires|Expired/)).toBeNull();
		expect(within(rows[1] as HTMLElement).getByText("Never used")).toBeTruthy();
		expect(within(rows[1] as HTMLElement).getByText(/^Expires Nov [45]$/)).toBeTruthy();
		expect(within(rows[2] as HTMLElement).getByText("Expired")).toBeTruthy();
	});

	it("say so when there are none, and when they cannot be read", async () => {
		const empty = renderControl(port([]));
		await openKeys();
		expect(await screen.findByText("No keys yet. Create one above.")).toBeTruthy();
		empty.unmount();

		const list = vi
			.fn<ApiKeyPort["list"]>()
			.mockRejectedValueOnce(
				new ApiKeyFailure("unavailable", "API keys are not available right now."),
			)
			.mockResolvedValueOnce([GITHUB]);
		renderControl(port([], { list }));
		await openKeys();
		expect((await screen.findByRole("alert")).textContent).toBe(
			"API keys are not available right now.",
		);

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("GitHub Action")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keep the list in view and offer another try when a refresh fails over it", async () => {
		const list = vi
			.fn<ApiKeyPort["list"]>()
			.mockResolvedValueOnce([GITHUB])
			.mockRejectedValueOnce(
				new ApiKeyFailure("unavailable", "API keys are not available right now."),
			)
			.mockResolvedValueOnce([GITHUB, STAGING]);
		renderControl(port([], { list }));
		await openKeys();
		await screen.findByText("GitHub Action");

		fireEvent.click(screen.getByRole("button", { name: "Back to account" }));
		fireEvent.click(screen.getByRole("button", { name: "API keys" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"API keys are not available right now.",
		);
		expect(screen.getByText("GitHub Action")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(await screen.findByText("Staging")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
	});

	it("take their name where it is typed, and refuse a blank one beside the field", async () => {
		const keyPort = port([]);
		renderControl(keyPort);
		await openKeys();
		const name = screen.getByLabelText("Name");

		fireEvent.click(screen.getByRole("button", { name: "Create key" }));

		expect(keyPort.create).not.toHaveBeenCalled();
		expect(name.getAttribute("aria-invalid")).toBe("true");
		expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
			"Name the key, for example GitHub Action.",
		);
		expect(document.activeElement).toBe(name);

		fireEvent.change(name, { target: { value: "CI" } });
		expect(name.getAttribute("aria-invalid")).toBeNull();
	});

	it("are made from a name and a lifetime, then shown once with a copy and a done", async () => {
		const keyPort = port([GITHUB]);
		renderControl(keyPort);
		await openKeys();
		await screen.findByText("GitHub Action");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Release bot  " } });
		fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));

		expect(await screen.findByRole("button", { name: "Copy key" })).toBeTruthy();
		expect(keyPort.create).toHaveBeenCalledWith({ name: "Release bot", expiresInDays: 30 });
		expect(screen.getByText(NEW_KEY)).toBeTruthy();
		expect(screen.getByText(/shown once/i)).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create key" })).toBeNull();
		// A keyboard user lands on the one thing to do next.
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Copy key" }));

		fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

		await waitFor(() => expect(writeText).toHaveBeenCalledWith(NEW_KEY));
		expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Done" }));

		expect(screen.queryByText(NEW_KEY)).toBeNull();
		expect(screen.getByRole("button", { name: "Create key" })).toBeTruthy();
		// The form is back where the key was, with its field ready for the next one.
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
		expect(screen.getByText("Release bot")).toBeTruthy();
		expect(document.body.textContent).not.toContain(NEW_KEY);
	});

	it("make a key that never expires unless a lifetime is chosen", async () => {
		const keyPort = port([]);
		renderControl(keyPort);
		await openKeys();

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.submit(screen.getByLabelText("Name").closest("form") as HTMLFormElement);

		await screen.findByRole("button", { name: "Copy key" });
		expect(keyPort.create).toHaveBeenCalledWith({ name: "CI", expiresInDays: null });
	});

	it("keep the typed name and say why when a key cannot be made", async () => {
		const keyPort = port([], {
			create: async () => {
				throw new ApiKeyFailure(
					"key-limit",
					"You already have 10 API keys, so revoke one to create another",
				);
			},
		});
		renderControl(keyPort);
		await openKeys();

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"You already have 10 API keys, so revoke one to create another",
		);
		expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("CI");
		expect(screen.queryByRole("button", { name: "Copy key" })).toBeNull();
	});

	it("select the key for the person when the clipboard refuses", async () => {
		const keyPort = port([]);
		renderControl(keyPort);
		writeText.mockRejectedValueOnce(new Error("denied"));
		await openKeys();
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		fireEvent.click(await screen.findByRole("button", { name: "Copy key" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"Copy failed. The key is selected, so copy it by hand.",
		);
		expect(window.getSelection()?.toString()).toBe(NEW_KEY);
	});

	it("are held for the person who closes the panel before pressing Done", async () => {
		renderControl(port([]));
		await openKeys();
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		await screen.findByText(NEW_KEY);

		fireEvent.click(screen.getByRole("button", { name: "Close account panel" }));
		await waitFor(() => expect(screen.queryByText(NEW_KEY)).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

		// The key is still there to copy, in the view that holds it.
		expect(await screen.findByText(NEW_KEY)).toBeTruthy();
	});

	it("ask before they are revoked, and go from the list once they are", async () => {
		const keyPort = port([GITHUB, STAGING]);
		renderControl(keyPort);
		await openKeys();
		await screen.findByText("GitHub Action");

		fireEvent.click(screen.getByRole("button", { name: "Revoke GitHub Action" }));

		expect(
			screen.getByText("Revoke GitHub Action? Anything using it stops working at once."),
		).toBeTruthy();
		expect(keyPort.revoke).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.getByRole("button", { name: "Revoke GitHub Action" })).toBeTruthy();
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Revoke GitHub Action" }),
		);

		fireEvent.click(screen.getByRole("button", { name: "Revoke GitHub Action" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

		await waitFor(() => expect(keyPort.revoke).toHaveBeenCalledWith("tlk_836ac582"));
		await waitFor(() => expect(screen.queryByText("GitHub Action")).toBeNull());
		expect(screen.getByText("Staging")).toBeTruthy();
		expect(screen.getByRole("status").textContent).toBe("Revoked GitHub Action.");
		// The row that held focus is gone: focus goes to the view, not to nothing.
		expect(document.activeElement).toBe(screen.getByRole("heading", { name: "API keys" }));
	});

	it("stay in the list, with the reason, when the server cannot revoke them", async () => {
		const keyPort = port([GITHUB], {
			revoke: async () => {
				throw new ApiKeyFailure("unavailable", "API keys are not available right now.");
			},
		});
		renderControl(keyPort);
		await openKeys();
		await screen.findByText("GitHub Action");

		fireEvent.click(screen.getByRole("button", { name: "Revoke GitHub Action" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

		expect((await screen.findByRole("alert")).textContent).toBe(
			"API keys are not available right now.",
		);
		expect(screen.getByText("GitHub Action")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Revoke GitHub Action" })).toBeTruthy();
	});

	it("stop at ten, and say what to do instead of offering a form", async () => {
		const ten = Array.from({ length: 10 }, (_, index) =>
			summary({ prefix: `tlk_0000000${index}`, name: `Key ${index}` }),
		);
		renderControl(port(ten));
		await openKeys();

		await screen.findByText("Key 0");
		expect(
			screen.getByText(
				"You have 10 API keys, the most an account keeps. Revoke one to create another.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Create key" })).toBeNull();
	});

	it("start at the account again when the panel is opened anew, and keep the keys while it leaves", async () => {
		renderControl(port([GITHUB]));
		await openKeys();

		fireEvent.click(screen.getByRole("button", { name: "Close account panel" }));
		// While the panel fades out it still shows what it showed.
		expect(screen.getByRole("heading", { name: "API keys" })).toBeTruthy();
		await waitFor(() => expect(screen.queryByRole("heading", { name: "API keys" })).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

		expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "API keys" })).toBeNull();
	});

	it("lead back to the account, where the person was", async () => {
		renderControl(port([]));
		await openKeys();

		fireEvent.click(screen.getByRole("button", { name: "Back to account" }));

		expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
		expect(screen.queryByRole("heading", { name: "API keys" })).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "API keys" }));
	});

	it("are forgotten, and so is a key on screen, when the account signs out", async () => {
		const authStore = signedIn();
		const apiKeyStore = createApiKeyStore({ port: port([GITHUB]) });
		render(
			<StudioAccountControl store={authStore} apiKeys={{ store: apiKeyStore, now: () => NOW }} />,
		);
		await openKeys();
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		await screen.findByText(NEW_KEY);

		act(() => {
			authStore.setState({ status: { kind: "anonymous" }, canSync: false });
		});

		expect(apiKeyStore.getState()).toMatchObject({ keys: null, created: null, status: "idle" });
		expect(document.body.textContent).not.toContain(NEW_KEY);
	});

	it("say aloud that the key was copied, not only on the button", async () => {
		renderControl(port([]));
		await openKeys();
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		fireEvent.click(await screen.findByRole("button", { name: "Copy key" }));

		await waitFor(() =>
			expect(screen.getAllByRole("status").some((node) => node.textContent === "Key copied")).toBe(
				true,
			),
		);
	});

	it("drop the key on screen when it is revoked from the list before it is copied", async () => {
		const keyPort = port([GITHUB]);
		renderControl(keyPort);
		await openKeys();
		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Release bot" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		await screen.findByText(NEW_KEY);

		fireEvent.click(screen.getByRole("button", { name: "Revoke Release bot" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

		await waitFor(() => expect(screen.queryByText(NEW_KEY)).toBeNull());
		expect(keyPort.revoke).toHaveBeenCalledWith("tlk_5e6f7a8b");
		expect(screen.getByRole("button", { name: "Create key" })).toBeTruthy();
	});

	it("tell the person by sound and touch what happened, and only then", async () => {
		const keyPort = port([GITHUB]);
		renderControl(keyPort);
		await openKeys();
		await screen.findByText("GitHub Action");
		expect(feedback).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		fireEvent.click(await screen.findByRole("button", { name: "Copy key" }));
		await screen.findByRole("button", { name: "Copied" });
		fireEvent.click(screen.getByRole("button", { name: "Done" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke GitHub Action" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));
		await waitFor(() => expect(keyPort.revoke).toHaveBeenCalled());

		await waitFor(() =>
			expect(vi.mocked(feedback).mock.calls.map(([intent]) => intent)).toEqual([
				"commit",
				"success",
				"commit",
			]),
		);
	});

	it("say a refusal with the error cue", async () => {
		const keyPort = port([GITHUB], {
			create: async () => {
				throw new ApiKeyFailure("unavailable", "API keys are not available right now.");
			},
			revoke: async () => {
				throw new ApiKeyFailure("unavailable", "API keys are not available right now.");
			},
		});
		renderControl(keyPort);
		await openKeys();
		await screen.findByText("GitHub Action");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "CI" } });
		fireEvent.click(screen.getByRole("button", { name: "Create key" }));
		await waitFor(() => expect(feedback).toHaveBeenCalledWith("error"));
		fireEvent.click(screen.getByRole("button", { name: "Revoke GitHub Action" }));
		fireEvent.click(screen.getByRole("button", { name: "Revoke key" }));

		await waitFor(() => expect(vi.mocked(feedback)).toHaveBeenCalledTimes(2));
		expect(vi.mocked(feedback).mock.calls.map(([intent]) => intent)).toEqual(["error", "error"]);
	});

	it("fade only the edge of a long list that has more to scroll", async () => {
		const ten = Array.from({ length: 8 }, (_, index) =>
			summary({ prefix: `tlk_0000000${index}`, name: `Key ${index}` }),
		);
		renderControl(port(ten));
		await openKeys();
		const list = (await screen.findByRole("list", { name: "Your API keys" })) as HTMLElement;
		const scrollTo = (top: number) => {
			Object.defineProperty(list, "clientHeight", { value: 100, configurable: true });
			Object.defineProperty(list, "scrollHeight", { value: 300, configurable: true });
			Object.defineProperty(list, "scrollTop", { value: top, configurable: true });
			fireEvent.scroll(list);
		};

		scrollTo(0);
		expect([list.dataset.moreAbove, list.dataset.moreBelow]).toEqual(["false", "true"]);
		scrollTo(100);
		expect([list.dataset.moreAbove, list.dataset.moreBelow]).toEqual(["true", "true"]);
		scrollTo(200);
		expect([list.dataset.moreAbove, list.dataset.moreBelow]).toEqual(["true", "false"]);
	});
});
