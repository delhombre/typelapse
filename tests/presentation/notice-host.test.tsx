import { NoticeHost } from "@/presentation/components/ui/notice-host";
import { notify, useNoticeStore } from "@/presentation/stores/notice.store";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	// jsdom ships no matchMedia; motion's useReducedMotion needs it.
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
});

afterEach(() => {
	cleanup();
	for (const notice of useNoticeStore.getState().notices) {
		useNoticeStore.getState().dismiss(notice.id);
	}
});

describe("NoticeHost", () => {
	it("announces politely: the live region exists before any notice does", () => {
		const { container } = render(<NoticeHost />);
		expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
	});

	it("shows a notice's prose, and its machine detail separately", () => {
		render(<NoticeHost />);
		act(() => {
			notify("That file could not be read.", { tone: "error", detail: "broken.json" });
		});

		expect(screen.getByText("That file could not be read.")).toBeTruthy();
		expect(screen.getByText("broken.json")).toBeTruthy();
	});

	it("offers a dismiss control wired to the store", () => {
		render(<NoticeHost />);
		act(() => {
			notify("Go away.");
		});

		act(() => {
			screen.getByRole("button", { name: "Dismiss" }).click();
		});
		expect(useNoticeStore.getState().notices).toHaveLength(0);
	});
});
