import { parseLineRanges } from "@/application/focus/line-ranges";
import { TEMPLATE_CATALOG } from "@/application/templates/catalog";
import { resolveShikiLanguage } from "@/infrastructure/highlighting/shiki-registry";
import { useExportStore } from "@/presentation/stores/export.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { describe, expect, it } from "vitest";

/**
 * The gallery's safety net. Templates are the first thing a visitor clicks, with
 * no account and no way to recover from a broken one, so every entry must be
 * proven to hydrate through the REAL import path before it can ship.
 */
describe("template catalog", () => {
	it("ships the six curated templates the gallery grid is composed for", () => {
		expect(TEMPLATE_CATALOG).toHaveLength(6);
	});

	it("gives every template a unique id", () => {
		const ids = TEMPLATE_CATALOG.map((t) => t.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	describe.each(TEMPLATE_CATALOG.map((t) => [t.id, t] as const))("%s", (_id, template) => {
		it("is presentable on a card", () => {
			expect(template.name.trim()).not.toBe("");
			expect(template.description.trim()).not.toBe("");
			// A card gives the description one line: it must actually fit on one.
			expect(template.description).not.toContain("\n");
			expect(template.description.length).toBeLessThanOrEqual(76);
			expect(template.tags.length).toBeGreaterThan(0);
			for (const tag of template.tags) {
				expect(tag.trim()).not.toBe("");
				expect(tag).toBe(tag.toLowerCase());
			}
		});

		it("is written in a language Shiki can actually colour", () => {
			// resolveShikiLanguage degrades the unknown to "text": a template that
			// landed there would render as a grey wall in the video being sold.
			expect(resolveShikiLanguage(template.project.language)).not.toBe("text");
			expect(template.language).toBe(template.project.language);
		});

		it("opens on its first frame and has a morph to show", () => {
			const { project } = template;
			// The studio shows `code` before playback: it must be the first step, or
			// the template appears to jump the moment you press play.
			expect(project.code).toBe(project.steps[0]?.code);
			expect(project.steps.length).toBeGreaterThanOrEqual(2);
			for (const step of project.steps) {
				expect(step.code.trim()).not.toBe("");
				expect(step.duration).toBeGreaterThan(0);
			}
		});

		it("only focuses lines that exist", () => {
			for (const step of template.project.steps) {
				if (step.focus === undefined) {
					continue;
				}
				const ranges = parseLineRanges(step.focus);
				expect(ranges, `'${step.focus}' must parse`).not.toBeNull();
				const lineCount = step.code.split("\n").length;
				for (const range of ranges ?? []) {
					expect(range.endLine).toBeLessThanOrEqual(lineCount);
				}
			}
		});

		it("hydrates through the real import path", () => {
			const { project } = template;
			expect(() =>
				useSnippetStore.getState().importFromJson(JSON.stringify(project)),
			).not.toThrow();

			const state = useSnippetStore.getState();
			expect(state.snippet.title).toBe(project.title);
			expect(state.snippet.code).toBe(project.code);
			expect(state.snippet.language).toBe(project.language);
			expect(state.snippet.theme.name).toBe(project.themeName);
			expect(state.background).toBe(project.background);
			expect(state.snippet.steps).toHaveLength(project.steps.length);
			// A freshly loaded template is not the user's work: no confirm is owed.
			expect(state.hasUnsavedEdits()).toBe(false);
		});

		it("restores the render settings it was authored with", () => {
			const { project } = template;
			useSnippetStore.getState().importFromJson(JSON.stringify(project));

			const ex = useExportStore.getState();
			if (project.width && project.height) {
				expect(ex.width).toBe(project.width);
				expect(ex.height).toBe(project.height);
			}
			if (project.progressStyle) {
				expect(ex.progressStyle).toBe(project.progressStyle);
			}
			expect(ex.typewriter).toBe(project.typewriter ?? false);
			expect(ex.focusZoom).toBe(project.focusZoom ?? false);
		});
	});

	describe("as a showcase, it covers what the competition cannot", () => {
		it("includes a typewriter intro", () => {
			expect(TEMPLATE_CATALOG.some((t) => t.project.typewriter === true)).toBe(true);
		});

		it("includes a focus walkthrough with captions", () => {
			expect(
				TEMPLATE_CATALOG.some((t) =>
					t.project.steps.some((s) => s.focus !== undefined && s.caption !== undefined),
				),
			).toBe(true);
		});

		it("includes a portrait template with segment progress", () => {
			expect(
				TEMPLATE_CATALOG.some(
					(t) =>
						t.project.width !== undefined &&
						t.project.height !== undefined &&
						t.project.height > t.project.width &&
						t.project.progressStyle === "reels",
				),
			).toBe(true);
		});

		it("shows off more than one theme and more than one backdrop", () => {
			expect(new Set(TEMPLATE_CATALOG.map((t) => t.project.themeName)).size).toBeGreaterThan(1);
			expect(new Set(TEMPLATE_CATALOG.map((t) => t.project.background)).size).toBeGreaterThan(1);
		});
	});
});
