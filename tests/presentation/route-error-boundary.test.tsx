import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function Broken(): never {
	throw new Error("Failed to fetch dynamically imported module");
}

describe("RouteErrorBoundary", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("replaces a blank page with a recoverable state when a route throws", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		render(
			<RouteErrorBoundary>
				<Broken />
			</RouteErrorBoundary>,
		);

		expect(screen.getByRole("alert").textContent).toContain("Your work is saved on this device");
		expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
	});

	it("renders the route untouched when nothing throws", () => {
		render(
			<RouteErrorBoundary>
				<p>Studio</p>
			</RouteErrorBoundary>,
		);

		expect(screen.getByText("Studio")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
