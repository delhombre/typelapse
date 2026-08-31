export const INTERFACE_FEEDBACK_STORAGE_KEY = "typelapse:interface-feedback";
export const DEFAULT_INTERFACE_FEEDBACK = true;

export function parseInterfaceFeedbackPreference(json: string | null): boolean {
	if (json === null) {
		return DEFAULT_INTERFACE_FEEDBACK;
	}
	try {
		const parsed: unknown = JSON.parse(json);
		if (typeof parsed !== "object" || parsed === null) {
			return DEFAULT_INTERFACE_FEEDBACK;
		}
		const value = parsed as Record<string, unknown>;
		if (value.version === 1 && typeof value.enabled === "boolean") {
			return value.enabled;
		}
	} catch {
		// A preference may be forgotten without affecting the project.
	}
	return DEFAULT_INTERFACE_FEEDBACK;
}

export function readInterfaceFeedbackPreference(): boolean {
	try {
		return parseInterfaceFeedbackPreference(
			window.localStorage.getItem(INTERFACE_FEEDBACK_STORAGE_KEY),
		);
	} catch {
		return DEFAULT_INTERFACE_FEEDBACK;
	}
}

export function writeInterfaceFeedbackPreference(enabled: boolean): void {
	try {
		window.localStorage.setItem(
			INTERFACE_FEEDBACK_STORAGE_KEY,
			JSON.stringify({ version: 1, enabled }),
		);
	} catch {
		// The product still responds in this tab when storage is unavailable.
	}
}
