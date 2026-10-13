import { cornerRowPlan } from "@/application/layout/corner-row";
import { describe, expect, it } from "vitest";

describe("what lives in the phone's corner row", () => {
	it("keeps every resource in the row under a fine pointer, and the project chip split in its parts", () => {
		expect(cornerRowPlan({ coarse: false })).toEqual({
			row: ["source", "library", "showcase"],
			more: [],
			projectChipIsOneTarget: false,
		});
	});

	it("moves the browse actions into More under a finger and keeps Add source in the row", () => {
		expect(cornerRowPlan({ coarse: true })).toEqual({
			row: ["source"],
			more: ["showcase", "library"],
			projectChipIsOneTarget: true,
		});
	});

	it("never puts a resource in both places", () => {
		for (const coarse of [false, true]) {
			const plan = cornerRowPlan({ coarse });
			const moved: readonly string[] = plan.more;
			expect(plan.row.filter((id) => moved.includes(id))).toEqual([]);
			expect([...plan.row, ...plan.more].sort()).toEqual(["library", "showcase", "source"]);
		}
	});
});
