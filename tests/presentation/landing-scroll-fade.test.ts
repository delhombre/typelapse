// @vitest-environment node
import { scrollFades } from "@/presentation/landing/scroll-fade";
import { describe, expect, it } from "vitest";

/* A row that scrolls fades the edge that still has content (design audit D10,
   Craft's scroll fades), and only that edge. */
describe("scrollFades", () => {
	it("fades nothing when the row fits", () => {
		expect(scrollFades({ scrollLeft: 0, clientWidth: 720, scrollWidth: 720 })).toEqual({
			start: false,
			end: false,
		});
	});

	it("fades the far edge at the start, both in the middle, the near edge at the end", () => {
		const row = { clientWidth: 360, scrollWidth: 728 };

		expect(scrollFades({ ...row, scrollLeft: 0 })).toEqual({ start: false, end: true });
		expect(scrollFades({ ...row, scrollLeft: 180 })).toEqual({ start: true, end: true });
		expect(scrollFades({ ...row, scrollLeft: 368 })).toEqual({ start: true, end: false });
	});

	it("reads a sub-pixel scroll at either end as the end", () => {
		const row = { clientWidth: 360, scrollWidth: 728 };

		expect(scrollFades({ ...row, scrollLeft: 0.5 })).toEqual({ start: false, end: true });
		expect(scrollFades({ ...row, scrollLeft: 367.4 })).toEqual({ start: true, end: false });
	});
});
