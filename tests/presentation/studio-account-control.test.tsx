// @vitest-environment jsdom
import type { ClientAuthPort, ClientSession } from "@/application/auth/client-auth.port";
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
});
