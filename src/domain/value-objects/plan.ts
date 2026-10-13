/**
 * Subscription plan: a value object describing what a tier is entitled to.
 *
 * This is the single, reconciled Plan for Typelapse. It unifies two orthogonal
 * concerns into one immutable value object:
 *   1. Hosted entitlements: what runs on OUR machines (hosted renders, cloud
 *      projects, private media). A plan prices our compute and storage and
 *      nothing else. It carries no entitlement for an export on the user's own
 *      machine: that is free, never clamped, never watermarked
 *      (decision 2026-10-13-device-exports-free, after viability D2).
 *   2. Team seats: the per-seat billing foundation for the B2B track. An
 *      Organization may hold no more members than its plan grants seats.
 *
 * Pure domain: no I/O, no framework.
 */

export type PlanTier = "local" | "free" | "pro" | "team";

const MEBIBYTE = 1024 * 1024;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * A server-side ceiling a hosted account can hit. Each maps to one capability
 * below, so a refusal can name the ceiling, its value and the plan that lifts it.
 */
export type PlanCeiling = "cloudProjects" | "mediaBytes" | "hostedRenderTime" | "concurrentRenders";

export interface PlanCapabilities {
	/**
	 * Largest dimension, in pixels, of a HOSTED render on whichever axis is the
	 * longer one. Applies to renders on our servers only; an export on the user's
	 * own machine has no size limit.
	 *
	 * A hosted render is capped by SHAPE, not by axis. A tier names the short edge
	 * (`dimensionsFor`: "1440p" vertical is 1440x2560), and the export bar offers
	 * every aspect at every tier, so the same tier lands on width or on height
	 * depending on the orientation the user picked. Capping `width` and `height`
	 * separately would therefore sell a resolution and deliver another: Pro's 4K
	 * is 3840x2160 wide, and the identical entitlement is 2160x3840 vertical.
	 *
	 * So a plan grants a rectangle, and the render is allowed if it fits that
	 * rectangle in either orientation: long edge against `hostedMaxLongEdge`,
	 * short edge against `hostedMaxShortEdge`. Free grants 1920x1080 (the whole
	 * 1080p row, portrait included); Pro and Team grant 3840x2160 (every shipped
	 * preset).
	 */
	readonly hostedMaxLongEdge: number;
	/** Largest dimension of a hosted render on whichever axis is the shorter one. */
	readonly hostedMaxShortEdge: number;
	/** Hosted (cloud) rendering is available: no local server required. */
	readonly allowsCloudExport: boolean;
	/** Renders are placed on the priority queue. */
	readonly priorityQueue: boolean;
	/** Member seats the tier grants (per-seat team billing). */
	readonly seats: number;
	/** Projects the account may keep in Typelapse Cloud. */
	readonly maxCloudProjects: number;
	/** Bytes of private media the account may store, across all its projects. */
	readonly maxMediaBytes: number;
	/** Milliseconds of hosted render output per calendar month (UTC). */
	readonly hostedRenderMsPerMonth: number;
	/** Hosted render jobs that may be queued or running at once. */
	readonly maxConcurrentRenders: number;
	/**
	 * How long a past hosted output stays downloadable once the plan no longer
	 * includes hosted rendering. A user who paid for a file owns the file, so a
	 * downgrade starts a grace period instead of deleting access.
	 */
	readonly hostedOutputGraceMs: number;
}

/**
 * The local, open-source build: everything unlocked. This is the product
 * stance for the OSS app, which renders on the user's own machine and never
 * nerfs itself. Caps are unbounded so every gate is a pass-through no-op.
 */
const LOCAL: PlanCapabilities = {
	hostedMaxLongEdge: Number.POSITIVE_INFINITY,
	hostedMaxShortEdge: Number.POSITIVE_INFINITY,
	allowsCloudExport: false,
	priorityQueue: false,
	seats: 1,
	// Nothing runs on our servers in the local build, so no hosted ceiling applies.
	maxCloudProjects: Number.POSITIVE_INFINITY,
	maxMediaBytes: Number.POSITIVE_INFINITY,
	hostedRenderMsPerMonth: Number.POSITIVE_INFINITY,
	maxConcurrentRenders: Number.POSITIVE_INFINITY,
	hostedOutputGraceMs: Number.POSITIVE_INFINITY,
};

// The hosted ceilings are decision log 2026-10-03-viability D4: free exists so
// cloud save and the PR-by-URL flow can be tried; a render is paid compute.
const FREE: PlanCapabilities = {
	hostedMaxLongEdge: 1920,
	hostedMaxShortEdge: 1080,
	allowsCloudExport: false,
	priorityQueue: false,
	seats: 1,
	maxCloudProjects: 3,
	maxMediaBytes: 100 * MEBIBYTE,
	hostedRenderMsPerMonth: 0,
	maxConcurrentRenders: 0,
	hostedOutputGraceMs: 30 * DAY_MS,
};

const PRO: PlanCapabilities = {
	hostedMaxLongEdge: 3840,
	hostedMaxShortEdge: 2160,
	allowsCloudExport: true,
	priorityQueue: true,
	seats: 1,
	maxCloudProjects: 100,
	maxMediaBytes: 5 * 1024 * MEBIBYTE,
	hostedRenderMsPerMonth: 60 * MINUTE_MS,
	maxConcurrentRenders: 3,
	hostedOutputGraceMs: Number.POSITIVE_INFINITY,
};

const CEILING_CAPABILITY: Record<PlanCeiling, keyof PlanCapabilities> = {
	cloudProjects: "maxCloudProjects",
	mediaBytes: "maxMediaBytes",
	hostedRenderTime: "hostedRenderMsPerMonth",
	concurrentRenders: "maxConcurrentRenders",
};

const TIER_LABELS: Record<PlanTier, string> = {
	local: "Local",
	free: "Free",
	pro: "Creator",
	team: "Team",
};

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
		if (tier === "pro" || tier === "creator") {
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

	/**
	 * Whether a hosted render at this size fits the plan's rectangle.
	 * Orientation-free: the request's long edge is measured against the plan's
	 * long edge and its short edge against the short edge, so a preset and its
	 * portrait twin (3840x2160 and 2160x3840) are the same entitlement.
	 */
	allowsHostedResolution(width: number, height: number): boolean {
		const { hostedMaxLongEdge, hostedMaxShortEdge } = this.capabilities;
		return (
			Math.max(width, height) <= hostedMaxLongEdge && Math.min(width, height) <= hostedMaxShortEdge
		);
	}

	/** The plan's value for a hosted ceiling (milliseconds, bytes or a count). */
	limitFor(ceiling: PlanCeiling): number {
		return this.capabilities[CEILING_CAPABILITY[ceiling]] as number;
	}

	/**
	 * The plan a refusal should point to, or null when no plan lifts the ceiling.
	 * Only an unpaid hosted tier has somewhere to go: Creator is the top of the
	 * single-seat ladder, and local has no hosted ceilings at all.
	 */
	upgradeFor(ceiling: PlanCeiling): Plan | null {
		if (this.tier !== "free") {
			return null;
		}
		const creator = Plan.pro();
		return creator.limitFor(ceiling) > this.limitFor(ceiling) ? creator : null;
	}

	/**
	 * Whether a past hosted output may still be downloaded. The grace period runs
	 * from whichever came last, the render or the downgrade, so a job that
	 * finished after the downgrade still gets its full 30 days.
	 */
	keepsHostedOutput(input: {
		readonly completedAt: Date;
		readonly downgradedAt: Date | null;
		readonly now: Date;
	}): boolean {
		if (this.capabilities.allowsCloudExport) {
			return true;
		}
		const anchor = Math.max(input.completedAt.getTime(), input.downgradedAt?.getTime() ?? 0);
		return input.now.getTime() - anchor < this.capabilities.hostedOutputGraceMs;
	}

	/** Resize the team immutably: same tier, new seat count. */
	withSeats(seatLimit: number): Plan {
		assertSeatLimit(seatLimit);
		return new Plan(this.tier, { ...this.capabilities, seats: seatLimit });
	}
}
