import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { TEMPLATES } from "@/presentation/templates";
import { describe, expect, it } from "vitest";

describe("starter templates", () => {
	it("each template is well-formed and animatable", () => {
		for (const template of TEMPLATES) {
			expect(template.title.trim()).not.toBe("");
			expect(template.code.trim()).not.toBe("");
			expect(template.language.trim()).not.toBe("");
			expect(template.themeName.trim()).not.toBe("");
			// Needs at least two steps to produce a morph.
			expect(template.steps.length).toBeGreaterThanOrEqual(2);
			for (const step of template.steps) {
				expect(step.code.trim()).not.toBe("");
				expect(step.duration).toBeGreaterThan(0);
			}
		}
	});

	it("has unique ids", () => {
		const ids = TEMPLATES.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("loads into the snippet store (the path the menu triggers)", () => {
		for (const template of TEMPLATES) {
			useSnippetStore.getState().importFromJson(JSON.stringify(template));
			const state = useSnippetStore.getState();
			expect(state.snippet.title).toBe(template.title);
			expect(state.snippet.language).toBe(template.language);
			expect(state.snippet.theme.name).toBe(template.themeName);
			expect(state.snippet.steps).toHaveLength(template.steps.length);
			expect(state.background).toBe(template.background);
		}
	});
});
