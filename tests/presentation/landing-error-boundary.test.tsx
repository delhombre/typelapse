import { AppRoutes } from "@/app-routes";
import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { useLandingTheme } from "@/presentation/landing/use-landing-theme";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The landing had no boundary at all: a render error on / emptied #root. The
 * studio's fallback talks about saved work, which a reader of the landing does
 * not have, so the landing gets its own words.
 */

vi.mock("@/presentation/landing/landing-page", () => ({
	LandingPage: () => {
		throw new Error("A section could not render");
	},
}));

describe("a landing that fails to render", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		document.documentElement.removeAttribute("data-landing-theme");
	});

	it("shows its own recoverable state instead of an empty page", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		render(
			<MemoryRouter initialEntries={["/"]}>
				<AppRoutes />
			</MemoryRouter>,
		);

		const alert = screen.getByRole("alert");
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page did not load");
		expect(alert.textContent).not.toContain("Your work is saved");
		expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Open the studio" }).getAttribute("href")).toBe("/app");
	});

	it("keeps the landing's dark theme, which the studio's .dark class does not carry", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		// What index.html sets before the bundle on a dark landing.
		document.documentElement.dataset.landingTheme = "dark";

		render(
			<MemoryRouter initialEntries={["/"]}>
				<AppRoutes />
			</MemoryRouter>,
		);

		expect(screen.getByRole("alert").closest(".dark")).not.toBeNull();
	});
});

/* The overscroll area and the browser chrome belong to the landing's route, not
   to the page: the page's hook set them and its cleanup took them down as the
   failure unmounted it, so a dark landing that fell over rubber-banded onto the
   studio's light paper under a dark fallback. */

function themeColors() {
	return [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
		(meta) => meta.content,
	);
}

/** A landing that mounts, takes its chrome through the real hook, and falls over
    on a later render, the way a section does once its data arrives. */
function LandingThatBreaks() {
	useLandingTheme();
	const [broken, setBroken] = useState(false);
	if (broken) {
		throw new Error("A section failed after the landing mounted");
	}
	return (
		<button type="button" onClick={() => setBroken(true)}>
			Break the landing
		</button>
	);
}

function LandingThatNeverMounts(): never {
	throw new Error("A section failed on the landing's first render");
}

describe("a landing that fails after it has mounted", () => {
	beforeEach(() => {
		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110" />`;
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		window.localStorage.clear();
		document.head.innerHTML = "";
		document.documentElement.removeAttribute("data-landing-theme");
	});

	it.each([
		["dark", "#121110"],
		["light", "#faf9f6"],
	])("keeps the %s overscroll and theme-color behind the fallback", (theme, paper) => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		window.localStorage.setItem("typelapse.landing-theme", theme);
		render(
			<RouteErrorBoundary>
				<LandingThatBreaks />
			</RouteErrorBoundary>,
		);
		expect(document.documentElement.dataset.landingTheme).toBe(theme);

		fireEvent.click(screen.getByRole("button", { name: "Break the landing" }));

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(document.documentElement.dataset.landingTheme).toBe(theme);
		expect(themeColors()).toEqual([paper, paper]);
	});

	it("lets go of both once the route is left", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		window.localStorage.setItem("typelapse.landing-theme", "dark");
		const { unmount } = render(
			<RouteErrorBoundary>
				<LandingThatBreaks />
			</RouteErrorBoundary>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Break the landing" }));

		unmount();

		expect(document.documentElement.dataset.landingTheme).toBeUndefined();
		expect(themeColors()).toEqual(["#FAF9F6", "#121110"]);
	});

	it("gives a landing that never mounted the same theme-color, from the theme index.html set", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		document.documentElement.dataset.landingTheme = "dark";

		render(
			<RouteErrorBoundary>
				<LandingThatNeverMounts />
			</RouteErrorBoundary>,
		);

		expect(themeColors()).toEqual(["#121110", "#121110"]);
	});
});
