// @vitest-environment jsdom
import type {
	ClientAuthPort,
	ClientSession,
	EmailCredentials,
} from "@/application/auth/client-auth.port";
import type { BillingCadence, BillingCatalog } from "@/domain/ports/billing.port";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A fixed clock: the session below must stay live however long this test outlives it. */
const NOW = new Date("2026-09-01T12:00:00.000Z");

const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-09-02T12:00:00.000Z"),
};

function port(overrides: Partial<ClientAuthPort> = {}): ClientAuthPort {
	return {
		signUpEmail: async () => undefined,
		signInEmail: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("StudioAccountControl", () => {
	it("presents local mode as a first-class private workflow, not an auth failure", () => {
		const store = createAuthStore({ kind: "local-offline" });
		render(<StudioAccountControl store={store} />);

		fireEvent.click(screen.getByRole("button", { name: "On this device" }));

		expect(screen.getByRole("dialog", { name: "Local project" })).toBeTruthy();
		expect(screen.getByText(/No account required/i)).toBeTruthy();
		expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
	});

	it("boots hosted session state and signs in without a toast", async () => {
		let authenticated = false;
		const signInEmail = vi.fn(async (_input: EmailCredentials) => {
			authenticated = true;
		});
		const store = createAuthStore(
			{
				kind: "hosted",
				port: port({
					signInEmail,
					getSession: async () => (authenticated ? SESSION : null),
				}),
			},
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);

		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.change(screen.getByLabelText("Password"), {
			target: { value: "correct horse battery staple" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Account for Ada Lovelace" })).toBeTruthy(),
		);
		expect(signInEmail.mock.calls[0]?.[0]).toEqual({
			email: "ada@example.com",
			password: "correct horse battery staple",
		});
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("does not claim cloud sync before the authenticated user opts this project in", () => {
		const store = createAuthStore({ kind: "local-offline" });
		store.setState({
			status: { kind: "authenticated", session: SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
		render(<StudioAccountControl store={store} cloudProjectState="device" />);

		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

		expect(screen.getByText("On this device")).toBeTruthy();
		expect(screen.queryByText("Cloud sync on")).toBeNull();
	});

	it("shows the allowance sentence the server returned, even without a checkout", () => {
		const store = createAuthStore({ kind: "local-offline" });
		store.setState({
			status: { kind: "authenticated", session: SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const sentence = "You are using 1 of 3 cloud projects and 0 MB of 100 MB of media.";
		render(<StudioAccountControl store={store} allowance={sentence} />);

		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

		expect(screen.getByText(sentence)).toBeTruthy();
	});

	it("offers provider-backed monthly and annual Creator checkout inside the account island", () => {
		const store = createAuthStore({ kind: "local-offline" });
		store.setState({
			status: { kind: "authenticated", session: SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const catalog: BillingCatalog = {
			creator: {
				monthly: { currency: "EUR", unitAmount: 1200 },
				annual: { currency: "EUR", unitAmount: 12000 },
			},
		};
		const onCadence = vi.fn<(cadence: BillingCadence) => void>();
		const onUpgrade = vi.fn<() => void>();
		render(
			<StudioAccountControl
				store={store}
				billing={{
					planLabel: "Free",
					paid: false,
					available: true,
					catalog,
					cadence: "monthly",
					busy: false,
					error: null,
					onCadence,
					onUpgrade,
					onManageBilling: vi.fn(),
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
		expect(screen.getByText("€12 / month")).toBeTruthy();
		expect(screen.getByText("€120 / year")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Annual billing" }));
		expect(onCadence).toHaveBeenCalledWith("annual");
		fireEvent.click(screen.getByRole("button", { name: "Upgrade to Creator" }));
		expect(onUpgrade).toHaveBeenCalledOnce();
	});

	it("opens the billing portal for an authenticated Creator instead of selling twice", () => {
		const store = createAuthStore({ kind: "local-offline" });
		store.setState({
			status: { kind: "authenticated", session: SESSION },
			operation: "idle",
			canSync: true,
			error: null,
		});
		const onManageBilling = vi.fn();
		render(
			<StudioAccountControl
				store={store}
				billing={{
					planLabel: "Creator",
					paid: true,
					available: true,
					catalog: null,
					cadence: "monthly",
					busy: false,
					error: null,
					onCadence: vi.fn(),
					onUpgrade: vi.fn(),
					onManageBilling,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		expect(onManageBilling).toHaveBeenCalledOnce();
		expect(screen.queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
	});
});
