import { RouteErrorBoundary } from "@/presentation/components/ui/route-error-boundary";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { type ReactNode, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function Broken(): never {
	throw new Error("Failed to fetch dynamically imported module");
}

describe("RouteErrorBoundary", () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		document.documentElement.classList.remove("dark");
		delete document.documentElement.dataset.pageMark;
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

	it("carries the studio's dark theme to the fallback", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		document.documentElement.classList.add("dark");

		render(
			<RouteErrorBoundary>
				<Broken />
			</RouteErrorBoundary>,
		);

		expect(screen.getByRole("alert").closest(".dark")).not.toBeNull();
	});

	it("puts the fallback in the shell a route hands it, which reads the page before it is torn down", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		// A page that undoes what it set on the document as it unmounts, which is
		// what makes a failure take the page's document chrome with it.
		function Page() {
			useEffect(() => {
				document.documentElement.dataset.pageMark = "kept";
				return () => {
					delete document.documentElement.dataset.pageMark;
				};
			}, []);
			const [broken, setBroken] = useState(false);
			if (broken) {
				throw new Error("A section failed after the page mounted");
			}
			return (
				<button type="button" onClick={() => setBroken(true)}>
					Break the page
				</button>
			);
		}
		function Shell({ children }: { children: ReactNode }) {
			const [mark] = useState(() => document.documentElement.dataset.pageMark ?? "gone");
			return (
				<div data-testid="shell" data-mark={mark}>
					{children}
				</div>
			);
		}
		render(
			<RouteErrorBoundary Shell={Shell}>
				<Page />
			</RouteErrorBoundary>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Break the page" }));

		const shell = screen.getByTestId("shell");
		expect(shell.dataset.mark).toBe("kept");
		expect(within(shell).getByRole("alert")).toBeTruthy();
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
