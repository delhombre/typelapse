import { NoticeHost } from "@/presentation/components/ui/notice-host";
import { notify, useNoticeStore } from "@/presentation/stores/notice.store";
import { useTransientSurfaceStore } from "@/presentation/stores/transient-surface.store";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

/** Whether the stubbed window is as wide as the desktop shell (1280px and up). */
let desktop = false;

beforeAll(() => {
	// jsdom ships no matchMedia; motion's useReducedMotion needs it.
	window.matchMedia = ((query: string) => ({
		matches: query.includes("reduced-motion") || (desktop && query.includes("min-width: 1280px")),
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia;
	// The phone placement measures the viewport's safe areas; jsdom ships no ResizeObserver.
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

afterEach(() => {
	cleanup();
	desktop = false;
	useTransientSurfaceStore.getState().setOccupied(0);
	for (const notice of useNoticeStore.getState().notices) {
		useNoticeStore.getState().dismiss(notice.id);
	}
});

describe("NoticeHost", () => {
	// Under 1280px (the stub's media queries never match a min-width) the notices start one
	// stage gap under the corner row, and under the import's surface when one is showing
	// (after-the-gate D6, #207): 10 + 40 + 18, then the surface's height and a gap.
	it("starts under the corner row, and under the import surface when it is showing", () => {
		const { container } = render(<NoticeHost />);
		const host = container.querySelector<HTMLElement>('[data-testid="notice-host"]');
		expect(host?.style.top).toBe("68px");
		expect(host?.style.transform).toBe("translateY(0px)");
		// The phone's line is measured through a probe: the desktop's test below has none.
		expect(
			document.body.querySelectorAll("div[aria-hidden='true'][style*='visibility']"),
		).toHaveLength(1);

		act(() => {
			useTransientSurfaceStore.getState().setOccupied(54);
		});
		expect(host?.style.top).toBe("68px");
		expect(host?.style.transform).toBe("translateY(62px)");
	});

	// From 1280px the desktop header owns the top: the notices keep the 76px line, whatever
	// the import surface does, and the desktop studio load adds no safe-area probe.
	it("keeps the desktop's 76px line from 1280px and measures nothing", () => {
		desktop = true;
		const probes = () =>
			document.body.querySelectorAll("div[aria-hidden='true'][style*='visibility']");
		const { container } = render(<NoticeHost />);
		const host = container.querySelector<HTMLElement>('[data-testid="notice-host"]');
		expect(host?.style.top).toBe("76px");
		expect(host?.style.transform).toBe("translateY(0px)");

		act(() => {
			useTransientSurfaceStore.getState().setOccupied(54);
		});
		expect(host?.style.top).toBe("76px");
		expect(host?.style.transform).toBe("translateY(0px)");
		expect(probes()).toHaveLength(0);
	});

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
