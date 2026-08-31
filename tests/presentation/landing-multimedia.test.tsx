// @vitest-environment jsdom
import { LandingPage } from "@/presentation/landing/landing-page";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
	const storedValues = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			clear: () => storedValues.clear(),
			getItem: (key: string) => storedValues.get(key) ?? null,
			key: (index: number) => [...storedValues.keys()][index] ?? null,
			get length() {
				return storedValues.size;
			},
			removeItem: (key: string) => storedValues.delete(key),
			setItem: (key: string, value: string) => storedValues.set(key, value),
		},
	});
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
	class Observer {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	window.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
	window.ResizeObserver = Observer as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

function renderLanding() {
	return render(
		<MemoryRouter>
			<LandingPage />
		</MemoryRouter>,
	);
}

describe("multimedia landing", () => {
	it("keeps the validated product-first composition while widening the promise", () => {
		renderLanding();

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Make anything move.");
		expect(screen.getByText(/Text, code, images, video and sound/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Render" })).toBeTruthy();
	});

	it("still demonstrates the real motion engine rather than replacing it with a static mockup", () => {
		renderLanding();

		expect(
			screen.getByLabelText(
				"Live preview: a code snippet morphing token by token on a mesh gradient background",
			),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("keeps structured code imports as one useful doorway, not the whole product", () => {
		renderLanding();

		expect(screen.getByRole("tab", { name: "pull request" })).toBeTruthy();
		expect(screen.getByText(/Start blank or import a code change/)).toBeTruthy();
		expect(screen.getByText(/text, code, images, video and audio/)).toBeTruthy();
		expect(screen.getByText("Every medium, in motion.")).toBeTruthy();
	});
});
