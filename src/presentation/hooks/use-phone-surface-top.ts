import { STAGE_TOP_GAP, phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { usePhoneViewport } from "@/presentation/hooks/use-phone-viewport";
import { useTransientSurfaceStore } from "@/presentation/stores/transient-surface.store";
import { useCallback, useRef } from "react";

/**
 * Where a transient surface starts on the phone shell (under 1280px): one stage
 * gap under the corner row, where the frame starts, from the same figure
 * (`rowBottom`) that places the sheet, so it follows the status bar and the
 * Dynamic Island. `null` from 1280px, where the desktop header owns the top and
 * each surface keeps its own line.
 */
export function usePhoneSurfaceTop(): number | null {
	const desktop = useIsDesktop();
	const viewport = usePhoneViewport();
	return desktop ? null : phoneSheetGeometry(viewport).rowBottom + STAGE_TOP_GAP;
}

/**
 * A ref callback for the import's surface: its height is what the notices stack
 * under. It reports 0 again when the surface leaves.
 */
export function useReportTransientSurface(): (element: HTMLElement | null) => void {
	const setOccupied = useTransientSurfaceStore((state) => state.setOccupied);
	const observer = useRef<ResizeObserver | null>(null);

	return useCallback(
		(element: HTMLElement | null) => {
			observer.current?.disconnect();
			observer.current = null;
			if (!element) {
				setOccupied(0);
				return;
			}
			const measure = () => setOccupied(element.offsetHeight);
			measure();
			observer.current = new ResizeObserver(measure);
			observer.current.observe(element);
		},
		[setOccupied],
	);
}
