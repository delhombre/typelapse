import { hydrateProjectDocument } from "@/application/project/hydrate-project-document";
import { addMediaAsset } from "@/application/project/multimedia-authoring";
import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import { Asset } from "@/domain/entities/asset";
import type { Project } from "@/domain/entities/project";
import { MultimediaInspector } from "@/presentation/components/multimedia/multimedia-inspector";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

function videoProject(): Project {
	const base = hydrateProjectDocument(
		createStarterMultimediaProject({
			projectId: "project-1",
			sceneId: "scene-1",
			textBlockId: "title",
		}),
	).project;
	const video = Asset.create({
		id: "video-1",
		kind: "video",
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		byteSize: 10_000,
		checksum: "sha256:video",
		width: 1_920,
		height: 1_080,
		durationMs: 8_000,
	});
	return addMediaAsset(base, "scene-1", video, { blockId: "clip" });
}

describe("multimedia layer inspector", () => {
	it("offers accessible placement, crop, timing and layer-order controls", () => {
		let current = videoProject();
		const onTransact = vi.fn((edit: (project: Project) => Project) => {
			current = edit(current);
		});
		render(
			<MultimediaInspector
				project={current}
				sceneId="scene-1"
				blockId="clip"
				onTransact={onTransact}
				onClose={() => undefined}
			/>,
		);

		const layout = screen.getByRole("group", { name: "Layout" });
		expect(within(layout).getByRole("spinbutton", { name: "X position (%)" })).toBeTruthy();
		expect(within(layout).getByRole("spinbutton", { name: "Y position (%)" })).toBeTruthy();
		expect(within(layout).getByRole("spinbutton", { name: "Width (%)" })).toBeTruthy();
		expect(within(layout).getByRole("spinbutton", { name: "Height (%)" })).toBeTruthy();

		const stack = screen.getByRole("group", { name: "Layer order" });
		expect(
			(within(stack).getByRole("button", { name: "Send to back" }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect(
			(within(stack).getByRole("button", { name: "Send backward" }) as HTMLButtonElement).disabled,
		).toBe(true);
		expect(
			(within(stack).getByRole("button", { name: "Bring forward" }) as HTMLButtonElement).disabled,
		).toBe(false);
		expect(
			(within(stack).getByRole("button", { name: "Bring to front" }) as HTMLButtonElement).disabled,
		).toBe(false);

		expect(screen.getByRole("group", { name: "Media crop" })).toBeTruthy();
		expect(screen.getByRole("group", { name: "Clip timing" })).toBeTruthy();
		expect(screen.getByRole("combobox", { name: "Playback speed" })).toBeTruthy();
		expect(screen.getByRole("spinbutton", { name: "Corner radius (px)" })).toBeTruthy();
	});

	it("commits normalized layout, media and video edits without a toast workflow", () => {
		let current = videoProject();
		const onTransact = (edit: (project: Project) => Project) => {
			current = edit(current);
		};
		const view = render(
			<MultimediaInspector
				project={current}
				sceneId="scene-1"
				blockId="clip"
				onTransact={onTransact}
				onClose={() => undefined}
			/>,
		);

		fireEvent.change(screen.getByRole("spinbutton", { name: "Width (%)" }), {
			target: { value: "60" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "X position (%)" }), {
			target: { value: "25" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "Focal point X (%)" }), {
			target: { value: "80" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "Corner radius (px)" }), {
			target: { value: "24" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "Trim start (s)" }), {
			target: { value: "1.2" },
		});
		fireEvent.change(screen.getByRole("spinbutton", { name: "Trim end (s)" }), {
			target: { value: "6.4" },
		});
		fireEvent.change(screen.getByRole("combobox", { name: "Playback speed" }), {
			target: { value: "1.5" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Bring to front" }));

		const clip = current.scenes[0]?.blocks.find((block) => block.id === "clip");
		expect(clip).toMatchObject({
			placement: { x: 0.25, y: 0, width: 0.6, height: 1 },
			focalPoint: { x: 0.8, y: 0.5 },
			borderRadius: 24,
			trim: { startMs: 1_200, endMs: 6_400 },
			playbackRate: 1.5,
		});
		expect(current.scenes[0]?.blocks.at(-1)?.id).toBe("clip");
		expect(view.container.querySelector("[role='alert']")).toBeNull();
	});
});
