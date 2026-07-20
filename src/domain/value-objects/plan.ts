/**
 * Subscription plan: a value object describing what a tier is entitled to.
 *
 * This is the single, reconciled Plan for Typelapse. It unifies two orthogonal
 * concerns into one immutable value object:
 *   1. Export entitlements (resolution, fps, duration, watermark, hosted
 *      render) that gate what an export may do, so the preview, the export UI
 *      and the render server all agree on one source of truth (WYSIWYG).
 *   2. Team seats: the per-seat billing foundation for the B2B track. An
 *      Organization may hold no more members than its plan grants seats.
 *
 * Pure domain: no I/O, no framework.
 */

export type PlanTier = "local" | "free" | "pro" | "team";

/** Discrete branding watermark stamped on every free-tier export. */
export const BRANDING_WATERMARK = "Made with Typelapse";

export interface PlanCapabilities {
	/** Largest export width in pixels. */
	readonly maxWidth: number;
	/** Largest export height in pixels. */
	readonly maxHeight: number;
	/** Highest frame rate the tier may export at. */
	readonly maxFps: number;
	/** Longest video the tier may export, in milliseconds. */
	readonly maxDurationMs: number;
	/** A Typelapse branding watermark is forced onto every export. */
	readonly forcesBrandingWatermark: boolean;
	/** The user may set their own watermark text. */
	readonly allowsCustomWatermark: boolean;
	/** Hosted (cloud) rendering is available: no local server required. */
	readonly allowsCloudExport: boolean;
	/** Renders are placed on the priority queue. */
	readonly priorityQueue: boolean;
	/** Member seats the tier grants (per-seat team billing). */
	readonly seats: number;
}

/**
 * The local, open-source build: everything unlocked. This is the product
 * stance for the OSS app, which renders on the user's own machine and never
 * nerfs itself. Caps are unbounded so every gate is a pass-through no-op.
 */
const LOCAL: PlanCapabilities = {
	maxWidth: Number.POSITIVE_INFINITY,
	maxHeight: Number.POSITIVE_INFINITY,
	maxFps: Number.POSITIVE_INFINITY,
	maxDurationMs: Number.POSITIVE_INFINITY,
	forcesBrandingWatermark: false,
	allowsCustomWatermark: true,
	allowsCloudExport: false,
	priorityQueue: false,
	seats: 1,
};

const FREE: PlanCapabilities = {
	maxWidth: 1920,
	maxHeight: 1080,
	maxFps: 60,
	maxDurationMs: 60_000,
	forcesBrandingWatermark: true,
	allowsCustomWatermark: false,
	allowsCloudExport: false,
	priorityQueue: false,
	seats: 1,
};

const PRO: PlanCapabilities = {
	maxWidth: 3840,
	maxHeight: 2160,
	maxFps: 60,
	maxDurationMs: 600_000,
	forcesBrandingWatermark: false,
	allowsCustomWatermark: true,
	allowsCloudExport: true,
	priorityQueue: true,
	seats: 1,
};

const TIER_LABELS: Record<PlanTier, string> = {
	local: "Local",
	free: "Free",
	pro: "Pro",
	team: "Team",
};

/** Round down to the nearest even integer >= 2 (h264/yuv420p needs even dims). */
function toEven(n: number): number {
	return Math.max(2, Math.floor(n / 2) * 2);
}

function assertSeatLimit(seatLimit: number): void {
	if (!Number.isInteger(seatLimit)) {
		throw new Error("Seat limit must be an integer");
	}
	if (seatLimit < 1) {
		throw new Error("Seat limit must be at least 1");
	}
}

export class Plan {
	readonly tier: PlanTier;
	readonly capabilities: PlanCapabilities;

	private constructor(tier: PlanTier, capabilities: PlanCapabilities) {
		this.tier = tier;
		this.capabilities = capabilities;
	}

	/** The local OSS build: every entitlement unlocked (the app default). */
	static local(): Plan {
		return new Plan("local", LOCAL);
	}

	static free(): Plan {
		return new Plan("free", FREE);
	}

	static pro(): Plan {
		return new Plan("pro", PRO);
	}

	/**
	 * A team plan: Pro-level export entitlements plus a seat count for per-seat
	 * billing. The seat count is the paywall for team workspaces.
	 */
	static team(seatLimit: number): Plan {
		assertSeatLimit(seatLimit);
		return new Plan("team", { ...PRO, seats: seatLimit });
	}

	/**
	 * Build a plan from an untrusted tier string, defaulting to Free.
	 *
	 * Only the single-seat tiers are parseable here: `team` is constructed
	 * explicitly with its seat count (org billing), never from a bare string.
	 */
	static fromTier(tier: string): Plan {
		if (tier === "pro") {
			return Plan.pro();
		}
		if (tier === "local") {
			return Plan.local();
		}
		return Plan.free();
	}

	get isPro(): boolean {
		return this.tier === "pro";
	}

	get isFree(): boolean {
		return this.tier === "free";
	}

	/** Whether the tier is a paid subscription (pro or team). */
	get isPaid(): boolean {
		return this.tier === "pro" || this.tier === "team";
	}

	get label(): string {
		return TIER_LABELS[this.tier];
	}

	/** Convenience accessor for the team-billing seat count. */
	get seatLimit(): number {
		return this.capabilities.seats;
	}

	/** Whether the requested resolution fits within the plan's limits. */
	allowsResolution(width: number, height: number): boolean {
		return width <= this.capabilities.maxWidth && height <= this.capabilities.maxHeight;
	}

	/** Fit the requested resolution within the plan, preserving aspect ratio. */
	clampResolution(width: number, height: number): { width: number; height: number } {
		const { maxWidth, maxHeight } = this.capabilities;
		const scale = Math.min(1, maxWidth / width, maxHeight / height);
		if (scale >= 1) {
			return { width, height };
		}
		return { width: toEven(width * scale), height: toEven(height * scale) };
	}

	allowsFps(fps: number): boolean {
		return fps <= this.capabilities.maxFps;
	}

	clampFps(fps: number): number {
		return Math.min(fps, this.capabilities.maxFps);
	}

	allowsDuration(durationMs: number): boolean {
		return durationMs <= this.capabilities.maxDurationMs;
	}

	/**
	 * The watermark actually rendered for this plan.
	 *
	 * Free always carries the discrete branding mark; local, pro and team show
	 * the user's own mark when set, and nothing otherwise.
	 */
	effectiveWatermark(userWatermark: string): string | undefined {
		if (this.capabilities.forcesBrandingWatermark) {
			return BRANDING_WATERMARK;
		}
		const trimmed = userWatermark.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}

	/** Resize the team immutably: same tier, new seat count. */
	withSeats(seatLimit: number): Plan {
		assertSeatLimit(seatLimit);
		return new Plan(this.tier, { ...this.capabilities, seats: seatLimit });
	}
}
