// @vitest-environment jsdom
import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
import type { BillingPort } from "@/domain/ports/billing.port";
import { Plan } from "@/domain/value-objects/plan";
import { StudioAccountIsland } from "@/presentation/components/layout/studio-account-island";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { createPlanStore } from "@/presentation/stores/plan.store";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * On the phone the account is the More menu's first section (design audit
 * 2026-10-08, D3): as a fifth chip it covered the project menu's button. The
 * island stays mounted with the menu shut and draws into the menu while it is
 * open; the sign-in by mailed code works from there, address then code.
 */

const SESSION: ClientSession = {
	account: { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" },
	expiresAt: new Date("2099-01-01T00:00:00.000Z"),
};

function port(session: ClientSession | null) {
	let current = session;
	const calls = { getSession: 0, sendSignInCode: [] as string[] };
	const auth: ClientAuthPort = {
		sendSignInCode: async (email) => {
			calls.sendSignInCode.push(email);
		},
		signInWithCode: async () => {
			current = SESSION;
		},
		signOut: async () => {
			current = null;
		},
		getSession: async () => {
			calls.getSession++;
			return current;
		},
	};
	return { auth, calls };
}

function planStore() {
	const billing: BillingPort = {
		getCatalog: async () => {
			throw new Error("Billing is not configured");
		},
		getCurrentPlan: async () => Plan.free(),
		startCheckout: async () => {
			throw new Error("Unexpected checkout");
		},
		openPortal: async () => {
			throw new Error("Unexpected portal");
		},
	};
	return createPlanStore({ deploymentMode: "hosted", billing });
}

function phone(session: ClientSession | null, menuOpen = true) {
	const { auth, calls } = port(session);
	const authStore = createAuthStore({ kind: "hosted", port: auth }, { now: () => new Date() });
	const menu = document.createElement("div");
	document.body.append(menu);
	const view = render(
		<StudioAccountIsland
			authStore={authStore}
			planStore={planStore()}
			cloudRuntime={null}
			menuSection={menuOpen ? menu : null}
		/>,
	);
	const reopen = (open: boolean) =>
		view.rerender(
			<StudioAccountIsland
				authStore={authStore}
				planStore={planStore()}
				cloudRuntime={null}
				menuSection={open ? menu : null}
			/>,
		);
	return { menu, calls, authStore, reopen, container: view.container };
}

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	vi.unstubAllGlobals();
});

/** The phone's primary pointer is a finger: its form does not raise the keyboard on open. */
function withFinger() {
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: query === "(pointer: coarse)",
		media: query,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
	}));
}

describe("the account in the phone's More menu", () => {
	it("is no chip: it draws into the menu, and nothing while the menu is shut", async () => {
		const { menu, container, calls, reopen } = phone(null, false);
		expect(container.querySelector(".sc-account-island")).toBeNull();
		expect(menu.childElementCount).toBe(0);
		// Shut, the island still checks the session, so the menu opens on the truth.
		await waitFor(() => expect(calls.getSession).toBe(1));

		reopen(true);
		expect(await within(menu).findByRole("button", { name: "Sign in" })).toBeTruthy();
	});

	it("signs in from the menu: the address, then the code, then the account's rows", async () => {
		withFinger();
		const { menu, calls } = phone(null);
		fireEvent.click(await within(menu).findByRole("button", { name: "Sign in" }));

		// The panel takes the rows' place, and focus goes to the way back.
		const back = within(menu).getByRole("button", { name: "More" });
		expect(document.activeElement).toBe(back);
		fireEvent.change(within(menu).getByRole("textbox", { name: "Email" }), {
			target: { value: "ada@example.com" },
		});
		fireEvent.click(within(menu).getByRole("button", { name: "Email me a code" }));
		const code = await within(menu).findByRole("textbox", { name: "Code" });
		expect(calls.sendSignInCode).toEqual(["ada@example.com"]);
		fireEvent.change(code, { target: { value: "042917" } });

		const account = await within(menu).findByRole("button", { name: "Account for Ada Lovelace" });
		await waitFor(() => expect(document.activeElement).toBe(account));
		expect(within(menu).getByRole("button", { name: "Sign out" })).toBeTruthy();
		await waitFor(() => expect(account.textContent).toContain("Free"));
	});

	it("leaves the cursor in the address, not on the way back, when a mouse opens the form", async () => {
		const { menu } = phone(null);
		fireEvent.click(await within(menu).findByRole("button", { name: "Sign in" }));

		expect(document.activeElement).toBe(within(menu).getByRole("textbox", { name: "Email" }));
	});

	it("goes back to the rows, on the way back or on Escape, with focus on the row", async () => {
		const { menu } = phone(null);
		fireEvent.click(await within(menu).findByRole("button", { name: "Sign in" }));
		fireEvent.click(within(menu).getByRole("button", { name: "More" }));
		await waitFor(() =>
			expect(document.activeElement).toBe(within(menu).getByRole("button", { name: "Sign in" })),
		);

		fireEvent.click(within(menu).getByRole("button", { name: "Sign in" }));
		fireEvent.keyDown(within(menu).getByRole("textbox", { name: "Email" }), { key: "Escape" });
		expect(await within(menu).findByRole("button", { name: "Sign in" })).toBeTruthy();
		expect(within(menu).queryByRole("textbox", { name: "Email" })).toBeNull();
	});

	it("leaves Escape on its rows to the menu, which closes on it", async () => {
		const { menu } = phone(null);
		const heard = vi.fn();
		document.addEventListener("keydown", heard);
		fireEvent.keyDown(await within(menu).findByRole("button", { name: "Sign in" }), {
			key: "Escape",
		});
		document.removeEventListener("keydown", heard);
		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("opens on the rows again after the menu was shut on the panel", async () => {
		const { menu, reopen } = phone(null);
		fireEvent.click(await within(menu).findByRole("button", { name: "Sign in" }));
		expect(within(menu).getByRole("textbox", { name: "Email" })).toBeTruthy();
		reopen(false);
		reopen(true);
		expect(await within(menu).findByRole("button", { name: "Sign in" })).toBeTruthy();
	});

	it("signs out from its row, and focus lands on the Sign in row that replaces it", async () => {
		const { menu, authStore } = phone(SESSION);
		const signOut = await within(menu).findByRole("button", { name: "Sign out" });
		signOut.focus();
		fireEvent.click(signOut);
		await waitFor(() => expect(authStore.getState().status.kind).toBe("anonymous"));
		const signIn = await within(menu).findByRole("button", { name: "Sign in" });
		// The row that held focus is gone: focus must not fall to the body (review of #245).
		await waitFor(() => expect(document.activeElement).toBe(signIn));
	});

	it("opens the signed-in account's panel from the account's row", async () => {
		const { menu } = phone(SESSION);
		fireEvent.click(await within(menu).findByRole("button", { name: "Account for Ada Lovelace" }));
		const panel = within(menu).getByRole("region", { name: "Typelapse account" });
		expect(within(panel).getByText("ada@example.com")).toBeTruthy();
	});
});
