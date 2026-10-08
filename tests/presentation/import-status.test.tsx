import { importNextStep } from "@/application/import/import-wording";
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
	it("sends a bad link to the link or to a pasted diff", () => {
		for (const kind of ["pr", "commit", "release", "compare", "code-url"] as const) {
			expect(importNextStep(kind)).toBe("Check the link, or paste the diff instead.");
		}
	});

	it("sends a bad paste back to the paste", () => {
		for (const kind of ["diff", "snippet", "empty"] as const) {
			expect(importNextStep(kind)).toBe("Check what you pasted, then try again.");
		}
	});
});
