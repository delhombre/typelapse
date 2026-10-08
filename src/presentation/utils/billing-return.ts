/**
 * The address checkout sends a person back to: `/app?billing=success` after a
 * payment, `/app?billing=cancelled` after leaving it (billing-service.ts builds
 * both). The studio had no view for either, so the return looked like a plain
 * reload with nothing said about the money.
 */

export type BillingReturn = "success" | "cancelled";

const PARAM = "billing";

/**
 * Read the parameter once and drop it in the same breath, as `takeImportIntent`
 * does for its hash: under StrictMode the mounting effect runs twice, and a
 * parameter that survived the first read would announce the return twice. Other
 * parameters and the hash stay, so a link carrying both still works. An unknown
 * value is scrubbed too, so it is not read on the next mount either.
 */
export function takeBillingReturn(): BillingReturn | null {
	const { pathname, search, hash } = window.location;
	const params = new URLSearchParams(search);
	const value = params.get(PARAM);
	if (value === null) {
		return null;
	}
	params.delete(PARAM);
	const rest = params.toString();
	window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}${hash}`);
	return value === "success" || value === "cancelled" ? value : null;
}
