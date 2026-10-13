import { mountFigure } from "@/presentation/landing/figures/mount-figure";
import type { HairlineFigureDef } from "@/presentation/landing/figures/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Figures redrawn under Anatomy's rule (#263), run on the real kernel with a
 * clock the test turns: each one plays its lap once and stops, every stop of
 * the lap lands on something the figure answers, and under reduced motion the
 * figure is drawn at its final frame the moment it mounts and never moves on
 * its own. The look is the validator's and the screenshots'.
 */

const REDRAWN = ["scenes"] as const;
type Name = (typeof REDRAWN)[number];

/** What each lap says, in the order it says it: the stops of its tour, one answer each, then rest. */
const LAPS: Record<Name, string[]> = { scenes: ["scene 01", "scene 02", "scene 03", "rest"] };

async function load(name: Name): Promise<HairlineFigureDef> {
	return (
		(await import(`@/presentation/landing/figures/${name}.ts`)) as { default: HairlineFigureDef }
	).default;
}

class FakeIntersectionObserver {
	static all: FakeIntersectionObserver[] = [];
	targets: Element[] = [];
	constructor(private callback: IntersectionObserverCallback) {
		FakeIntersectionObserver.all.push(this);
	}
	observe(el: Element): void {
		this.targets.push(el);
	}
	unobserve(): void {}
	disconnect(): void {
		this.targets = [];
	}
	/** Everything watched comes fully into view. */
	static show(): void {
		for (const io of FakeIntersectionObserver.all) {
			io.callback(
				io.targets.map(
					(target) =>
						({ target, isIntersecting: true, intersectionRatio: 1 }) as IntersectionObserverEntry,
				),
				io as unknown as IntersectionObserver,
			);
		}
	}
}

let clock = 0;
let frames: FrameRequestCallback[] = [];

/** Runs the kernel's loop for `ms` of its own time, a frame every 16 ms. */
function run(ms: number): void {
	for (let spent = 0; spent < ms; spent += 16) {
		clock += 16;
		const due = frames;
		frames = [];
		for (const frame of due) {
			frame(clock);
		}
	}
}

function setup(reduced: boolean) {
	clock = 0;
	frames = [];
	FakeIntersectionObserver.all = [];
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
	vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => frames.push(frame));
	vi.stubGlobal("cancelAnimationFrame", () => undefined);
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
	);
	vi.spyOn(performance, "now").mockImplementation(() => clock);
	// jsdom lays nothing out: the stage is the kernel's 400 x 320 viewBox, so a client point is a viewBox point.
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		() => ({ left: 0, top: 0, width: 400, height: 320, right: 400, bottom: 320 }) as DOMRect,
	);
}

function mount(def: HairlineFigureDef) {
	const box = document.createElement("div");
	document.body.append(box);
	const said: string[] = [];
	const destroy = mountFigure(def, box, (text) => said.push(text));
	const host = box.querySelector<HTMLElement>("[data-hairline]") as HTMLElement;
	const paths = () => [...host.querySelectorAll("path")].map((p) => p.getAttribute("d"));
	const hover = (x: number, y: number) =>
		host.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
	return { said, destroy, host, paths, hover };
}

describe.each(REDRAWN)("the redrawn %s figure", (name) => {
	beforeEach(() => setup(false));
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		document.body.replaceChildren();
	});

	it("plays its lap once, answers at every stop, leaves, and stops", async () => {
		const def = await load(name);
		const { said, destroy } = mount(def);
		expect(said).toEqual(["rest"]);

		FakeIntersectionObserver.show();
		run(20_000);

		// the lap says each stop once, in the order of the tour, with no answer in passing, and ends at rest
		const lap = said.slice(1).filter((text, i, all) => text !== all[i - 1]);
		expect(lap).toEqual(LAPS[name]);

		// then the figure rests: nothing more is said or drawn, however long the page stays open
		const spoken = said.length;
		FakeIntersectionObserver.show();
		run(30_000);
		expect(said).toHaveLength(spoken);
		expect(frames).toHaveLength(0);

		destroy();
	});

	it("is drawn at its final frame under reduced motion, and no lap moves it", async () => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		setup(true);
		const def = await load(name);
		const { said, paths, hover, destroy } = mount(def);
		const rest = paths();
		expect(rest.every((d) => d !== null)).toBe(true);

		FakeIntersectionObserver.show();
		run(20_000);

		expect(said).toEqual(["rest"]);
		expect(paths()).toEqual(rest);

		// a hand lands the figure on its answer in one frame, not a glide
		const [x, y] = def.tour?.[1] ?? [0, 0];
		hover(x ?? 0, y ?? 0);
		run(16);
		const landed = paths();
		expect(landed).not.toEqual(rest);
		run(2_000);
		expect(paths()).toEqual(landed);

		// and it is the frame the full-motion figure settles on
		destroy();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		setup(false);
		const live = mount(def);
		FakeIntersectionObserver.show();
		live.hover(x ?? 0, y ?? 0);
		run(3_000);
		// to the hundredth of a viewBox unit: the tween's last step is a hair short of its target
		const numbers = (ds: (string | null)[]) =>
			ds
				.join(" ")
				.match(/-?\d+(?:\.\d+)?/g)
				?.map(Number);
		const settled = numbers(live.paths()) ?? [];
		const final = numbers(landed) ?? [];
		expect(settled).toHaveLength(final.length);
		settled.forEach((n, i) => expect(Math.abs(n - (final[i] ?? 0))).toBeLessThan(0.05));
		live.destroy();
	});
});
