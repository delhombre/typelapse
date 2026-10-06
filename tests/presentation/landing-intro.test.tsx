import { Hero } from "@/presentation/landing/hero";
import { LandingIntroProvider } from "@/presentation/landing/primitives";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduce: false }));

vi.mock("motion/react", async (importOriginal) => ({
	...(await importOriginal<typeof import("motion/react")>()),
	useReducedMotion: () => motion.reduce,
}));

vi.mock("@/presentation/landing/instrument", () => ({
	Instrument: () => <div aria-label="Product preview" />,
}));

function renderFirstVisit() {
	return render(
		<MemoryRouter>
			<LandingIntroProvider>
				<Hero />
			</LandingIntroProvider>
		</MemoryRouter>,
	);
}

/** Every element the intro is holding out of sight on its first frame. */
function hidden(container: HTMLElement) {
	return Array.from(container.querySelectorAll<HTMLElement>("[style]")).filter(
		(el) => el.style.opacity === "0",
	);
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
	motion.reduce = false;
});

describe("landing intro", () => {
	it("plays once on a first visit", () => {
		const { container } = renderFirstVisit();
		expect(hidden(container).length).toBeGreaterThan(0);
	});

	it("does not fade anything in under reduced motion", () => {
		// It cross-faded for 400ms instead: still motion nobody asked for, on
		// copy that was ready to read on the first frame.
		motion.reduce = true;
		const { container } = renderFirstVisit();
		expect(hidden(container)).toEqual([]);
	});
});
