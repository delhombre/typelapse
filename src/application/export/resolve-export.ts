import { RenderConfig, type RenderFormat } from "@/domain/entities/render-config";
import type { Plan } from "@/domain/value-objects/plan";

/** Where a render should run given the user's plan. */
export type ExportTarget = "local" | "cloud";

export interface ExportRequest {
	width: number;
	height: number;
	fps: number;
	format: RenderFormat;
	/** The user's custom watermark text (may be empty). */
	userWatermark: string;
}

export interface ResolvedExport {
	/** Plan-clamped render configuration. */
	config: RenderConfig;
	/** Watermark to actually render (branding on Free, custom/none otherwise). */
	watermark?: string;
	/** Local server (Free/local) or hosted queue (Pro/Team). */
	target: ExportTarget;
	/** True when the request had to be reduced to fit the plan. */
	downgraded: boolean;
}

/**
 * Apply plan entitlements to an export request.
 *
 * This is the single place that decides the effective resolution, fps,
 * watermark and render target, so the UI, the live preview and the render
 * server never disagree. Under Plan.local every rule is a pass-through no-op.
 */
export function resolveExport(plan: Plan, request: ExportRequest): ResolvedExport {
	const { width, height } = plan.clampResolution(request.width, request.height);
	const fps = plan.clampFps(request.fps);

	const config = RenderConfig.create({ width, height, fps, format: request.format });
	const watermark = plan.effectiveWatermark(request.userWatermark);
	const target: ExportTarget = plan.capabilities.allowsCloudExport ? "cloud" : "local";

	const downgraded = width !== request.width || height !== request.height || fps !== request.fps;

	return { config, watermark, target, downgraded };
}
