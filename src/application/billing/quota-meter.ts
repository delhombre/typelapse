import { type PlanAllowance, formatBytes, formatMinutes } from "./plan-allowance";

/** The share of a ceiling at which a bar changes colour and the upgrade moves up. */
export const WARNING_RATIO = 0.9;

export type QuotaKey = "cloudProjects" | "mediaBytes" | "hostedRenderTime";

/** A quota with room to fill: a count, and how full it is. */
export interface QuotaBar {
	readonly kind: "bar";
	readonly key: QuotaKey;
	readonly label: string;
	/** "1 of 3": what is used against what the plan allows, as the server counted it. */
	readonly count: string;
	/** 0 to 1, clamped: an account over its ceiling draws a full bar, not a longer one. */
	readonly ratio: number;
	readonly warn: boolean;
	/** "resets Nov 1", only for what comes back each month. */
	readonly resets?: string;
}

/** A quota the plan does not offer: said as a fact, since a bar with no room is not a meter. */
export interface QuotaFact {
	readonly kind: "fact";
	readonly key: QuotaKey;
	readonly label: string;
	readonly text: string;
}

export type QuotaMeter = QuotaBar | QuotaFact;

function bar(
	key: QuotaKey,
	label: string,
	count: string,
	used: number,
	limit: number,
	resets?: string,
): QuotaBar {
	const ratio = Math.min(1, used / limit);
	return {
		kind: "bar",
		key,
		label,
		count,
		ratio,
		warn: ratio >= WARNING_RATIO,
		...(resets ? { resets } : {}),
	};
}

/** "resets Nov 1": the server's UTC instant, read in UTC so the day is the one the server counts. */
function resetsLabel(resetsAt: string): string | undefined {
	const date = new Date(resetsAt);
	if (Number.isNaN(date.getTime())) {
		return undefined;
	}
	const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
	return `resets ${day.format(date)}`;
}

/**
 * The plan card's meters, built only from what the server answered: the ceilings
 * and usage it counted, the plan's own label and the instant the month resets.
 * The client adds the 90% rule and the words, never a number of a plan.
 */
export function quotaMeters(allowance: PlanAllowance): QuotaMeter[] {
	const { limits, usage } = allowance;
	const meters: QuotaMeter[] = [];
	if (Number.isFinite(limits.cloudProjects)) {
		meters.push(
			bar(
				"cloudProjects",
				"Cloud projects",
				`${usage.cloudProjects} of ${limits.cloudProjects}`,
				usage.cloudProjects,
				limits.cloudProjects,
			),
		);
	}
	if (Number.isFinite(limits.mediaBytes)) {
		meters.push(
			bar(
				"mediaBytes",
				"Media",
				`${formatBytes(usage.mediaBytes)} of ${formatBytes(limits.mediaBytes)}`,
				usage.mediaBytes,
				limits.mediaBytes,
			),
		);
	}
	if (limits.hostedRenderTime === 0) {
		meters.push({
			kind: "fact",
			key: "hostedRenderTime",
			label: "Hosted renders",
			text: `0 on ${allowance.planLabel}`,
		});
	} else if (Number.isFinite(limits.hostedRenderTime)) {
		meters.push(
			bar(
				"hostedRenderTime",
				"Hosted render minutes",
				`${formatMinutes(usage.hostedRenderMsThisMonth)} of ${formatMinutes(limits.hostedRenderTime)}`,
				usage.hostedRenderMsThisMonth,
				limits.hostedRenderTime,
				resetsLabel(allowance.resetsAt),
			),
		);
	}
	return meters;
}

/** Whether any quota with room to fill is at its warning share: the upgrade then sits above the meter. */
export function nearAnyLimit(meters: readonly QuotaMeter[]): boolean {
	return meters.some((meter) => meter.kind === "bar" && meter.warn);
}
