import { create } from "zustand";

/**
 * The export surface a hosted render sheet belongs to: the island's Export
 * cluster (the phone, and a desktop's preview island) or the desktop rail. Each
 * mounts its own sheet, so the one that opens is the one under the press.
 */
export type CloudSurface = "cluster" | "rail";

interface HostedRenderSheetState {
	/** The surface whose sheet is open; null when none is. */
	openFor: CloudSurface | null;
	/** What had focus when the sheet opened, given it back when the sheet closes. */
	opener: HTMLElement | null;
	show(surface: CloudSurface, opener: HTMLElement | null): void;
	close(): void;
}

/**
 * Whether the sheet that explains a hosted render is open (ux-waves D3). A store
 * rather than a component's state, because two controls open it: Cloud under
 * Where, and the captions caveat's link above Render.
 */
export const useHostedRenderSheetStore = create<HostedRenderSheetState>((set) => ({
	openFor: null,
	opener: null,
	show: (surface, opener) => set({ openFor: surface, opener }),
	close: () => set({ openFor: null }),
}));
