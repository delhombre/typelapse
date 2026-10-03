import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { StepBuilder } from "@/presentation/components/editor/step-builder";
import { StudioTimeline } from "@/presentation/components/timeline/studio-timeline";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
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
});

function firstSceneDuration(): number | undefined {
	return useSnippetStore.getState().snippet.steps[0]?.duration;
}

describe("StudioTimeline scene duration field", () => {
	beforeEach(() => {
		Element.prototype.scrollIntoView = vi.fn();
		const project = TEMPLATE_CATALOG[0]?.project;
		if (!project) {
			throw new Error("The template catalog must contain a project");
		}
		useSnippetStore.getState().importFromJson(JSON.stringify(project));
		useSnippetStore.getState().setCurrentStepIndex(0);
	});

	afterEach(() => cleanup());

	it("keeps what the user is typing, then clamps it on leaving the field", () => {
		render(<StudioTimeline />);
		const field = screen.getByRole("spinbutton", { name: "Scene 1 duration in seconds" });

		// "15" is typed one key at a time: "1" is valid and applies live, "15"
		// is over the limit and must neither vanish nor be silently dropped.
		fireEvent.change(field, { target: { value: "1" } });
		fireEvent.change(field, { target: { value: "15" } });
		expect((field as HTMLInputElement).value).toBe("15");
		expect(firstSceneDuration()).toBe(1_000);

		fireEvent.blur(field);
		expect(firstSceneDuration()).toBe(10_000);
		expect((field as HTMLInputElement).value).toBe("10");
	});

	it("restores the stored length when the field is left empty", () => {
		render(<StudioTimeline />);
		const field = screen.getByRole("spinbutton", { name: "Scene 1 duration in seconds" });
		const before = firstSceneDuration();
		if (before === undefined) {
			throw new Error("The template must contain a scene");
		}

		fireEvent.change(field, { target: { value: "" } });
		fireEvent.blur(field);

		expect(firstSceneDuration()).toBe(before);
		expect((field as HTMLInputElement).value).toBe(String(before / 1000));
	});

	it("gives the mobile scene list the same typing behaviour", () => {
		render(<StepBuilder />);
		const field = screen.getByRole("spinbutton", { name: "Scene 1 duration in seconds" });

		fireEvent.change(field, { target: { value: "1" } });
		fireEvent.change(field, { target: { value: "15" } });
		expect((field as HTMLInputElement).value).toBe("15");
		fireEvent.blur(field);

		expect(firstSceneDuration()).toBe(10_000);
	});
});
