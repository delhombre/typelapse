// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addTextLayer } from "@/application/project/multimedia-authoring";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { MultimediaInspector } from "@/presentation/components/multimedia/multimedia-inspector";
import { StudioTooltip, StudioTooltipProvider } from "@/presentation/components/ui/studio-tooltip";
import { createProjectStore } from "@/presentation/stores/project.store";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const tooltipCss = readFileSync(
	resolve(process.cwd(), "src/presentation/components/ui/studio-tooltip.css"),
	"utf8",
);

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function rect({
	left,
	top,
	width,
	height,
}: {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}): DOMRect {
	return {
		x: left,
		y: top,
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON: () => ({}),
	};
}

describe("StudioTooltip", () => {
	it("reveals accessible help immediately on focus and closes with Escape", () => {
		render(
			<StudioTooltipProvider>
				<StudioTooltip content="Undo last change" side="bottom">
					<button type="button" aria-label="Undo">
						Undo icon
					</button>
				</StudioTooltip>
			</StudioTooltipProvider>,
		);

		const trigger = screen.getByRole("button", { name: "Undo" });
		expect(trigger.getAttribute("title")).toBeNull();
		expect(screen.queryByRole("tooltip")).toBeNull();

		fireEvent.focus(trigger);

		const tooltip = screen.getByRole("tooltip", { name: "Undo last change" });
		expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);

		fireEvent.keyDown(trigger, { key: "Escape" });
		expect(screen.queryByRole("tooltip")).toBeNull();
	});

	it("does not reopen as a keyboard hint when a pointer press moves focus", () => {
		render(
			<StudioTooltipProvider>
				<StudioTooltip content="Play project">
					<button type="button" aria-label="Play">
						Play icon
					</button>
				</StudioTooltip>
			</StudioTooltipProvider>,
		);

		const trigger = screen.getByRole("button", { name: "Play" });
		fireEvent.pointerDown(trigger, { pointerType: "mouse" });
		fireEvent.focus(trigger);
		expect(screen.queryByRole("tooltip")).toBeNull();
	});

	it("delays the first pointer hint, then reveals neighboring hints instantly", () => {
		vi.useFakeTimers();
		render(
			<StudioTooltipProvider>
				<StudioTooltip content="Undo last change">
					<button type="button" aria-label="Undo">
						Undo icon
					</button>
				</StudioTooltip>
				<StudioTooltip content="Redo last change">
					<button type="button" aria-label="Redo">
						Redo icon
					</button>
				</StudioTooltip>
			</StudioTooltipProvider>,
		);

		const undo = screen.getByRole("button", { name: "Undo" });
		const redo = screen.getByRole("button", { name: "Redo" });
		fireEvent.pointerEnter(undo, { pointerType: "mouse" });
		act(() => vi.advanceTimersByTime(359));
		expect(screen.queryByRole("tooltip")).toBeNull();

		act(() => vi.advanceTimersByTime(1));
		expect(screen.getByRole("tooltip", { name: "Undo last change" })).toBeTruthy();

		fireEvent.pointerLeave(undo, { pointerType: "mouse" });
		expect(screen.queryByRole("tooltip")).toBeNull();
		fireEvent.pointerEnter(redo, { pointerType: "mouse" });
		expect(screen.getByRole("tooltip", { name: "Redo last change" })).toBeTruthy();
	});

	it("uses a fixed portal placement and flips before colliding with the viewport", () => {
		let triggerRect = rect({ left: 100, top: 100, width: 40, height: 40 });
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
			this: HTMLElement,
		) {
			if (this.getAttribute("role") === "tooltip") {
				return rect({ left: 0, top: 0, width: 80, height: 24 });
			}
			return triggerRect;
		});
		render(
			<StudioTooltipProvider>
				<StudioTooltip content="Close inspector" side="top">
					<button type="button" aria-label="Close inspector">
						Close icon
					</button>
				</StudioTooltip>
			</StudioTooltipProvider>,
		);

		fireEvent.focus(screen.getByRole("button", { name: "Close inspector" }));
		const tooltip = screen.getByRole("tooltip", { name: "Close inspector" });
		expect(tooltip.parentElement).toBe(document.body);
		expect(tooltip.dataset.side).toBe("top");
		expect(tooltip.style.left).toBe("80px");
		expect(tooltip.style.top).toBe("68px");

		triggerRect = rect({ left: 100, top: 4, width: 40, height: 40 });
		fireEvent.scroll(window);
		expect(tooltip.dataset.side).toBe("bottom");
		expect(tooltip.style.left).toBe("80px");
		expect(tooltip.style.top).toBe("52px");
	});

	it("coordinates the neighboring icon actions in the multimedia inspector", () => {
		const store = createProjectStore(
			createStarterMultimediaProject({
				projectId: "project-1",
				sceneId: "scene-1",
				textBlockId: "title-1",
			}),
		);
		const project = addTextLayer(store.getState().value.project, "scene-1", {
			id: "title-2",
		});
		render(
			<MultimediaInspector
				project={project}
				sceneId="scene-1"
				blockId="title-1"
				onTransact={() => undefined}
				onClose={() => undefined}
			/>,
		);

		const remove = screen.getByRole("button", { name: "Delete layer" });
		expect(remove.getAttribute("title")).toBeNull();
		fireEvent.focus(remove);
		expect(screen.getByRole("tooltip", { name: "Delete layer" })).toBeTruthy();

		fireEvent.blur(remove);
		fireEvent.focus(screen.getByRole("button", { name: "Close properties" }));
		expect(screen.getByRole("tooltip", { name: "Close properties" })).toBeTruthy();
	});
});

describe("studio tooltip visual contract", () => {
	it("uses fixed, transform-only motion and removes it for reduced-motion users", () => {
		expect(tooltipCss).toMatch(/\.studio-tooltip\s*\{[^}]*position:\s*fixed/s);
		expect(tooltipCss).toContain("@media (prefers-reduced-motion: reduce)");
		expect(tooltipCss).toMatch(/prefers-reduced-motion:[^)]+\)[^{]*\{[^}]*animation:\s*none/s);
		expect(tooltipCss).not.toMatch(
			/(?:transition|animation)[^;]*(?:width|height|left|right|top|bottom)/i,
		);
	});
});
