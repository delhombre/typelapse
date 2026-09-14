import { createStarterMultimediaProject } from "@/application/project/starter-multimedia-project";
import type { HostedRenderClientPort } from "@/application/render/hosted-render-client.port";
import type { LocalMultimediaRenderClientPort } from "@/application/render/local-multimedia-render-client.port";
import { MultimediaExportPanel } from "@/presentation/components/multimedia/multimedia-export-panel";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const document = createStarterMultimediaProject({ projectId: "project-export" });

afterEach(() => {
	cleanup();
});

function remote(): HostedRenderClientPort {
	return {
		submit: vi.fn(async () => ({
			id: "job-1",
			projectId: "project-export",
			revision: 3,
			status: "queued" as const,
			createdAt: "2026-08-31T08:00:00.000Z",
			completedAt: null,
		})),
		status: vi.fn(async () => ({
			job: {
				id: "job-1",
				projectId: "project-export",
				revision: 3,
				status: "succeeded" as const,
				createdAt: "2026-08-31T08:00:00.000Z",
				completedAt: "2026-08-31T08:00:05.000Z",
			},
			download: {
				method: "GET" as const,
				url: "https://private.example.test/render",
				expiresAt: "2026-08-31T08:01:05.000Z",
				mimeType: "video/mp4",
				byteSize: 42,
			},
		})),
		download: vi.fn(),
	};
}

function local(output: Blob): LocalMultimediaRenderClientPort {
	return {
		render: vi.fn(async () => output),
	};
}

describe("MultimediaExportPanel", () => {
	it("always offers a real local JSON project and hides cloud formats in local mode", () => {
		const save = vi.fn();
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				saveProjectFile={save}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Download project file" }));

		expect(save).toHaveBeenCalledOnce();
		const saved = save.mock.calls[0];
		if (!saved) {
			throw new Error("Expected the project file saver to be called");
		}
		const [blob, fileName] = saved;
		expect(blob).toBeInstanceOf(Blob);
		expect(fileName).toBe("Untitled story.typelapse.json");
		expect(screen.queryByRole("button", { name: /render video/i })).toBeNull();
	});

	it("renders the canonical local document with selected options and saves the returned video", async () => {
		const output = new Blob(["local-video"], { type: "video/webm" });
		const client = local(output);
		const saveVideo = vi.fn();
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				local={{ client, available: true }}
				saveVideoFile={saveVideo}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "WEBM" }));
		fireEvent.click(screen.getByRole("button", { name: "60 fps" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Include audio" }));
		fireEvent.click(screen.getByRole("button", { name: /render video/i }));

		await waitFor(() => expect(saveVideo).toHaveBeenCalledWith(output, "Untitled story.webm"));
		expect(client.render).toHaveBeenCalledWith({
			document,
			options: {
				format: "webm",
				width: document.project.canvas.width,
				height: document.project.canvas.height,
				fps: 60,
				includeAudio: false,
			},
			signal: expect.any(AbortSignal),
		});
	});

	it("keeps local video fail-closed when the capability is not explicitly available", () => {
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				local={{ client: local(new Blob(["video"])), available: false }}
			/>,
		);

		expect(screen.queryByText("Local renderer")).toBeNull();
		expect(screen.queryByRole("button", { name: /render video/i })).toBeNull();
	});

	it("keeps local controls busy until a real Blob is ready", async () => {
		let finishRender: ((blob: Blob) => void) | undefined;
		const pending = new Promise<Blob>((resolve) => {
			finishRender = resolve;
		});
		const client: LocalMultimediaRenderClientPort = {
			render: vi.fn(() => pending),
		};
		const saveVideo = vi.fn();
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				local={{ client, available: true }}
				saveVideoFile={saveVideo}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /render video/i }));

		expect(screen.getByRole("button", { name: "Rendering" })).toHaveProperty("disabled", true);
		expect(screen.getByRole("button", { name: "WEBM" })).toHaveProperty("disabled", true);
		expect(saveVideo).not.toHaveBeenCalled();

		finishRender?.(new Blob(["finished"], { type: "video/mp4" }));
		await waitFor(() => expect(saveVideo).toHaveBeenCalledOnce());
	});

	it("shows local render errors without downloading or claiming success", async () => {
		const saveVideo = vi.fn();
		const client: LocalMultimediaRenderClientPort = {
			render: vi.fn(async () => {
				throw new Error("The local encoder stopped.");
			}),
		};
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				local={{ client, available: true }}
				saveVideoFile={saveVideo}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /render video/i }));

		expect((await screen.findByRole("alert")).textContent).toContain("The local encoder stopped.");
		expect(saveVideo).not.toHaveBeenCalled();
		expect(screen.queryByText(/download started/i)).toBeNull();
	});

	it("does not report success when saving the rendered Blob fails", async () => {
		const output = new Blob(["finished"], { type: "video/mp4" });
		const saveVideo = vi.fn(async () => {
			throw new Error("The browser blocked the download.");
		});
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={1}
				deploymentMode="local"
				local={{ client: local(output), available: true }}
				saveVideoFile={saveVideo}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /render video/i }));

		expect((await screen.findByRole("alert")).textContent).toContain(
			"The browser blocked the download.",
		);
		expect(saveVideo).toHaveBeenCalledWith(output, "Untitled story.mp4");
		expect(screen.queryByText(/download started/i)).toBeNull();
	});

	it("shows hosted video honestly but keeps it disabled without capability", () => {
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={2}
				deploymentMode="hosted"
				cloud={{ client: remote(), available: false, reason: "Creator plan required" }}
			/>,
		);

		expect(screen.getByRole("button", { name: /render video/i })).toHaveProperty("disabled", true);
		expect(screen.getByText("Creator plan required")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /upgrade to creator/i })).toBeNull();
	});

	it("offers an upgrade action only when billing is explicitly available", () => {
		const onRequestUpgrade = vi.fn();
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={2}
				deploymentMode="hosted"
				cloud={{
					client: remote(),
					available: false,
					reason: "Private MP4 and WebM rendering is included with Creator.",
					upgrade: { available: true, onRequest: onRequestUpgrade },
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Upgrade to Creator" }));

		expect(onRequestUpgrade).toHaveBeenCalledOnce();
		expect(screen.getByText(/private mp4 and webm rendering/i)).toBeTruthy();
	});

	it("submits and polls the canonical hosted project revision before exposing download", async () => {
		const client = remote();
		render(
			<MultimediaExportPanel
				open
				onClose={vi.fn()}
				document={document}
				revision={3}
				deploymentMode="hosted"
				cloud={{ client, available: true }}
				pollIntervalMs={0}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /render video/i }));

		await waitFor(() => expect(screen.getByRole("link", { name: /download mp4/i })).toBeTruthy());
		expect(client.submit).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: "project-export",
				revision: 3,
				renderOptions: expect.objectContaining({ format: "mp4", includeAudio: true }),
			}),
			expect.any(Object),
		);
	});
});
