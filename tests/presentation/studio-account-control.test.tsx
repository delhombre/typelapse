// @vitest-environment jsdom
import {
	ClientAuthFailure,
	type ClientAuthPort,
	type ClientSession,
	type SignInCode,
} from "@/application/auth/client-auth.port";
import { type AccountUsage, planAllowance } from "@/application/billing/plan-allowance";
import { RESOLUTION_TIERS } from "@/domain/entities/render-config";
import type { BillingCadence, BillingCatalog, BillingNotice } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { FPS_OPTIONS } from "@/presentation/components/controls/cluster-panels";
import {
	StudioAccountControl,
	type StudioBillingControl,
} from "@/presentation/components/multimedia/studio-account-control";
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

	it("says what the device does and what an account adds, above the email field", async () => {
		const { panel } = await openSignIn();

		const lineOf = (lead: string) => {
			const line = within(panel).getByText(lead).closest("p");
			if (!line) throw new Error(`No line leads with ${lead}`);
			return line;
		};
		const device = lineOf("On this device:");
		const account = lineOf("With an account:");
		// The two lines are claims about the product (viability D2 and D4), pinned word for word.
		// The device line names the ceiling no plan clamps (device-exports-free D1, #265), and
		// that ceiling is the one the export offers: the largest tier and the fastest rate.
		expect(device.textContent).toBe(
			"On this device: every format up to 4K and 60 fps, no watermark, nothing uploaded, no account.",
		);
		expect(RESOLUTION_TIERS.at(-1)).toBe("4K");
		expect(FPS_OPTIONS.at(-1)?.value).toBe(60);
		expect(account.textContent).toBe(
			"With an account: private cloud copies, and hosted renders with captions and audio on Creator.",
		);
		const field = within(panel).getByRole("textbox", { name: "Email" });
		for (const line of [device, account]) {
			expect(line.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
			expect(line.textContent).not.toMatch(/[–—]/);
		}
	});

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

	// Emil's forms checklist (docs/decisions/2026-10-08-passwordless-auth.md D4).
	describe("the sign-in form meets the forms checklist", () => {
		/** A finger as the primary pointer: the media query the form asks is `(pointer: coarse)`. */
		function withFinger() {
			vi.stubGlobal("matchMedia", (query: string) => ({
				matches: query === "(pointer: coarse)",
				media: query,
				addEventListener: () => undefined,
				removeEventListener: () => undefined,
			}));
		}

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("gives the address an example, the right keyboard and no autocorrect", async () => {
			const { panel } = await openSignIn();
			const email = within(panel).getByRole("textbox", { name: "Email" });

			// The label stays; the placeholder is an example of the shape, never the name.
			expect(email.getAttribute("placeholder")).toBe("you@company.com");
			expect(email.getAttribute("type")).toBe("email");
			expect(email.getAttribute("inputmode")).toBe("email");
			expect(email.getAttribute("autocomplete")).toBe("email");
			expect(email.getAttribute("autocapitalize")).toBe("off");
			expect(email.getAttribute("spellcheck")).toBe("false");
			// A password manager helps with an address; it is not told to look away.
			expect(email.hasAttribute("data-1p-ignore")).toBe(false);
		});

		it("gives the code an example and keeps password managers off it", async () => {
			const { panel } = await openSignIn();
			askForCode(panel);
			const code = await within(panel).findByRole("textbox", { name: "Code" });

			expect(code.getAttribute("placeholder")).toBe("123456");
			expect(code.getAttribute("inputmode")).toBe("numeric");
			expect(code.getAttribute("autocomplete")).toBe("one-time-code");
			expect(code.getAttribute("pattern")).toBe("[0-9]*");
			expect(code.getAttribute("spellcheck")).toBe("false");
			expect(code.hasAttribute("data-1p-ignore")).toBe(true);
			expect(code.getAttribute("data-lpignore")).toBe("true");
		});

		it("puts the cursor in the address when the form opens under a mouse", async () => {
			const { panel } = await openSignIn();

			expect(document.activeElement).toBe(within(panel).getByRole("textbox", { name: "Email" }));
		});

		it("does not raise a phone's keyboard when the form opens", async () => {
			withFinger();
			const { panel } = await openSignIn();

			expect(document.activeElement).not.toBe(
				within(panel).getByRole("textbox", { name: "Email" }),
			);
		});

		it("leaves the code field to the finger, and puts focus on the heading that replaced the button", async () => {
			withFinger();
			const { panel } = await openSignIn();
			askForCode(panel);

			const code = await within(panel).findByRole("textbox", { name: "Code" });
			expect(document.activeElement).not.toBe(code);
			// The button that led here is gone: a screen reader lands on what changed.
			expect(document.activeElement).toBe(
				within(panel).getByRole("heading", { name: "Check your email." }),
			);
		});

		it("takes a finger back to the address, where it is about to type", async () => {
			withFinger();
			const { panel } = await openSignIn();
			askForCode(panel);
			await within(panel).findByRole("textbox", { name: "Code" });

			fireEvent.click(within(panel).getByRole("button", { name: "Use another email" }));

			expect(document.activeElement).toBe(within(panel).getByRole("textbox", { name: "Email" }));
		});

		it("flags an address that is wrong when the field is left, not while it is typed", async () => {
			const { panel } = await openSignIn();
			const email = within(panel).getByRole("textbox", { name: "Email" });
			const close = within(panel).getByRole("button", { name: "Close account panel" });

			fireEvent.change(email, { target: { value: "ada@" } });
			expect(email.getAttribute("aria-invalid")).toBeNull();

			fireEvent.blur(email, { relatedTarget: close });

			expect(email.getAttribute("aria-invalid")).toBe("true");
			const message = within(panel).getByText("Enter an email address like ada@example.com.");
			// Border, mark and words, announced as it appears: never colour alone.
			expect(within(panel).getByRole("status")).toBe(message);
			expect(message.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
			// Once flagged it is checked as it changes, so a fixed address clears at once.
			fireEvent.change(email, { target: { value: "ada@example.com" } });
			expect(email.getAttribute("aria-invalid")).toBeNull();
		});

		it("does not flag an empty address that is only passed through, nor a window that lost focus", async () => {
			const { panel } = await openSignIn();
			const email = within(panel).getByRole("textbox", { name: "Email" });
			const close = within(panel).getByRole("button", { name: "Close account panel" });

			fireEvent.blur(email, { relatedTarget: close });
			expect(email.getAttribute("aria-invalid")).toBeNull();

			// Another tab, or a press outside that is closing the panel: nothing inside took focus.
			fireEvent.change(email, { target: { value: "ada@" } });
			fireEvent.blur(email, { relatedTarget: null });
			expect(email.getAttribute("aria-invalid")).toBeNull();
		});

		// The message takes a line above the button; a button that moves between the press and
		// the release is not clicked. The press is Sign in's, so the check waits for the submit.
		it("waits for the submit when the blur is a press on the button, so the button does not move", async () => {
			const sendSignInCode = vi.fn(async (_email: string) => undefined);
			const { panel } = await openSignIn({ sendSignInCode });
			const email = within(panel).getByRole("textbox", { name: "Email" });
			const submit = within(panel).getByRole("button", { name: "Email me a code" });
			fireEvent.change(email, { target: { value: "ada@" } });

			fireEvent.pointerDown(submit);
			fireEvent.blur(email, { relatedTarget: submit });
			expect(email.getAttribute("aria-invalid")).toBeNull();

			// The press is over: the guard lets go, and leaving the field for something else in the
			// panel is checked again.
			fireEvent.pointerUp(document);
			fireEvent.blur(email, {
				relatedTarget: within(panel).getByRole("button", { name: "Close account panel" }),
			});
			expect(email.getAttribute("aria-invalid")).toBe("true");
			fireEvent.click(submit);
			expect(sendSignInCode).not.toHaveBeenCalled();
		});

		it("says beside the code field that it is short once it is left with digits in it", async () => {
			const { panel } = await openSignIn();
			askForCode(panel);
			const code = await within(panel).findByRole("textbox", { name: "Code" });
			const other = within(panel).getByRole("button", { name: "Use another email" });

			fireEvent.blur(code, { relatedTarget: other });
			expect(code.getAttribute("aria-invalid")).toBeNull();

			fireEvent.change(code, { target: { value: "0429" } });
			expect(code.getAttribute("aria-invalid")).toBeNull();
			fireEvent.blur(code, { relatedTarget: other });

			expect(code.getAttribute("aria-invalid")).toBe("true");
			const message = within(panel).getByText("Enter the six digits from the email.");
			expect(within(panel).getByRole("status")).toBe(message);
			expect(message.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
			fireEvent.change(code, { target: { value: "04291" } });
			fireEvent.change(code, { target: { value: "042917" } });
			expect(within(panel).queryByText("Enter the six digits from the email.")).toBeNull();
		});

		it("says Signing in… on the button while the code is checked, and ignores a second press", async () => {
			const signInWithCode = vi.fn(() => new Promise<void>(() => undefined));
			const { panel } = await openSignIn({ signInWithCode });
			askForCode(panel);
			const code = await within(panel).findByRole("textbox", { name: "Code" });

			fireEvent.change(code, { target: { value: "042917" } });

			const submit = await within(panel).findByRole("button", { name: "Signing in…" });
			expect(submit.getAttribute("aria-disabled")).toBe("true");
			fireEvent.click(submit);
			expect(signInWithCode).toHaveBeenCalledTimes(1);
		});
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

	describe("the plan meter (#255)", () => {
		const MB = 1024 * 1024;
		const AT = new Date("2026-10-13T09:00:00.000Z");

		function openWith(
			plan: Plan,
			used: Partial<AccountUsage>,
			billingOverrides: Partial<StudioBillingControl> = {},
		) {
			const store = createAuthStore({ kind: "local-offline" });
			store.setState({
				status: { kind: "authenticated", session: SESSION },
				operation: "idle",
				canSync: true,
				error: null,
			});
			const detail = planAllowance(
				plan,
				{ cloudProjects: 0, mediaBytes: 0, hostedRenderMsThisMonth: 0, activeRenders: 0, ...used },
				AT,
			);
			render(
				<StudioAccountControl
					store={store}
					allowance={detail.sentence}
					allowanceDetail={detail}
					billing={{
						planLabel: plan.label,
						paid: plan.isPro,
						available: true,
						catalog: {
							creator: { monthly: { currency: "EUR", unitAmount: 1200 } },
						},
						cadence: "monthly",
						busy: false,
						error: null,
						onCadence: vi.fn(),
						onUpgrade: vi.fn(),
						onManageBilling: vi.fn(),
						...billingOverrides,
					}}
				/>,
			);
			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
			return detail;
		}

		const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".mm-meter-row"));

		it("draws a bar and a count per quota, and Hosted renders as a fact on Free", () => {
			openWith(Plan.free(), { cloudProjects: 1, mediaBytes: 12 * MB });

			expect(rows().map((row) => row.textContent)).toEqual([
				"Cloud projects1 of 3",
				"Media12 MB of 100 MB",
				"Hosted renders0 on Free",
			]);
			expect(rows().filter((row) => row.querySelector(".mm-meter-fill"))).toHaveLength(2);
			expect(rows().some((row) => row.hasAttribute("data-warn"))).toBe(false);
		});

		it("keeps the server's sentence as text for a screen reader, and hides the drawn rows", () => {
			const detail = openWith(Plan.free(), { cloudProjects: 1 });

			const sentence = document.querySelector(".mm-meter .sr-only");
			expect(sentence?.textContent).toBe(detail.sentence);
			expect(document.querySelector(".mm-meter-list")?.getAttribute("aria-hidden")).toBe("true");
		});

		it("tells a screen reader the Hosted renders fact and the reset date the sentence leaves out", () => {
			openWith(Plan.free(), { cloudProjects: 1 });
			const free = Array.from(document.querySelectorAll(".mm-meter .sr-only")).map(
				(node) => node.textContent,
			);
			expect(free).toContain("Hosted renders: 0 on Free.");

			cleanup();
			openWith(Plan.pro(), { hostedRenderMsThisMonth: 12 * 60_000 });
			const creator = Array.from(document.querySelectorAll(".mm-meter .sr-only")).map(
				(node) => node.textContent,
			);
			expect(creator).toContain("Hosted render minutes resets Nov 1.");
		});

		it("shows the render minutes and their reset date on Creator", () => {
			openWith(Plan.pro(), { hostedRenderMsThisMonth: 12 * 60_000 });

			expect(rows().map((row) => row.textContent)).toContain(
				"Hosted render minutes12 of 60resets Nov 1",
			);
		});

		it("puts the upgrade under the meter until a quota is near its ceiling, then above it", () => {
			openWith(Plan.free(), { cloudProjects: 1 });
			const upgrade = screen.getByRole("button", { name: "Upgrade to Creator" });
			const meter = document.querySelector(".mm-meter") as HTMLElement;
			expect(
				meter.compareDocumentPosition(upgrade) & Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();

			cleanup();
			openWith(Plan.free(), { cloudProjects: 3 });
			const nearUpgrade = screen.getByRole("button", { name: "Upgrade to Creator" });
			const nearMeter = document.querySelector(".mm-meter") as HTMLElement;
			expect(
				nearMeter.compareDocumentPosition(nearUpgrade) & Node.DOCUMENT_POSITION_PRECEDING,
			).toBeTruthy();
			expect(rows()[0]?.hasAttribute("data-warn")).toBe(true);
			expect(document.querySelector(".mm-meter .sr-only:last-child")?.textContent).toBe(
				"Close to the limit: cloud projects.",
			);
		});

		it("falls back to the sentence alone when the server sent no numbers", () => {
			const store = createAuthStore({ kind: "local-offline" });
			store.setState({
				status: { kind: "authenticated", session: SESSION },
				operation: "idle",
				canSync: true,
				error: null,
			});
			render(
				<StudioAccountControl store={store} allowance="You are using 1 of 3 cloud projects." />,
			);
			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));

			expect(document.querySelector(".mm-meter")).toBeNull();
			expect(screen.getByText("You are using 1 of 3 cloud projects.")).toBeTruthy();
		});
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

	describe("test mode", () => {
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
		const prices = {
			monthly: { currency: "USD", unitAmount: 1200 },
			annual: { currency: "USD", unitAmount: 9900 },
		};
		const billing = (input: { catalog: BillingCatalog | null; paid?: boolean }) => ({
			planLabel: input.paid ? "Creator" : "Free",
			paid: input.paid ?? false,
			available: true,
			catalog: input.catalog,
			cadence: "monthly" as const,
			busy: false,
			error: null,
			onCadence: vi.fn(),
			onUpgrade: vi.fn(),
			onManageBilling: vi.fn(),
		});
		const open = (control: ReturnType<typeof billing>) => {
			render(<StudioAccountControl store={signedIn()} billing={control} />);
			fireEvent.click(screen.getByRole("button", { name: "Account for Ada Lovelace" }));
		};

		it("says nothing is charged when the server points at the sandbox, on a free plan card", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices } }));

			expect(screen.getByText("Test mode: no real charges")).toBeTruthy();
		});

		it("says it on a Creator card too, since the portal is the sandbox's as well", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices }, paid: true }));

			expect(screen.getByText("Test mode: no real charges")).toBeTruthy();
		});

		it("is a line, not a control: nothing in it can be pressed or dismissed", () => {
			open(billing({ catalog: { environment: "sandbox", creator: prices } }));

			const line = screen.getByText("Test mode: no real charges");
			expect(within(line).queryByRole("button")).toBeNull();
			expect(line.closest("button")).toBeNull();
			expect(screen.queryByRole("button", { name: /dismiss|close test mode/i })).toBeNull();
			// Not a live region either: it is always there, and the plan's own status stays alone.
			expect(screen.queryByRole("status")).toBeNull();
		});

		it("never draws on a production catalog, an older server, or no catalog", () => {
			for (const catalog of [
				{ environment: "production", creator: prices } satisfies BillingCatalog,
				{ creator: prices } satisfies BillingCatalog,
				null,
			]) {
				cleanup();
				open(billing({ catalog }));
				expect(screen.queryByText(/test mode/i)).toBeNull();
			}
		});
	});
});
