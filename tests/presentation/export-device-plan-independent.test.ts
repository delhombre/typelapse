import { Snippet } from "@/domain/entities/snippet";
import { Step } from "@/domain/entities/step";
import { Plan } from "@/domain/value-objects/plan";
import { useExportStore } from "@/presentation/stores/export.store";
import { createPlanStore, usePlanStore } from "@/presentation/stores/plan.store";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* #265: in a hosted build a signed-out visitor resolves Plan.free(), and that
   plan used to clamp a device export to 1080p and stamp "Made with Typelapse"
   on it. What runs on the user's machine is free (viability D2), so the same
   click must produce the same file under every plan. */

const rendered: {
	width: number;
	height: number;
	fps: number;
	watermark: { text: string } | null;
}[] = [];

vi.mock("@/infrastructure/export/webcodecs-renderer.adapter", () => ({
	isClientExportSupported: vi.fn(async () => true),
	WebCodecsRendererAdapter: class {
		lastMeasurements = null;
		constructor(private readonly options: { watermark: { text: string } | null }) {}
		async renderVideo(_snippet: unknown, config: { width: number; height: number; fps: number }) {
			rendered.push({
				width: config.width,
				height: config.height,
				fps: config.fps,
				watermark: this.options.watermark,
			});
			return new Blob(["video"], { type: "video/mp4" });
		}
	},
}));
vi.mock("@/infrastructure/export/browser-download.adapter", () => ({
	BrowserDownloadAdapter: class {
		async export() {}
	},
}));
vi.mock("@/infrastructure/captures/browser-capture-library", () => ({
	browserCaptureLibrary: { add: async () => undefined },
}));

function exportableSnippet(): Snippet {
	return Snippet.create({ title: "Plans", code: "const a = 1;", language: "typescript" })
		.addStep(Step.create({ code: "const a = 1;" }))
		.addStep(Step.create({ code: "const a = 2;" }));
}

const hostedSignedOut = createPlanStore({ deploymentMode: "hosted" }).getState().plan;

const PLANS: readonly [string, Plan][] = [
	["a hosted build, signed out", hostedSignedOut],
	["Free, signed in", Plan.free()],
	["Creator", Plan.pro()],
	["Team", Plan.team(3)],
	["the local build", Plan.local()],
];

describe("a device export does not depend on the plan", () => {
	beforeEach(() => {
		rendered.length = 0;
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState({ snippet: exportableSnippet(), plan: { frames: [] } as never });
	});

	afterEach(() => {
		useExportStore.setState(useExportStore.getInitialState(), true);
		useSnippetStore.setState(useSnippetStore.getInitialState(), true);
		usePlanStore.setState(usePlanStore.getInitialState(), true);
	});

	it("starts a hosted, signed-out build on the Free plan, the case that used to clamp", () => {
		expect(hostedSignedOut.isFree).toBe(true);
	});

	for (const [name, plan] of PLANS) {
		it(`${name}: 4K at 60 fps comes out 3840x2160 at 60 with no mark the user did not write`, async () => {
			usePlanStore.setState({ plan });
			useExportStore.setState({
				width: 3840,
				height: 2160,
				fps: 60,
				format: "mp4",
				target: "device",
			});

			await useExportStore.getState().exportVideo();

			expect(rendered).toEqual([{ width: 3840, height: 2160, fps: 60, watermark: null }]);
			expect(useExportStore.getState().outcome).toMatchObject({ kind: "done", target: "device" });
		});

		it(`${name}: the user's own watermark is rendered as written`, async () => {
			usePlanStore.setState({ plan });
			useSnippetStore.setState({ watermark: "@me" });
			useExportStore.setState({
				width: 3840,
				height: 2160,
				fps: 60,
				format: "mp4",
				target: "device",
			});

			await useExportStore.getState().exportVideo();

			expect(rendered).toHaveLength(1);
			expect(rendered[0]?.watermark?.text).toBe("@me");
		});
	}
});
