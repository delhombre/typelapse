import type { PhoneSheetGeometry, PhoneSheetStop } from "@/application/layout/phone-sheet";
import { type RefObject, useLayoutEffect } from "react";

/** The offset the drawer wrote for itself: `translate3d(0, 754px, 0)` is 754. */
const OFFSET = /translate3d\(\s*0(?:px)?\s*,\s*(-?[\d.]+)px/;

/**
 * Keeps the phone's instrument on the sheet's edge, frame by frame.
 *
 * The drawer moves the sheet by writing `transform` (and `transition`) on its
 * own element: one write per pointer move while a finger drags, and one write
 * with the settle's transition on release, on a key, or after a rotation. Its
 * `onDrag` callback only reports a share of the distance between two stops,
 * and only at some of them, so the sheet's own style is the one signal that
 * says where it is. A mutation observer reads it in the same task as the write,
 * before the frame is drawn, and puts the instrument where the sheet's height
 * says (`dockLiftAt`). The instrument takes the sheet's transition too, so a
 * settle runs both on the same curve and clock, and none of this is written
 * twice: under reduced motion the global rule drops `transform` from every
 * transition, and both jump together.
 *
 * Until the drawer has written anything the instrument rests where the stop
 * the sheet opens on puts it, and while the sheet is being placed there on open
 * (`data-opening`, `app.css`) it is placed without a transition too: the
 * instrument is where it rests from the first frame, never riding up to it.
 */
export function useDockFollowsSheet(
	sheet: HTMLElement | null,
	dock: RefObject<HTMLElement | null>,
	geometry: PhoneSheetGeometry,
	stop: PhoneSheetStop,
) {
	useLayoutEffect(() => {
		const slot = dock.current;
		if (!slot) return;
		const place = (lift: number, transition: string) => {
			slot.style.transition = transition;
			slot.style.transform = `translate3d(0, ${-lift}px, 0)`;
		};
		const follow = () => {
			const written = sheet ? OFFSET.exec(sheet.style.transform) : null;
			if (!sheet || !written) return place(geometry.dockLift(stop), "none");
			const visible = sheet.offsetHeight - Number.parseFloat(written[1] ?? "0");
			const opening = sheet.hasAttribute("data-opening");
			place(geometry.dockLiftAt(visible), opening ? "none" : sheet.style.transition || "none");
		};
		follow();
		if (!sheet) return;
		const observer = new MutationObserver(follow);
		observer.observe(sheet, { attributes: true, attributeFilter: ["style"] });
		return () => observer.disconnect();
	}, [sheet, dock, geometry, stop]);
}
