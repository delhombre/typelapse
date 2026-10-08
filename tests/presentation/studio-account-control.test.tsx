// @vitest-environment jsdom
import {
	ClientAuthFailure,
	type ClientAuthPort,
	type ClientSession,
	type SignInCode,
} from "@/application/auth/client-auth.port";
import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** A fixed clock: the session below must stay live however long this test outlives it. */
const NOW = new Date("2026-09-01T12:00:00.000Z");

const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2026-09-02T12:00:00.000Z"),
};

function port(overrides: Partial<ClientAuthPort> = {}): ClientAuthPort {
	return {
		sendSignInCode: async () => undefined,
		signInWithCode: async () => undefined,
		signOut: async () => undefined,
		getSession: async () => null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
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

	/** A hosted store over the port, its session check settled, and the panel open on the address step. */
	async function openSignIn(overrides: Partial<ClientAuthPort> = {}, now = () => NOW) {
		const store = createAuthStore({ kind: "hosted", port: port(overrides) }, { now });
		render(<StudioAccountControl store={store} />);
		await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
		fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
		return { store, panel: screen.getByRole("dialog", { name: "Typelapse account" }) };
	}

	function askForCode(panel: HTMLElement, email = "ada@example.com") {
		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: email },
		});
		fireEvent.click(within(panel).getByRole("button", { name: "Email me a code" }));
	}

	it("signs in with the address, then the code typed back, and no password anywhere", async () => {
		let authenticated = false;
		const sendSignInCode = vi.fn(async (_email: string) => undefined);
		const signInWithCode = vi.fn(async (_input: SignInCode) => {
			authenticated = true;
		});
		const { panel } = await openSignIn({
			sendSignInCode,
			signInWithCode,
			getSession: async () => (authenticated ? SESSION : null),
		});
		expect(within(panel).queryByLabelText("Password")).toBeNull();
		expect(within(panel).queryByLabelText("Name")).toBeNull();

		askForCode(panel);

		const code = await within(panel).findByRole("textbox", { name: "Code" });
		expect(sendSignInCode).toHaveBeenCalledWith("ada@example.com", expect.anything());
		// The button that led here is gone: focus is on the field typed into next.
		expect(document.activeElement).toBe(code);
		expect(within(panel).getByText("ada@example.com")).toBeTruthy();
		expect(code.getAttribute("inputmode")).toBe("numeric");
		expect(code.getAttribute("autocomplete")).toBe("one-time-code");
		// The field reads out where the code went and how long it lasts.
		const hint = document.getElementById(code.getAttribute("aria-describedby") ?? "");
		expect(hint?.textContent).toBe(
			"Enter the six-digit code sent to ada@example.com. It expires in 10 minutes.",
		);

		// Six digits is the whole code: it goes without a press.
		fireEvent.change(code, { target: { value: "042917" } });

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Account for Ada Lovelace" })).toBeTruthy(),
		);
		expect(signInWithCode).toHaveBeenCalledOnce();
		expect(signInWithCode.mock.calls[0]?.[0]).toEqual({
			email: "ada@example.com",
			code: "042917",
		});
		expect(screen.queryByRole("alert")).toBeNull();
		// The panel closed under the field that had focus.
		expect(document.activeElement).toBe(
			screen.getByRole("button", { name: "Account for Ada Lovelace" }),
		);
	});

	it("reads a pasted code with spaces or words around it as its six digits", async () => {
		const signInWithCode = vi.fn(async (_input: SignInCode) => undefined);
		const { panel } = await openSignIn({ signInWithCode });
		askForCode(panel);
		const code = await within(panel).findByRole("textbox", { name: "Code" });

		fireEvent.change(code, { target: { value: "Code: 042 917" } });

		expect((code as HTMLInputElement).value).toBe("042917");
		await waitFor(() => expect(signInWithCode).toHaveBeenCalledOnce());
		expect(signInWithCode.mock.calls[0]?.[0]).toMatchObject({ code: "042917" });
	});

	it("says beside the field when Sign in is pressed before six digits are there", async () => {
		const signInWithCode = vi.fn(async (_input: SignInCode) => undefined);
		const { panel } = await openSignIn({ signInWithCode });
		askForCode(panel);
		const code = await within(panel).findByRole("textbox", { name: "Code" });

		fireEvent.change(code, { target: { value: "0429" } });
		fireEvent.click(within(panel).getByRole("button", { name: "Sign in" }));

		expect(signInWithCode).not.toHaveBeenCalled();
		expect(code.getAttribute("aria-invalid")).toBe("true");
		expect(within(panel).getByText("Enter the six digits from the email.")).toBeTruthy();
	});

	it("clears a refused code and puts focus back in the field, the refusal under the button", async () => {
		const { panel } = await openSignIn({
			signInWithCode: async () => {
				throw new ClientAuthFailure("invalid-code");
			},
		});
		askForCode(panel);
		const code = await within(panel).findByRole("textbox", { name: "Code" });

		fireEvent.change(code, { target: { value: "000000" } });

		const alert = await within(panel).findByRole("alert");
		expect(alert.textContent).toBe("That code does not match. Try again.");
		// Its room is the last thing in the form: Sign in and the links above it stay put.
		expect(alert.parentElement?.classList.contains("mm-account-alert")).toBe(true);
		expect(alert.parentElement?.nextElementSibling).toBeNull();
		expect(
			alert.parentElement?.previousElementSibling?.classList.contains("mm-account-code-actions"),
		).toBe(true);
		await waitFor(() => expect((code as HTMLInputElement).value).toBe(""));
		expect(document.activeElement).toBe(code);
		expect(within(panel).getByRole("textbox", { name: "Code" })).toBe(code);
	});

	it("offers another code after a minute, counting down until then", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
		vi.setSystemTime(NOW);
		const sendSignInCode = vi.fn(async (_email: string) => undefined);
		const { panel } = await openSignIn({ sendSignInCode }, () => new Date());
		askForCode(panel);
		await within(panel).findByRole("textbox", { name: "Code" });

		const resend = within(panel).getByRole("button", { name: "Send a new code in 1:00" });
		expect(resend.getAttribute("aria-disabled")).toBe("true");
		fireEvent.click(resend);
		expect(sendSignInCode).toHaveBeenCalledTimes(1);

		act(() => {
			vi.advanceTimersByTime(18_000);
		});
		expect(resend.textContent).toBe("Send a new code in 0:42");

		act(() => {
			vi.advanceTimersByTime(42_000);
		});
		expect(resend.textContent).toBe("Send a new code");
		expect(resend.getAttribute("aria-disabled")).toBeNull();

		fireEvent.click(resend);
		await waitFor(() => expect(sendSignInCode).toHaveBeenCalledTimes(2));
		expect(sendSignInCode.mock.calls[1]?.[0]).toBe("ada@example.com");
		// A new code starts a new minute, and the field is ready for it.
		await waitFor(() => expect(resend.textContent).toBe("Send a new code in 1:00"));
		expect(document.activeElement).toBe(within(panel).getByRole("textbox", { name: "Code" }));
	});

	it("goes back to the address with what was typed, and focus on it", async () => {
		const { panel } = await openSignIn();
		askForCode(panel, "ada@example.com");
		await within(panel).findByRole("textbox", { name: "Code" });

		fireEvent.click(within(panel).getByRole("button", { name: "Use another email" }));

		const email = within(panel).getByRole("textbox", { name: "Email" }) as HTMLInputElement;
		expect(email.value).toBe("ada@example.com");
		expect(document.activeElement).toBe(email);
		expect(within(panel).queryByRole("textbox", { name: "Code" })).toBeNull();
	});

	it("keeps the code step when the panel closes and opens again", async () => {
		const { panel } = await openSignIn();
		askForCode(panel);
		await within(panel).findByRole("textbox", { name: "Code" });

		const trigger = screen.getByRole("button", { name: "Sign in", expanded: true });
		fireEvent.click(screen.getByRole("button", { name: "Close account panel" }));
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		fireEvent.click(trigger);

		const reopened = screen.getAllByRole("dialog", { name: "Typelapse account" }).at(-1);
		expect(within(reopened as HTMLElement).getByRole("textbox", { name: "Code" })).toBeTruthy();
	});

	it("checks the address on submit, beside the field, and clears it as it is typed", async () => {
		const sendSignInCode = vi.fn(async (_email: string) => undefined);
		const { panel } = await openSignIn({ sendSignInCode });
		const email = within(panel).getByRole("textbox", { name: "Email" });
		fireEvent.change(email, { target: { value: "ada@" } });
		// Typing a first attempt is never flagged.
		expect(email.getAttribute("aria-invalid")).toBeNull();

		fireEvent.click(within(panel).getByRole("button", { name: "Email me a code" }));

		expect(sendSignInCode).not.toHaveBeenCalled();
		expect(email.getAttribute("aria-invalid")).toBe("true");
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
	it("keeps focus on its button while a code is on its way, and ignores a second press", async () => {
		let refuse: (reason: Error) => void = () => undefined;
		const sendSignInCode = vi.fn(
			(_email: string) =>
				new Promise<void>((_resolve, reject) => {
					refuse = reject;
				}),
		);
		const { panel } = await openSignIn({ sendSignInCode });
		fireEvent.change(within(panel).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		const submit = within(panel).getByRole("button", { name: "Email me a code" });
		submit.focus();
		fireEvent.click(submit);

		await waitFor(() => expect(submit.textContent).toBe("Sending code…"));
		expect(submit.hasAttribute("disabled")).toBe(false);
		expect(submit.getAttribute("aria-disabled")).toBe("true");
		// A screen reader hears that the form is working, not only that a label changed.
		expect(submit.closest("form")?.getAttribute("aria-busy")).toBe("true");
		expect(document.activeElement).toBe(submit);
		fireEvent.click(submit);
		expect(sendSignInCode).toHaveBeenCalledTimes(1);

		refuse(new ClientAuthFailure("invalid-email"));
		await waitFor(() => expect(submit.getAttribute("aria-disabled")).toBeNull());
	});

	// The alert used to land between the fields and the button and push the button, the
	// thing being pressed, 43px down. Its room is a slot that is there before the alert is,
	// under the button, so the form above it never moves.
	it("puts a refusal in a slot under the button that was there before it", async () => {
		const { panel } = await openSignIn({
			sendSignInCode: async () => {
				throw new ClientAuthFailure("rate-limited", { retryAfterSeconds: 45 });
			},
		});
		const submit = within(panel).getByRole("button", { name: "Email me a code" });
		const slot = submit.nextElementSibling;
		expect(slot?.classList.contains("mm-account-alert")).toBe(true);
		expect(slot?.textContent).toBe("");
		expect(within(panel).queryByRole("alert")).toBeNull();

		askForCode(panel);

		const alert = await within(panel).findByRole("alert");
		expect(alert.textContent).toBe("Too many attempts. Try again in 45 seconds.");
		expect(alert.parentElement).toBe(slot);
		expect(submit.nextElementSibling).toBe(slot);
		expect(within(panel).queryByRole("textbox", { name: "Code" })).toBeNull();
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
