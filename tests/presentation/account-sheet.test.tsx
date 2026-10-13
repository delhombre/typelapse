// @vitest-environment jsdom
import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
import type { ApiKeyPort } from "@/domain/ports/api-key.port";
import { StudioUtilities } from "@/presentation/components/layout/studio-utilities";
import type { StudioBillingControl } from "@/presentation/components/multimedia/account-plan";
import {
	StudioAccountControl,
	openingSection,
} from "@/presentation/components/multimedia/studio-account-control";
import { createApiKeyStore } from "@/presentation/stores/api-key.store";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-10-14T12:00:00.000Z"),
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function hostedPort(overrides: Partial<ClientAuthPort> = {}): ClientAuthPort {
	return {
		sendSignInCode: async () => undefined,
		signInWithCode: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => SESSION,
		...overrides,
	};
}

function keyPort(): ApiKeyPort {
	return {
		list: async () => [],
		create: async () => ({
			key: "tlk_live_secret",
			created: {
				name: "CI",
				prefix: "tlk_live",
				createdAt: NOW,
				lastUsedAt: null,
				expiresAt: null,
			},
		}),
		revoke: async () => undefined,
	};
}

function billing(overrides: Partial<StudioBillingControl> = {}): StudioBillingControl {
	return {
		planLabel: "Free",
		paid: false,
		available: true,
		catalog: { creator: { monthly: { currency: "USD", unitAmount: 1200 } } },
		cadence: "monthly",
		busy: false,
		error: null,
		onCadence: vi.fn(),
		onUpgrade: vi.fn(),
		onManageBilling: vi.fn(),
		...overrides,
	};
}

/** A hosted account with its session found, the trigger ready. */
async function signedIn(
	props: { billing?: StudioBillingControl; port?: Partial<ClientAuthPort> } = {},
) {
	const store = createAuthStore(
		{ kind: "hosted", port: hostedPort(props.port) },
		{ now: () => NOW },
	);
	const apiKeyStore = createApiKeyStore({ port: keyPort() });
	render(
		<StudioAccountControl
			store={store}
			apiKeys={{ store: apiKeyStore, now: () => NOW }}
			allowance="You are using 0 of 3 cloud projects."
			{...(props.billing ? { billing: props.billing } : {})}
		/>,
	);
	const trigger = await screen.findByRole("button", { name: "Account for Ada Lovelace" });
	return { store, apiKeyStore, trigger };
}

const sheet = () => screen.getByRole("dialog", { name: "Typelapse account" });
const selectedTab = () =>
	within(sheet())
		.getAllByRole("tab")
		.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent;

describe("the account sheet", () => {
	it("opens from the signed-in trigger: the person, then Projects, Plan and API keys", async () => {
		const { trigger } = await signedIn({ billing: billing() });
		expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");

		fireEvent.click(trigger);

		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(within(sheet()).getByRole("heading", { name: "Ada Lovelace" })).toBeTruthy();
		expect(within(sheet()).getByText("ada@example.com")).toBeTruthy();
		expect(
			within(sheet())
				.getAllByRole("tab")
				.map((tab) => tab.textContent),
		).toEqual(["Projects", "Plan", "API keys"]);
		expect(selectedTab()).toBe("Projects");
		expect(
			within(sheet()).getByText("Save privately to Typelapse Cloud", { exact: false }),
		).toBeTruthy();
	});

	it("puts the plan's meter, its upgrade and the pricing link in Plan", async () => {
		const { trigger } = await signedIn({ billing: billing() });
		fireEvent.click(trigger);

		fireEvent.click(within(sheet()).getByRole("tab", { name: "Plan" }));

		const panel = within(sheet()).getByRole("tabpanel");
		expect(within(panel).getByText("Current plan")).toBeTruthy();
		expect(within(panel).getByRole("button", { name: "Upgrade to Creator" })).toBeTruthy();
		expect(within(panel).getByRole("link", { name: "Plans and pricing" })).toBeTruthy();
	});

	it("keeps Sign out in the foot, outside every tab, whichever tab is chosen", async () => {
		const { trigger } = await signedIn({ billing: billing() });
		fireEvent.click(trigger);

		for (const name of ["Projects", "Plan", "API keys"]) {
			fireEvent.click(within(sheet()).getByRole("tab", { name }));
			const signOut = within(sheet()).getByRole("button", { name: "Sign out" });
			expect(signOut.closest('[role="tabpanel"]')).toBeNull();
			expect(signOut.closest("footer")).toBeTruthy();
		}
	});

	it("opens on Plan when billing is not in order, so the notice is never behind a tab", async () => {
		const sentence =
			"Your last payment failed and Creator is paused; update your card in Manage billing.";
		const { trigger } = await signedIn({
			billing: billing({ notice: { kind: "past-due", sentence } }),
		});

		fireEvent.click(trigger);

		expect(selectedTab()).toBe("Plan");
		expect(within(sheet()).getByRole("status").textContent).toBe(sentence);
	});

	it("opens on API keys while a key made a moment ago waits to be copied", async () => {
		const { trigger, apiKeyStore } = await signedIn();
		await act(() => apiKeyStore.getState().create({ name: "CI", expiresInDays: null }));

		fireEvent.click(trigger);

		expect(selectedTab()).toBe("API keys");
		expect(within(sheet()).getByText("tlk_live_secret")).toBeTruthy();
	});

	it("closes on Escape and gives focus back to its trigger once it has slid out", async () => {
		const { trigger } = await signedIn();
		fireEvent.click(trigger);
		const tab = within(sheet()).getByRole("tab", { name: "Projects" });
		tab.focus();

		fireEvent.keyDown(tab, { key: "Escape" });

		await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
	});

	it("signs out from its foot, closes, and gives focus to the Sign in that replaces the account", async () => {
		const signOut = vi.fn(async () => undefined);
		const { trigger } = await signedIn({ port: { signOut } });
		fireEvent.click(trigger);

		fireEvent.click(within(sheet()).getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
		await waitFor(() => expect(screen.queryByRole("tab")).toBeNull());
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sign in" })),
		);
	});
});

describe("the sign-in panel beside the sheet", () => {
	it("is named for signing in, and leaves the sheet the only account dialog once signed in", async () => {
		let session: ClientSession | null = null;
		const store = createAuthStore(
			{
				kind: "hosted",
				port: hostedPort({
					getSession: async () => session,
					signInWithCode: async () => {
						session = SESSION;
					},
				}),
			},
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);
		fireEvent.click(await screen.findByRole("button", { name: "Sign in" }));
		const panel = screen.getByRole("dialog", { name: "Sign in to Typelapse" });
		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.click(within(panel).getByRole("button", { name: "Email me a code" }));
		fireEvent.change(await within(panel).findByRole("textbox", { name: "Code" }), {
			target: { value: "042917" },
		});

		const trigger = await screen.findByRole("button", { name: "Account for Ada Lovelace" });
		// Leaving, the panel keeps what it showed instead of collapsing to nothing.
		const leaving = screen.queryByRole("dialog", { name: "Sign in to Typelapse" });
		if (leaving) expect(within(leaving).getByText("Check your email.")).toBeTruthy();
		fireEvent.click(trigger);

		expect(screen.getAllByRole("dialog", { name: "Typelapse account" })).toHaveLength(1);
	});
});

describe("openingSection", () => {
	it("is API keys for a key to copy, then Plan for a billing notice, else Projects", () => {
		expect(openingSection({ keyWaiting: true, billingNotice: true })).toBe("keys");
		expect(openingSection({ keyWaiting: false, billingNotice: true })).toBe("plan");
		expect(openingSection({ keyWaiting: false, billingNotice: false })).toBe("projects");
	});
});

describe("a More menu row that opens a sheet", () => {
	it("closes the menu when it is pressed, as the resources' rows do", () => {
		const row = (
			<button type="button" data-dismiss-menu="">
				Open a sheet
			</button>
		);
		render(
			<MemoryRouter>
				<StudioUtilities compact leading={row} />
			</MemoryRouter>,
		);
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));

		fireEvent.click(screen.getByRole("button", { name: "Open a sheet" }));

		expect(screen.getByRole("button", { name: "More actions" }).getAttribute("aria-expanded")).toBe(
			"false",
		);
	});
});
