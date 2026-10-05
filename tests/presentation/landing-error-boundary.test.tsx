import { AppRoutes } from "@/app-routes";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
