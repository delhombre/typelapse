/**
 * The platform name the browser reports ("macOS", "MacIntel", "Win32"), for the
 * one thing that depends on it: which key a shortcut is called (application/
 * shortcuts). Empty where the browser reports none, which reads as not Apple.
 */
export function currentPlatform(): string {
	if (typeof navigator === "undefined") {
		return "";
	}
	const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
	return nav.userAgentData?.platform || nav.platform || "";
}
