// @vitest-environment jsdom
import {
	ClientAuthFailure,
	type ClientAuthPort,
	type ClientSession,
	type EmailCredentials,
} from "@/application/auth/client-auth.port";
import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

	it("hands focus back to its trigger when Escape or the close button shuts the panel", () => {
		const store = createAuthStore({ kind: "local-offline" });
		render(<StudioAccountControl store={store} />);
		const trigger = screen.getByRole("button", { name: "On this device" });

		fireEvent.click(trigger);
		screen.getByRole("button", { name: "Close account panel" }).focus();
		fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
		expect(document.activeElement).toBe(trigger);

		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole("button", { name: "Close account panel" }));
		expect(document.activeElement).toBe(trigger);
	});

	it("leaves focus alone when a session is already there at page load", async () => {
		const store = createAuthStore(
			{ kind: "hosted", port: port({ getSession: async () => SESSION }) },
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Account for Ada Lovelace" })).toBeTruthy(),
		);
		expect(document.activeElement).toBe(document.body);
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
		const panel = screen.getByRole("dialog", { name: "Typelapse account" });
		fireEvent.click(within(panel).getByRole("button", { name: "Sign in" }));

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Account for Ada Lovelace" })).toBeTruthy(),
		);
		expect(signInEmail.mock.calls[0]?.[0]).toEqual({
			email: "ada@example.com",
			password: "correct horse battery staple",
		});
		expect(screen.queryByRole("alert")).toBeNull();
		// The panel closed under the Sign in button that had focus.
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Account for Ada Lovelace" }),
		);
	});

	it("checks the sign-up form on submit, beside each field, and clears a fixed field as it is typed", async () => {
		const signUpEmail = vi.fn(async (_input: { name: string } & EmailCredentials) => undefined);
		const store = createAuthStore(
			{ kind: "hosted", port: port({ signUpEmail }) },
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);

		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		const panel = screen.getByRole("dialog", { name: "Typelapse account" });
		fireEvent.click(within(panel).getByRole("button", { name: "New here? Create an account" }));
		const email = within(panel).getByRole("textbox", { name: "Email" });
		fireEvent.change(email, { target: { value: "ada@" } });
		// Typing a first attempt is never flagged.
		expect(email.getAttribute("aria-invalid")).toBeNull();

		fireEvent.click(within(panel).getByRole("button", { name: "Create account" }));

		expect(signUpEmail).not.toHaveBeenCalled();
		expect(email.getAttribute("aria-invalid")).toBe("true");
		expect(within(panel).getByText("Enter an email address like ada@example.com.")).toBeTruthy();
		expect(within(panel).getByText("Add your name.")).toBeTruthy();
		expect(within(panel).getByText("Use at least 8 characters.")).toBeTruthy();
		// The message is the field's description, so a screen reader hears it with the field.
		const described = email.getAttribute("aria-describedby") ?? "";
		expect(document.getElementById(described)?.textContent).toBe(
			"Enter an email address like ada@example.com.",
		);

		fireEvent.change(email, { target: { value: "ada@example.com" } });
		expect(email.getAttribute("aria-invalid")).toBeNull();
		expect(within(panel).queryByText("Enter an email address like ada@example.com.")).toBeNull();
	});

	// A button that goes `disabled` under a focused finger or key drops focus to the page:
	// the next Tab starts from the top of the document, and a screen reader says nothing.
	// Busy is `aria-disabled`, the press is ignored, and focus stays where it was.
	it("keeps focus on its button while a sign-in is out, and ignores a second press", async () => {
		let refuse: (reason: Error) => void = () => undefined;
		const signInEmail = vi.fn(
			(_input: EmailCredentials) =>
				new Promise<void>((_resolve, reject) => {
					refuse = reject;
				}),
		);
		const store = createAuthStore(
			{ kind: "hosted", port: port({ signInEmail }) },
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);

		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		const panel = screen.getByRole("dialog", { name: "Typelapse account" });
		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.change(within(panel).getByLabelText("Password"), {
			target: { value: "correct horse battery staple" },
		});
		const submit = within(panel).getByRole("button", { name: "Sign in" });
		submit.focus();
		fireEvent.click(submit);

		await waitFor(() => expect(submit.textContent).toBe("Signing in…"));
		expect(submit.hasAttribute("disabled")).toBe(false);
		expect(submit.getAttribute("aria-disabled")).toBe("true");
		// A screen reader hears that the form is working, not only that a label changed.
		expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("true");
		expect(document.activeElement).toBe(submit);
		fireEvent.click(submit);
		expect(signInEmail).toHaveBeenCalledTimes(1);

		refuse(new ClientAuthFailure("invalid-credentials"));
		await waitFor(() => expect(within(panel).getByRole("alert")).toBeTruthy());
		expect(submit.getAttribute("aria-disabled")).toBeNull();
		expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("false");
		expect(document.activeElement).toBe(submit);
	});

	// The alert used to land between the password and the button and push the button, the
	// thing being pressed, 43px down. Its room is a slot that is there before the alert is,
	// under the button, so the form above it never moves.
	it("puts a refusal in a slot under the button that was there before it", async () => {
		const signInEmail = vi.fn(async (_input: EmailCredentials) => {
			throw new ClientAuthFailure("rate-limited", { retryAfterSeconds: 45 });
		});
		const store = createAuthStore(
			{ kind: "hosted", port: port({ signInEmail }) },
			{ now: () => NOW },
		);
		render(<StudioAccountControl store={store} />);

		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		const panel = screen.getByRole("dialog", { name: "Typelapse account" });
		const submit = within(panel).getByRole("button", { name: "Sign in" });
		const slot = submit.nextElementSibling;
		expect(slot?.classList.contains("mm-account-alert")).toBe(true);
		expect(slot?.textContent).toBe("");
		expect(within(panel).queryByRole("alert")).toBeNull();

		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.change(within(panel).getByLabelText("Password"), {
			target: { value: "correct horse battery staple" },
		});
		fireEvent.click(submit);

		const alert = await within(panel).findByRole("alert");
		expect(alert.textContent).toBe("Too many attempts. Try again in 45 seconds.");
		expect(alert.parentElement).toBe(slot);
		expect(submit.nextElementSibling).toBe(slot);
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

	describe("billing that is not in order", () => {
		const signedIn = () => {
			const store = createAuthStore({ kind: "local-offline" });
			store.setState({
				status: { kind: "authenticated", session: SESSION },
				operation: "idle",
				canSync: true,
				error: null,
			});
			return store;
		};
		const catalog: BillingCatalog = {
			creator: {
				monthly: { currency: "USD", unitAmount: 1200 },
				annual: { currency: "USD", unitAmount: 9900 },
			},
		};
		const billing = (notice: BillingNotice, handlers: { onManageBilling?: () => void } = {}) => ({
			planLabel: "Free",
			paid: false,
			available: true,
			catalog,
			cadence: "monthly" as const,
			busy: false,
			error: null,
			notice,
			onCadence: vi.fn(),
			onUpgrade: vi.fn(),
			onManageBilling: handlers.onManageBilling ?? vi.fn(),
		});

		it("tells a past due account why Creator is paused and offers the portal, not a second checkout", () => {
			const onManageBilling = vi.fn();
			const sentence =
				"Your last payment failed and Creator is paused; update your card in Manage billing.";
			render(
				<StudioAccountControl
					store={signedIn()}
					billing={billing({ kind: "past-due", sentence }, { onManageBilling })}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

			expect(screen.getByRole("status").textContent).toBe(sentence);
			expect(screen.queryByRole("button", { name: "Upgrade to Creator" })).toBeNull();
			fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));
			expect(onManageBilling).toHaveBeenCalledOnce();
		});

		it("tells an account whose plan ended how long its renders stay, and still sells Creator", () => {
			const sentence =
				"Your Creator plan has ended; past renders stay downloadable until 5 November 2026.";
			render(
				<StudioAccountControl store={signedIn()} billing={billing({ kind: "ended", sentence })} />,
			);

			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

			expect(screen.getByRole("status").textContent).toBe(sentence);
			expect(screen.getByRole("button", { name: "Upgrade to Creator" })).toBeTruthy();
			expect(screen.queryByRole("button", { name: "Manage billing" })).toBeNull();
		});

		it("shows no status when billing is in order", () => {
			render(
				<StudioAccountControl
					store={signedIn()}
					billing={{ ...billing({ kind: "ended", sentence: "x" }), notice: null }}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

			expect(screen.queryByRole("status")).toBeNull();
		});
	});
});
