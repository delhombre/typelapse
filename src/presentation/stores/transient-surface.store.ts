import { create } from "zustand";

/**
 * How much room the import's own surface (the status pill, or the replace
 * question) takes at the top of the phone shell, so the notices stack under it
 * instead of over it (after-the-gate D6, #207).
 *
 * Only one of the two is ever on screen, because the question replaces the pill.
 * The surfaces report their measured height; the notice host reads it. It is a
 * number a layout needs, not state the product has, which is why it lives
 * beside the surfaces and not in a domain store.
 */
interface TransientSurfaceState {
	/** The height of the import surface in CSS pixels; 0 when none is on screen. */
	occupied: number;
	setOccupied: (height: number) => void;
}

export const useTransientSurfaceStore = create<TransientSurfaceState>((set) => ({
	occupied: 0,
	setOccupied: (occupied) => set((state) => (state.occupied === occupied ? state : { occupied })),
}));
