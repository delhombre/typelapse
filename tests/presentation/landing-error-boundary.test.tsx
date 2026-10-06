import { AppRoutes } from "@/app-routes";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The landing had no boundary at all: a render error on / emptied #root. The
 * studio's fallback talks about saved work, which a reader of the landing does
 * not have, so the landing gets its own words.
 */

/** Which landing the route gets: one that fails on its first render, or one that
    mounts, takes its theme through the real hook, and fails on a later render. */
const landing = vi.hoisted(() => ({ page: "never mounts" as "never mounts" | "breaks later" }));

vi.mock("@/presentation/landing/landing-page", async () => {
	const { createElement, useState } = await import("react");
	const { useLandingTheme } = await import("@/presentation/landing/use-landing-theme");
	const NeverMounts = () => {
		throw new Error("A section could not render");
	};
	const BreaksLater = () => {
		useLandingTheme();
		const [broken, setBroken] = useState(false);
		if (broken) {
			throw new Error("A section failed after the landing mounted");
		}
		return createElement(
			"button",
			{ type: "button", onClick: () => setBroken(true) },
			"Break the landing",
		);
	};
	return {
		LandingPage: () => createElement(landing.page === "never mounts" ? NeverMounts : BreaksLater),
	};
});

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

/** A way out of the landing's route that stays inside the router. */
function Leave() {
	const navigate = useNavigate();
	return (
		<button type="button" onClick={() => navigate("/nowhere")}>
			Leave the landing
		</button>
	);
}

function renderRoutes() {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Leave />
			<AppRoutes />
		</MemoryRouter>,
	);
}

describe("a landing that fails after it has mounted", () => {
	beforeEach(() => {
		landing.page = "breaks later";
		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110" />`;
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		landing.page = "never mounts";
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
		renderRoutes();
		expect(document.documentElement.dataset.landingTheme).toBe(theme);

		fireEvent.click(screen.getByRole("button", { name: "Break the landing" }));

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(document.documentElement.dataset.landingTheme).toBe(theme);
		expect(themeColors()).toEqual([paper, paper]);
	});

	it("lets go of both once the route is left", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		window.localStorage.setItem("typelapse.landing-theme", "dark");
		renderRoutes();
		fireEvent.click(screen.getByRole("button", { name: "Break the landing" }));

		fireEvent.click(screen.getByRole("button", { name: "Leave the landing" }));

		expect(screen.queryByRole("alert")).toBeNull();
		expect(document.documentElement.dataset.landingTheme).toBeUndefined();
		expect(themeColors()).toEqual(["#FAF9F6", "#121110"]);
	});
});

describe("a landing that never mounts", () => {
	beforeEach(() => {
		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF9F6" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#121110" />`;
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		document.head.innerHTML = "";
		document.documentElement.removeAttribute("data-landing-theme");
	});

	it("gets the same theme-color, from the theme index.html set", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		document.documentElement.dataset.landingTheme = "dark";

		renderRoutes();

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(themeColors()).toEqual(["#121110", "#121110"]);
	});
});
