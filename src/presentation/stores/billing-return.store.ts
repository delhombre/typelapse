import type { BillingReturnPhase } from "@/presentation/utils/billing-return";
import { create } from "zustand";

/**
 * What the sheet after a successful checkout shows. The poll that fills it
 * outlives the component that started it (StrictMode remounts the boot, and the
 * payment's webhook can land twenty seconds late), so the phase lives here
 * rather than in a component.
 *
 * A sheet that was closed stays closed: once the person has dismissed it, the
 * poll finishing later says nothing, so a success is announced once and never
 * reopens over their work.
 */
interface BillingReturnState {
	/** Null while there is no sheet to show. */
	phase: BillingReturnPhase | null;
	/**
	 * The account lapsed before this payment (the server still carried an ended
	 * plan's notice when the person came back), so the sheet also says what the
	 * new plan does for the renders they made before.
	 */
	lapsed: boolean;
	dismissed: boolean;
	show: (phase: BillingReturnPhase) => void;
	markLapsed: () => void;
	dismiss: () => void;
	reset: () => void;
}

export const useBillingReturnStore = create<BillingReturnState>((set, get) => ({
	phase: null,
	lapsed: false,
	dismissed: false,
	show: (phase) => {
		if (!get().dismissed) {
			set({ phase });
		}
	},
	markLapsed: () => set({ lapsed: true }),
	dismiss: () => set({ phase: null, dismissed: true }),
	reset: () => set({ phase: null, lapsed: false, dismissed: false }),
}));
