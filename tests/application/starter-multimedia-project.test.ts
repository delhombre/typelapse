import { parseProjectDocument } from "@/application/project/project-document";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { compileSceneTimeline } from "@/application/render/scene-timeline";
import { describe, expect, it } from "vitest";

describe("createStarterMultimediaProject", () => {
	it("starts from a scene and a text layer rather than a fake PR", () => {
		const document = createStarterMultimediaProject({
			projectId: "project-1",
			sceneId: "scene-1",
			textBlockId: "text-1",
		});

		expect(document.project.title).toBe("Untitled story");
		expect(document.project.assets).toEqual([]);
		expect(document.project.audioCues).toEqual([]);
		expect(document.project.scenes).toHaveLength(1);
		expect(document.project.scenes[0]?.blocks).toEqual([
			expect.objectContaining({
				id: "text-1",
				kind: "text",
				text: "Make something worth watching.",
			}),
		]);
		expect(JSON.stringify(document).toLowerCase()).not.toContain("pull request");
		expect(JSON.stringify(document).toLowerCase()).not.toContain("github");
	});

	it("is valid at every boundary and immediately renderable", () => {
		const document = createStarterMultimediaProject({
			projectId: "project-1",
			sceneId: "scene-1",
			textBlockId: "text-1",
		});

		expect(parseProjectDocument(document)).toEqual({ schemaVersion: 2, document });
		const timeline = compileSceneTimeline({ document, fps: 30 });
		expect(timeline.durationMs).toBe(3_200);
		expect(timeline.frameAt(0).layers[0]).toEqual(
			expect.objectContaining({ kind: "text", blockId: "text-1" }),
		);
	});
});
