import { phonePanelRoom } from "@/application/layout/phone-panel";
import type { PhoneSheetInput, PhoneSheetStop } from "@/application/layout/phone-sheet";
import { type RefObject, useLayoutEffect } from "react";

/** The tallest the island panel may be, published on the dock's slot for `.sc-root-mobile .si-sheet`. */
const PANEL_ROOM_VAR = "--sc-panel-room";

/**
 * Keeps the phone's island panel under the frame.
 *
 * The room is a pure function of the sheet's figures and the frame's height
 * (`phonePanelRoom`), so two things are read from the page. The frame's height,
 * because the frame is the code or the canvas scaled to fit the stage and
 * nothing but the page knows what that came to. And what the dock stacks besides
 * the panel (the export status when there is one, the margin, the plate): the
 * dock's height less the panel's. Both are read off the drawn page, and a scale
 * moves the first without any resize observer hearing of it, so while a panel
 * is open they are followed frame by frame, the way the instrument follows the
 * sheet. Nothing is read with the panels closed, where nothing depends on it,
 * and the last room stays on the slot so a panel that is leaving does not grow
 * back as it goes.
 *
 * The number is written to the slot's style and not held in state: it moves
 * with every frame of the frame's own fit, and the shell has nothing to
 * re-render for it.
 */
export function usePhoneDockRoom(
	stage: RefObject<HTMLElement | null>,
	dock: RefObject<HTMLElement | null>,
	viewport: PhoneSheetInput,
	stop: PhoneSheetStop,
	panelOpen: boolean,
) {
	useLayoutEffect(() => {
		const slot = dock.current;
		if (!slot || !panelOpen) return;
		let written = "";
		let raf = 0;
		const follow = () => {
			const panel = slot.querySelector<HTMLElement>(".si-sheet");
			if (panel) {
				const shown = stage.current?.querySelector("[data-preview-frame], [data-export-target]");
				const height = shown ? shown.getBoundingClientRect().height : null;
				const rest = slot.offsetHeight - panel.offsetHeight;
				const room = `${phonePanelRoom(viewport, stop, height, rest)}px`;
				if (room !== written) {
					written = room;
					slot.style.setProperty(PANEL_ROOM_VAR, room);
				}
			}
			raf = requestAnimationFrame(follow);
		};
		follow();
		return () => cancelAnimationFrame(raf);
	}, [stage, dock, viewport, stop, panelOpen]);
}
