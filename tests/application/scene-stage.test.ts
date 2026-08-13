import {
	CARD_SLOT,
	SHEET_LIFT,
	SHEET_SCALE,
	dockTransform,
	stageTransform,
} from "@/application/layout/scene-stage";
import { describe, expect, it } from "vitest";

describe("the scene's stage geometry", () => {
	it("leaves the stage where it is while the card is open", () => {
		expect(stageTransform({ folded: false, sheetRaised: false })).toEqual({
			x: 0,
			y: 0,
			scale: 1,
		});
	});

	it("slides the stage back by half the card's slot when the card folds", () => {
		// The stage's box always reserves the card's width on its left, so the
		// object sits right of centre while the card is open. Folding does not
		// resize that box — it slides what is in it onto the page's own centre
		// line, which is half the reserved slot to the left.
		expect(stageTransform({ folded: true, sheetRaised: false }).x).toBe(-CARD_SLOT / 2);
	});

	it("steps the stage back and lifts it when a sheet rises", () => {
		const transform = stageTransform({ folded: false, sheetRaised: true });
		expect(transform.scale).toBe(SHEET_SCALE);
		expect(transform.y).toBe(SHEET_LIFT);
		expect(transform.y).toBeLessThan(0);
	});

	it("composes the fold and the raise, since either can happen under the other", () => {
		expect(stageTransform({ folded: true, sheetRaised: true })).toEqual({
			x: -CARD_SLOT / 2,
			y: SHEET_LIFT,
			scale: SHEET_SCALE,
		});
	});

	it("keeps the stage still, at full size, once motion has been declined", () => {
		// Reduced motion asks for less movement, not for a different layout: the
		// recentre still has to happen or the object sits off-centre for good.
		// What goes is the step-back, which is decoration answering a panel.
		const transform = stageTransform({ folded: true, sheetRaised: true }, true);
		expect(transform).toEqual({ x: -CARD_SLOT / 2, y: 0, scale: 1 });
	});

	it("moves the dock on the stage's own centre line, and only there", () => {
		expect(dockTransform({ folded: false, sheetRaised: false })).toEqual({ x: 0 });
		expect(dockTransform({ folded: true, sheetRaised: false })).toEqual({ x: -CARD_SLOT / 2 });
		// A raised sheet steps the stage back; the instrument that raised it does
		// not move, or the press that closes it would slide out from under the
		// finger.
		expect(dockTransform({ folded: false, sheetRaised: true })).toEqual({ x: 0 });
	});
});
