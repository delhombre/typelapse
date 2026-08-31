import {
	readInterfaceFeedbackPreference,
	writeInterfaceFeedbackPreference,
} from "@/presentation/utils/interface-feedback-preferences";
import { create } from "zustand";

interface InterfaceFeedbackState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
	toggle: () => void;
}

export const useInterfaceFeedbackStore = create<InterfaceFeedbackState>((set, get) => ({
	enabled: readInterfaceFeedbackPreference(),
	setEnabled: (enabled) => {
		writeInterfaceFeedbackPreference(enabled);
		set({ enabled });
	},
	toggle: () => {
		get().setEnabled(!get().enabled);
	},
}));
