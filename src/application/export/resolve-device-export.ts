import { RenderConfig, type RenderFormat } from "@/domain/entities/render-config";

export interface DeviceExportRequest {
	width: number;
	height: number;
	fps: number;
	format: RenderFormat;
	/** The user's own watermark text (may be empty). */
	userWatermark: string;
}

export interface ResolvedDeviceExport {
	config: RenderConfig;
	/** The user's own watermark, or nothing. Typelapse never adds one. */
	watermark?: string;
}

/**
 * What a device export renders: the request as asked.
 *
 * Deliberately takes no Plan. What runs on the user's machine is free
 * (decision log 2026-10-13-device-exports-free, after viability D2), so no plan
 * clamps the resolution, the rate or the length, and none forces a mark. The
 * paid gates are hosted renders, cloud projects and media, and they live in
 * `Plan` and on the server. Leaving the plan out of the signature is what keeps
 * it that way: there is nothing here for a future entitlement to leak into.
 */
export function resolveDeviceExport(request: DeviceExportRequest): ResolvedDeviceExport {
	const { width, height, fps, format } = request;
	const config = RenderConfig.create({ width, height, fps, format });
	const watermark = request.userWatermark.trim();

	return { config, ...(watermark.length > 0 ? { watermark } : {}) };
}
