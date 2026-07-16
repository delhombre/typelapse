import { RenderConfig } from "@/domain/entities/render-config";
import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Theme } from "@/domain/entities/theme";
import { describe, expect, it } from "vitest";

describe("Snippet", () => {
	it("creates a snippet with title, code, and language", () => {
		const snippet = Snippet.create({
			title: "Hello World",
			code: 'console.log("hello");',
			language: "typescript",
		});

		expect(snippet.id).toBeDefined();
		expect(snippet.title).toBe("Hello World");
		expect(snippet.code).toBe('console.log("hello");');
		expect(snippet.language).toBe("typescript");
		expect(snippet.steps).toEqual([]);
	});

	it("uses default theme and render config", () => {
		const snippet = Snippet.create({
			title: "Test",
			code: "x",
			language: "ts",
		});

		expect(snippet.theme.name).toBe("midnight");
		expect(snippet.renderConfig.width).toBe(1920);
		expect(snippet.renderConfig.height).toBe(1080);
		expect(snippet.renderConfig.fps).toBe(60);
		expect(snippet.renderConfig.format).toBe("mp4");
	});

	it("accepts custom theme and render config", () => {
		const theme = Theme.frost();
		const config = RenderConfig.create({ width: 1280, height: 720, fps: 30, format: "gif" });

		const snippet = Snippet.create({
			title: "Test",
			code: "x",
			language: "ts",
			theme,
			renderConfig: config,
		});

		expect(snippet.theme.name).toBe("frost");
		expect(snippet.renderConfig.fps).toBe(30);
		expect(snippet.renderConfig.format).toBe("gif");
	});

	it("rejects empty title", () => {
		expect(() => Snippet.create({ title: "", code: "x", language: "ts" })).toThrow();
	});

	it("rejects empty code", () => {
		expect(() => Snippet.create({ title: "T", code: "", language: "ts" })).toThrow();
	});

	it("adds a step", () => {
		const snippet = Snippet.create({
			title: "Test",
			code: "const x = 1;",
			language: "ts",
		});

		const step = Step.create({ code: "const x = 1;" });
		const updated = snippet.addStep(step);

		expect(updated.steps).toHaveLength(1);
		expect(updated.steps[0]?.id).toBe(step.id);
	});

	it("removes a step by id", () => {
		const step1 = Step.create({ code: "line 1" });
		const step2 = Step.create({ code: "line 2" });

		const snippet = Snippet.create({
			title: "Test",
			code: "x",
			language: "ts",
		})
			.addStep(step1)
			.addStep(step2);

		const updated = snippet.removeStep(step1.id);

		expect(updated.steps).toHaveLength(1);
		expect(updated.steps[0]?.id).toBe(step2.id);
	});

	it("reorders steps", () => {
		const step1 = Step.create({ code: "a" });
		const step2 = Step.create({ code: "b" });
		const step3 = Step.create({ code: "c" });

		const snippet = Snippet.create({
			title: "Test",
			code: "x",
			language: "ts",
		})
			.addStep(step1)
			.addStep(step2)
			.addStep(step3);

		const reordered = snippet.reorderSteps([step3.id, step1.id, step2.id]);

		expect(reordered.steps[0]?.id).toBe(step3.id);
		expect(reordered.steps[1]?.id).toBe(step1.id);
		expect(reordered.steps[2]?.id).toBe(step2.id);
	});

	it("reorderSteps throws on mismatched ids", () => {
		const step1 = Step.create({ code: "a" });
		const snippet = Snippet.create({
			title: "Test",
			code: "x",
			language: "ts",
		}).addStep(step1);

		expect(() => snippet.reorderSteps(["unknown-id"])).toThrow();
	});

	it("is immutable: addStep returns a new instance", () => {
		const snippet = Snippet.create({ title: "T", code: "x", language: "ts" });
		const step = Step.create({ code: "y" });
		const updated = snippet.addStep(step);

		expect(updated).not.toBe(snippet);
		expect(snippet.steps).toHaveLength(0);
		expect(updated.steps).toHaveLength(1);
	});
});
