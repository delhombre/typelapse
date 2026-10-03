import { AppRoutes } from "@/app-routes";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

describe("an address the app does not have", () => {
	afterEach(() => {
		cleanup();
	});

	it("says so and links back, instead of an empty page", () => {
		render(
			<MemoryRouter initialEntries={["/pricing-old"]}>
				<AppRoutes />
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("This page does not exist");
		expect(screen.getByRole("link", { name: "Open the studio" }).getAttribute("href")).toBe("/app");
		expect(screen.getByRole("link", { name: "Back to Typelapse" }).getAttribute("href")).toBe("/");
	});
});
