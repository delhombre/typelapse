import { STAGE_TOP_GAP, phoneSheetGeometry } from "@/application/layout/phone-sheet";
import { useIsDesktop } from "@/presentation/hooks/use-media-query";
import { usePhoneViewport } from "@/presentation/hooks/use-phone-viewport";
import { useTransientSurfaceStore } from "@/presentation/stores/transient-surface.store";
import { type ReactNode, useCallback, useRef } from "react";

interface SurfaceTopProps {
	/** Where the surface starts from 1280px, where the desktop header owns the top. */
	desktop: number | string;
	/** The line to start from, and whether it is the phone's (the notices stack there). */
	children: (top: number | string, phone: boolean) => ReactNode;
}

/**
 * Where a transient surface starts: from 1280px its own desktop line; under it, on
 * the phone shell, one stage gap under the corner row, where the frame starts, from
 * the same figure (`rowBottom`) that places the sheet, so it follows the status bar
 * and the Dynamic Island (after-the-gate D6, #207).
 *
 * The phone's line measures the safe areas through a probe element and an observer,
 * so only the phone's branch mounts them: a desktop studio load adds nothing.
 */
export function SurfaceTop({ desktop, children }: SurfaceTopProps) {
	const isDesktop = useIsDesktop();
	return isDesktop ? children(desktop, false) : <PhoneSurfaceTop>{children}</PhoneSurfaceTop>;
}

function PhoneSurfaceTop({ children }: { children: SurfaceTopProps["children"] }) {
	const viewport = usePhoneViewport();
	return children(phoneSheetGeometry(viewport).rowBottom + STAGE_TOP_GAP, true);
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
