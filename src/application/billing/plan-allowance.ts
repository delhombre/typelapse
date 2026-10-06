// Relative rather than aliased: the Hono server imports this under tsx, which
// does not resolve the "@/" path mapping at runtime.
import type { AccountId } from "../../domain/ports/auth.port";
import type { Plan, PlanCeiling } from "../../domain/value-objects/plan";

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;
const MINUTE_MS = 60_000;

/** What an account currently holds against the hosted ceilings. */
export interface AccountUsage {
	/** Regular projects: the ones the ceiling counts, not those only render by URL has saved. */
	readonly cloudProjects: number;
	readonly mediaBytes: number;
	/** Output of hosted jobs queued, running or succeeded since the period start. */
	readonly hostedRenderMsThisMonth: number;
	readonly activeRenders: number;
}

/** Usage is derived from the rows the account already owns; nothing is counted twice. */
export interface AccountUsagePort {
	usageFor(ownerId: AccountId, periodStart: Date): Promise<AccountUsage>;
}

/** The name a client and the billing provider know a tier by: the domain's `pro` is sold as Creator. */
export type HostedTierName = "local" | "free" | "creator" | "team";

/** The body of a 402, 413 or 429 that a plan ceiling produced. */
export interface PlanLimitRefusal {
	readonly error: string;
	readonly code: "plan-limit";
	readonly ceiling: PlanCeiling;
	readonly limit: number;
	readonly used: number;
	readonly plan: HostedTierName;
	readonly upgradeTo: HostedTierName | null;
}

export function hostedTierName(plan: Plan): HostedTierName {
	return plan.tier === "pro" ? "creator" : plan.tier;
}

/** Hosted minutes reset on the first of the calendar month, in UTC. */
export function renderPeriodStart(now: Date): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The hosted render ceiling a new render of `durationMs` would cross, or null
 * when it fits. The render queue enforces the same two ceilings, in this order,
 * under its owner lock (`enqueueOrGet`); this is for a caller that wants to know
 * before it writes anything on the account's behalf.
 */
export function renderCeilingCrossed(
	plan: Plan,
	usage: Pick<AccountUsage, "activeRenders" | "hostedRenderMsThisMonth">,
	durationMs: number,
): { readonly ceiling: "concurrentRenders" | "hostedRenderTime"; readonly used: number } | null {
	if (usage.activeRenders >= plan.limitFor("concurrentRenders")) {
		return { ceiling: "concurrentRenders", used: usage.activeRenders };
	}
	if (usage.hostedRenderMsThisMonth + durationMs > plan.limitFor("hostedRenderTime")) {
		return { ceiling: "hostedRenderTime", used: usage.hostedRenderMsThisMonth };
	}
	return null;
}

function oneDecimal(value: number): string {
	const rounded = Math.round(value * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** No-break space: a narrow island must not leave "100" on one line and "MB" on the next. */
const UNIT_SPACE = "\u00a0";

function formatBytes(bytes: number): string {
	if (bytes >= GIBIBYTE) {
		return `${oneDecimal(bytes / GIBIBYTE)}${UNIT_SPACE}GB`;
	}
	const megabytes = bytes / MEBIBYTE;
	return `${megabytes < 10 ? oneDecimal(megabytes) : Math.round(megabytes)}${UNIT_SPACE}MB`;
}

function formatMinutes(ms: number): string {
	return oneDecimal(ms / MINUTE_MS);
}

function refusalSentence(plan: Plan, ceiling: PlanCeiling, upgrade: Plan | null): string {
	const limit = plan.limitFor(ceiling);
	switch (ceiling) {
		case "cloudProjects": {
			const own = `${plan.label} keeps ${limit} cloud projects`;
			return upgrade ? `${own}; ${upgrade.label} keeps ${upgrade.limitFor(ceiling)}` : own;
		}
		case "mediaBytes": {
			const own = `${plan.label} stores ${formatBytes(limit)} of media`;
			return upgrade
				? `${own}; ${upgrade.label} stores ${formatBytes(upgrade.limitFor(ceiling))}`
				: own;
		}
		case "hostedRenderTime":
			if (limit === 0) {
				return `Hosted renders come with ${upgrade?.label ?? "a paid plan"}`;
			}
			return `${plan.label} includes ${formatMinutes(limit)} minutes of hosted output a month and this render goes past it`;
		case "concurrentRenders":
			if (limit === 0) {
				return `Hosted renders come with ${upgrade?.label ?? "a paid plan"}`;
			}
			return `${plan.label} runs ${limit} hosted renders at once; wait for one to finish`;
	}
}

/** One shape for every quota refusal, so the client can say which ceiling and what lifts it. */
export function planLimitRefusal(plan: Plan, ceiling: PlanCeiling, used: number): PlanLimitRefusal {
	const upgrade = plan.upgradeFor(ceiling);
	return {
		error: refusalSentence(plan, ceiling, upgrade),
		code: "plan-limit",
		ceiling,
		limit: plan.limitFor(ceiling),
		used,
		plan: hostedTierName(plan),
		upgradeTo: upgrade ? hostedTierName(upgrade) : null,
	};
}

/** The body of the 402 a download gets once a past output's grace period is over. */
export function outputExpiredRefusal(plan: Plan): {
	readonly error: string;
	readonly code: "output-expired";
	readonly plan: HostedTierName;
	readonly upgradeTo: HostedTierName | null;
} {
	const upgrade = plan.upgradeFor("hostedRenderTime");
	const days = Math.round(plan.capabilities.hostedOutputGraceMs / (24 * 60 * MINUTE_MS));
	const own = `${plan.label} keeps past hosted renders for ${days} days`;
	return {
		error: upgrade ? `${own}; ${upgrade.label} keeps them` : own,
		code: "output-expired",
		plan: hostedTierName(plan),
		upgradeTo: upgrade ? hostedTierName(upgrade) : null,
	};
}

/**
 * The account island's one sentence about the allowance. Built on the server
 * from the Plan, so the client never carries a number of its own.
 */
export function allowanceSentence(plan: Plan, usage: AccountUsage): string {
	const projects = `${usage.cloudProjects} of ${plan.limitFor("cloudProjects")} cloud projects`;
	const media = `${formatBytes(usage.mediaBytes)} of ${formatBytes(plan.limitFor("mediaBytes"))} of media`;
	const renderLimit = plan.limitFor("hostedRenderTime");
	if (renderLimit === 0) {
		const upgrade = plan.upgradeFor("hostedRenderTime");
		return `You are using ${projects} and ${media}; hosted renders come with ${upgrade?.label ?? "a paid plan"}.`;
	}
	const minutes = `${formatMinutes(usage.hostedRenderMsThisMonth)} of ${formatMinutes(renderLimit)} hosted render minutes this month`;
	return `You are using ${projects}, ${media} and ${minutes}.`;
}
