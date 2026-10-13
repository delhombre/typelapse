import { ImportIntentBoot } from "@/presentation/components/layout/import-intent-boot";
import { encodeImportIntent } from "@/presentation/utils/import-intent";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The strip an import raises while it fetches and when it fails. It is rendered
 * beside the shell, so it has to carry the studio's tokens itself (design audit
 * D9), and a failure has to say what to do next, not only what went wrong.
 */

vi.hoisted(() => {
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

const PR = "https://github.com/o/r/pull/7";

function arriveWith(source: string): void {
	act(() => {
		history.replaceState(null, "", `/app${encodeImportIntent({ source })}`);
		window.dispatchEvent(new HashChangeEvent("hashchange"));
	});
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(JSON.stringify({ message: "Not Found" }), {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
		),
	);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	history.replaceState(null, "", "/");
});

describe("the import status", () => {
	it("is mounted under the studio's tokens, beside the shell", async () => {
		render(<ImportIntentBoot />);
		arriveWith(PR);

		const status = await screen.findByTestId("import-status");
		const host = status.parentElement;
		expect(host?.classList.contains("studio-root")).toBe(true);
		expect(host?.classList.contains("sc-tokens")).toBe(true);
	});

	it("says what failed and what to do about it, with an icon and a way out", async () => {
		render(<ImportIntentBoot />);
		arriveWith(PR);

		const status = await screen.findByTestId("import-status");
		await screen.findByText(/not found/i);
		expect(status.getAttribute("data-state")).toBe("error");
		expect(status.textContent).toContain("Check the link, or paste the diff instead.");
		expect(status.querySelector("svg[aria-hidden='true']")).not.toBeNull();
		// The reason and the next step are separate lines, so the reason can wear the danger ink alone.
		expect(screen.getByTestId("import-status-text").textContent).not.toContain("Check the link");

		fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(screen.queryByTestId("import-status")).toBeNull();
	});

	it("is not drawn with a border, a mono face or a cold-ramp class", async () => {
		render(<ImportIntentBoot />);
		arriveWith(PR);

		const status = await screen.findByTestId("import-status");
		expect(status.className).toBe("sc-import-status pointer-events-auto");
	});
});

describe("what to do after an import failed", () => {
	it("tells a rate limit when to retry and does not blame the link", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response("{}", {
						status: 403,
						headers: {
							"x-ratelimit-limit": "60",
							"x-ratelimit-remaining": "0",
							"x-ratelimit-reset": String(Date.UTC(2026, 9, 13, 4, 0) / 1000),
						},
					}),
			),
		);
		render(<ImportIntentBoot />);
		arriveWith(PR);

		const status = await screen.findByTestId("import-status");
		await screen.findByText("GitHub's rate limit was hit");
		expect(status.textContent).toContain("Try again after 04:00 UTC, or paste the diff instead.");
		expect(status.textContent).not.toContain("Check the link");
	});

	it("says it is offline when the browser is", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		render(<ImportIntentBoot />);
		arriveWith(PR);

		const status = await screen.findByTestId("import-status");
		await screen.findByText("You are offline");
		expect(status.textContent).toContain("Reconnect and try again, or paste the diff instead.");
		expect(status.textContent).not.toContain("Check the link");
	});
});
