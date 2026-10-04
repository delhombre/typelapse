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

function firstStepId(): string {
	const id = useSnippetStore.getState().snippet.steps[0]?.id;
	if (!id) {
		throw new Error("The template must contain a scene");
	}
	return id;
}

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
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });

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
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });
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
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });

		fireEvent.change(field, { target: { value: "1" } });
		fireEvent.change(field, { target: { value: "15" } });
		expect((field as HTMLInputElement).value).toBe("15");
		fireEvent.blur(field);

		expect(firstSceneDuration()).toBe(10_000);
	});

	it("shows a template's 1.4 s as 1.4, in the field and to assistive technology", () => {
		useSnippetStore.getState().updateStepDuration(firstStepId(), 1_400);
		render(<StepBuilder />);
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });

		// A number input hands its value to the accessibility tree as a 32-bit
		// float, which reads 1.399999976158142. A text field hands over the text.
		expect(field.getAttribute("type")).toBe("text");
		expect(field.getAttribute("inputmode")).toBe("decimal");
		expect((field as HTMLInputElement).value).toBe("1.4");
	});

	it("accepts a decimal comma, the way a French keyboard types it", () => {
		render(<StudioTimeline />);
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });

		fireEvent.change(field, { target: { value: "1,5" } });
		fireEvent.blur(field);

		expect(firstSceneDuration()).toBe(1_500);
		expect((field as HTMLInputElement).value).toBe("1.5");
	});

	it("steps by a tenth with the arrow keys and by a second with Shift, inside the bounds", () => {
		useSnippetStore.getState().updateStepDuration(firstStepId(), 1_200);
		render(<StudioTimeline />);
		const field = screen.getByRole("textbox", { name: "Scene 1 duration in seconds" });

		fireEvent.keyDown(field, { key: "ArrowUp" });
		expect(firstSceneDuration()).toBe(1_300);
		fireEvent.keyDown(field, { key: "ArrowDown", shiftKey: true });
		expect(firstSceneDuration()).toBe(400);
		fireEvent.keyDown(field, { key: "ArrowDown" });
		expect(firstSceneDuration()).toBe(400);
	});
});
