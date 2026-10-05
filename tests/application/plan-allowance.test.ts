import { describe, expect, it } from "vitest";
import {
	allowanceSentence,
	planLimitRefusal,
	renderCeilingCrossed,
	renderPeriodStart,
} from "../../src/application/billing/plan-allowance";
import { Plan } from "../../src/domain/value-objects/plan";

const MB = 1024 * 1024;

describe("plan limit refusals", () => {
	it("name the ceiling, its value, the usage and the plan that lifts it", () => {
		expect(planLimitRefusal(Plan.free(), "cloudProjects", 3)).toEqual({
			error: "Free keeps 3 cloud projects; Creator keeps 100",
			code: "plan-limit",
			ceiling: "cloudProjects",
			limit: 3,
			used: 3,
			plan: "free",
			upgradeTo: "creator",
		});
	});

	it("tell a free account that hosted renders come with Creator", () => {
		expect(planLimitRefusal(Plan.free(), "hostedRenderTime", 0)).toMatchObject({
			error: "Hosted renders come with Creator",
			ceiling: "hostedRenderTime",
			limit: 0,
			plan: "free",
			upgradeTo: "creator",
		});
	});

	it("say storage in megabytes and gigabytes", () => {
		expect(planLimitRefusal(Plan.free(), "mediaBytes", 99 * MB).error).toBe(
			"Free stores 100\u00a0MB of media; Creator stores 5\u00a0GB",
		);
	});

	it("point nowhere above Creator", () => {
		const minutes = planLimitRefusal(Plan.pro(), "hostedRenderTime", 59 * 60_000);
		expect(minutes).toMatchObject({ plan: "creator", upgradeTo: null, limit: 3_600_000 });
		expect(minutes.error).toBe(
			"Creator includes 60 minutes of hosted output a month and this render goes past it",
		);
		expect(planLimitRefusal(Plan.pro(), "concurrentRenders", 3).error).toBe(
			"Creator runs 3 hosted renders at once; wait for one to finish",
		);
	});
});

describe("allowance sentence", () => {
	it("tells a free account what it uses and that renders need Creator", () => {
		expect(
			allowanceSentence(Plan.free(), {
				cloudProjects: 2,
				mediaBytes: 12 * MB,
				hostedRenderMsThisMonth: 0,
				activeRenders: 0,
			}),
		).toBe(
			"You are using 2 of 3 cloud projects and 12\u00a0MB of 100\u00a0MB of media; hosted renders come with Creator.",
		);
	});

	it("tells a Creator account its projects, media and minutes this month", () => {
		expect(
			allowanceSentence(Plan.pro(), {
				cloudProjects: 4,
				mediaBytes: 1.25 * 1024 * MB,
				hostedRenderMsThisMonth: 12 * 60_000 + 20_000,
				activeRenders: 1,
			}),
		).toBe(
			"You are using 4 of 100 cloud projects, 1.3\u00a0GB of 5\u00a0GB of media and 12.3 of 60 hosted render minutes this month.",
		);
	});
});

describe("render period", () => {
	it("is the calendar month in UTC", () => {
		expect(renderPeriodStart(new Date("2026-10-31T23:59:59.000Z")).toISOString()).toBe(
			"2026-10-01T00:00:00.000Z",
		);
	});
});

describe("the hosted render ceiling a new render would cross", () => {
	const usage = (activeRenders: number, hostedRenderMsThisMonth: number) => ({
		activeRenders,
		hostedRenderMsThisMonth,
	});
	const MINUTE = 60_000;

	it("is none while the render fits both ceilings, to the millisecond", () => {
		expect(renderCeilingCrossed(Plan.pro(), usage(2, 60 * MINUTE - 3_050), 3_050)).toBeNull();
	});

	it("is the month's minutes once the render goes one millisecond past them", () => {
		expect(renderCeilingCrossed(Plan.pro(), usage(0, 60 * MINUTE - 3_049), 3_050)).toEqual({
			ceiling: "hostedRenderTime",
			used: 60 * MINUTE - 3_049,
		});
	});

	it("is the number of renders already running once the plan's are all busy", () => {
		expect(renderCeilingCrossed(Plan.pro(), usage(3, 0), 3_050)).toEqual({
			ceiling: "concurrentRenders",
			used: 3,
		});
	});

	it("names the renders running first when both ceilings are crossed, as the queue does", () => {
		expect(renderCeilingCrossed(Plan.pro(), usage(3, 60 * MINUTE), 3_050)?.ceiling).toBe(
			"concurrentRenders",
		);
	});

	it("is always the first ceiling for a plan with no hosted renders", () => {
		expect(renderCeilingCrossed(Plan.free(), usage(0, 0), 3_050)?.ceiling).toBe(
			"concurrentRenders",
		);
	});
});
