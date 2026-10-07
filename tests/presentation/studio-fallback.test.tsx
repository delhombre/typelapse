// @vitest-environment jsdom
import { AppRoutes } from "@/app-routes";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// The studio's chunk never arrives: this is the page while it is on the way.
vi.mock("@/presentation/studio/studio-route", () => new Promise(() => undefined));

describe("/app while the studio's chunk is loading", () => {
	afterEach(cleanup);

	it("shows the studio's outline instead of a blank page", () => {
		render(
			<MemoryRouter initialEntries={["/app"]}>
				<AppRoutes />
			</MemoryRouter>,
		);
		const outline = screen.getByRole("status", { name: "Loading the studio" });
		expect(outline.querySelector(".sk-header")).not.toBeNull();
		expect(outline.querySelector(".sk-frame")).not.toBeNull();
		expect(outline.querySelector(".sk-dock")).not.toBeNull();
		expect(outline.querySelector(".sk-timeline")).not.toBeNull();
	});

	it("is not a spinner, and says nothing to read twice", () => {
		render(
			<MemoryRouter initialEntries={["/app"]}>
				<AppRoutes />
			</MemoryRouter>,
		);
		expect(screen.queryByRole("progressbar")).toBeNull();
		// The shapes are decoration: the one announcement is the outline's own label.
		for (const part of document.querySelectorAll(".sk-header, .sk-stage, .sk-dock, .sk-timeline")) {
			expect(part.getAttribute("aria-hidden")).toBe("true");
		}
	});
});
