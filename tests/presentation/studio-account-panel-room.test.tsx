import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @vitest-environment jsdom
import { StudioAccountControl } from "@/presentation/components/multimedia/studio-account-control";
import { createAuthStore } from "@/presentation/stores/auth.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("the desktop account panel's room (#272)", () => {
	// jsdom has no layout: scrollHeight and clientHeight are set by hand below, so this
	// checks the attribute follows the geometry, not that the veil takes no room of its
	// own. That is measured in a browser (tests/e2e/hosted/account.spec.ts, "fits what it holds").
	it("says it scrolls: its foot fades only while there is more to scroll to", () => {
		render(<StudioAccountControl store={createAuthStore({ kind: "local-offline" })} />);
		fireEvent.click(screen.getByRole("button", { name: "On this device" }));
		const panel = screen.getByRole("dialog", { name: "Local project" });
		const scrolled = (scrollTop: number, scrollHeight: number) => {
			Object.defineProperty(panel, "clientHeight", { configurable: true, value: 490 });
			Object.defineProperty(panel, "scrollHeight", { configurable: true, value: scrollHeight });
			panel.scrollTop = scrollTop;
			fireEvent.scroll(panel);
		};

		scrolled(0, 490);
		expect(panel.getAttribute("data-more-below")).toBe("false");

		scrolled(0, 680);
		expect(panel.getAttribute("data-more-below")).toBe("true");

		scrolled(190, 680);
		expect(panel.getAttribute("data-more-below")).toBe("false");
	});

	it("ends a gap above the timeline and clears the picture, by the studio's own variables", () => {
		const css = readFileSync(
			resolve(__dirname, "../../src/presentation/components/multimedia/studio-account-control.css"),
			"utf8",
		).replace(/\s+/g, " ");
		const rule = css.match(
			/\.mm-account:not\(\.mm-account-section\) > \.mm-account-popover \{([^}]*)\}/,
		)?.[1];

		expect(rule).toContain("width: min(312px");
		expect(rule).toContain("var(--camera-timeline-height, 218px)");
		expect(rule).toContain("var(--camera-timeline-bottom, 16px)");
		expect(rule).toContain("overflow-y: auto");
	});
});
