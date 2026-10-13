import { describe, expect, it } from "vitest";
import {
	type AccountUsage,
	type PlanAllowance,
	planAllowance,
	renderPeriodReset,
} from "../../src/application/billing/plan-allowance";
import {
	WARNING_RATIO,
	nearAnyLimit,
	quotaMeters,
} from "../../src/application/billing/quota-meter";
import { Plan } from "../../src/domain/value-objects/plan";

const MB = 1024 * 1024;
const MINUTE = 60_000;
const NOW = new Date("2026-10-13T09:00:00.000Z");

function usage(overrides: Partial<AccountUsage> = {}): AccountUsage {
	return {
		cloudProjects: 0,
		mediaBytes: 0,
		hostedRenderMsThisMonth: 0,
		activeRenders: 0,
		...overrides,
	};
}

/** What the server answers for a plan and a usage: the meter reads nothing else. */
function allowance(plan: Plan, used: Partial<AccountUsage> = {}): PlanAllowance {
	return planAllowance(plan, usage(used), NOW);
}

describe("the period the hosted minutes reset on", () => {
	it("is the first of the next UTC month", () => {
		expect(renderPeriodReset(NOW).toISOString()).toBe("2026-11-01T00:00:00.000Z");
	});

	it("rolls over the year", () => {
		expect(renderPeriodReset(new Date("2026-12-31T23:59:59.000Z")).toISOString()).toBe(
			"2027-01-01T00:00:00.000Z",
		);
	});
});

describe("the quota meter", () => {
	it("shows a bar and a count for cloud projects and media, from the server's numbers", () => {
		const meters = quotaMeters(allowance(Plan.free(), { cloudProjects: 1, mediaBytes: 12 * MB }));

		expect(meters.map((meter) => meter.key)).toEqual([
			"cloudProjects",
			"mediaBytes",
			"hostedRenderTime",
		]);
		expect(meters[0]).toMatchObject({
			kind: "bar",
			label: "Cloud projects",
			count: "1 of 3",
		});
		expect(meters[1]).toMatchObject({
			kind: "bar",
			label: "Media",
			count: "12 MB of 100 MB",
		});
	});

	it("says hosted renders as a fact on a plan that has none, not as an empty bar", () => {
		const hosted = quotaMeters(allowance(Plan.free())).find(
			(meter) => meter.key === "hostedRenderTime",
		);

		expect(hosted).toEqual({
			kind: "fact",
			key: "hostedRenderTime",
			label: "Hosted renders",
			text: "0 on Free",
		});
	});

	it("shows the render minutes on Creator with the date they reset, from the server", () => {
		const hosted = quotaMeters(
			allowance(Plan.pro(), { hostedRenderMsThisMonth: 12 * MINUTE + 20_000 }),
		).find((meter) => meter.key === "hostedRenderTime");

		expect(hosted).toMatchObject({
			kind: "bar",
			label: "Hosted render minutes",
			count: "12.3 of 60",
			resets: "resets Nov 1",
		});
	});

	it("carries no number of its own: the same code reads whatever limits arrive", () => {
		const meters = quotaMeters({
			...allowance(Plan.free()),
			limits: { ...allowance(Plan.free()).limits, cloudProjects: 7 },
			usage: usage({ cloudProjects: 5 }),
		});

		expect(meters[0]).toMatchObject({ count: "5 of 7" });
	});

	it("leaves a ceiling out when it is not a number (the local build has none)", () => {
		const meters = quotaMeters({
			...allowance(Plan.free()),
			limits: {
				cloudProjects: Number.POSITIVE_INFINITY,
				mediaBytes: 100 * MB,
				hostedRenderTime: 0,
				concurrentRenders: 0,
			},
		});

		expect(meters.map((meter) => meter.key)).toEqual(["mediaBytes", "hostedRenderTime"]);
	});
});

describe("the warning at 90%", () => {
	it("is a ratio of the server's limit, written once", () => {
		expect(WARNING_RATIO).toBe(0.9);
	});

	it("stays quiet below 90% and speaks at exactly 90%", () => {
		// 3 projects on Free: 2 is 67%, and a 10-project plan makes 9 exactly 90%.
		const below = quotaMeters({ ...allowance(Plan.free()), usage: usage({ cloudProjects: 2 }) });
		expect(below[0]).toMatchObject({ warn: false });

		const base = allowance(Plan.free());
		const edge = quotaMeters({
			...base,
			limits: { ...base.limits, cloudProjects: 10 },
			usage: usage({ cloudProjects: 9 }),
		});
		const justUnder = quotaMeters({
			...base,
			limits: { ...base.limits, cloudProjects: 100 },
			usage: usage({ cloudProjects: 89 }),
		});
		expect(edge[0]).toMatchObject({ warn: true, ratio: 0.9 });
		expect(justUnder[0]).toMatchObject({ warn: false });
	});

	it("speaks when a Free account is full, and the bar never overflows", () => {
		const meters = quotaMeters(allowance(Plan.free(), { cloudProjects: 3 }));
		expect(meters[0]).toMatchObject({ warn: true, ratio: 1 });

		const over = quotaMeters(allowance(Plan.free(), { cloudProjects: 4 }));
		expect(over[0]).toMatchObject({ warn: true, ratio: 1 });
	});

	it("draws a full bar, never NaN, for a ceiling of zero", () => {
		const base = allowance(Plan.free());
		for (const used of [0, 2]) {
			const meters = quotaMeters({
				...base,
				limits: { ...base.limits, cloudProjects: 0 },
				usage: usage({ cloudProjects: used }),
			});
			expect(meters[0]).toMatchObject({ kind: "bar", count: `${used} of 0`, ratio: 1, warn: true });
		}
	});

	it("warns on the render minutes too", () => {
		const meters = quotaMeters(allowance(Plan.pro(), { hostedRenderMsThisMonth: 55 * MINUTE }));
		expect(meters.find((meter) => meter.key === "hostedRenderTime")).toMatchObject({ warn: true });
	});

	it("tells the plan card whether any quota is near its limit, to move the upgrade up", () => {
		expect(nearAnyLimit(quotaMeters(allowance(Plan.free(), { cloudProjects: 1 })))).toBe(false);
		expect(nearAnyLimit(quotaMeters(allowance(Plan.free(), { cloudProjects: 3 })))).toBe(true);
	});

	it("does not count a fact as a quota: Hosted renders at 0 on Free is not a warning", () => {
		expect(nearAnyLimit(quotaMeters(allowance(Plan.free())))).toBe(false);
	});
});
