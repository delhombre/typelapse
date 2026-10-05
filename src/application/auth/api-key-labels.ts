/**
 * The two facts a key's row states in words: when it was last used and when it
 * stops working. Pure, with the clock as an argument, so the island reads them
 * and a test pins them. `timeZone` exists for the tests; the island leaves it
 * to the person's own.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "Last used" is written at most once a minute, so under two it is simply now. */
const JUST_NOW_MS = 2 * MINUTE_MS;
const DAYS_BEFORE_A_DATE = 30;

function dayLabel(date: Date, now: Date, timeZone: string | undefined): string {
	const yearIn = (value: Date) =>
		new Intl.DateTimeFormat("en", { year: "numeric", timeZone }).format(value);
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
		...(yearIn(date) === yearIn(now) ? {} : { year: "numeric" as const }),
		timeZone,
	}).format(date);
}

export function lastUsedLabel(lastUsedAt: Date | null, now: Date, timeZone?: string): string {
	if (lastUsedAt === null) {
		return "Never used";
	}
	// A machine that wrote it a little ahead of this one never reads as the future.
	const elapsed = Math.max(0, now.getTime() - lastUsedAt.getTime());
	if (elapsed < JUST_NOW_MS) {
		return "Used just now";
	}
	if (elapsed < HOUR_MS) {
		return `Used ${Math.floor(elapsed / MINUTE_MS)} min ago`;
	}
	if (elapsed < DAY_MS) {
		return `Used ${Math.floor(elapsed / HOUR_MS)} h ago`;
	}
	const days = Math.floor(elapsed / DAY_MS);
	if (days === 1) {
		return "Used yesterday";
	}
	if (days < DAYS_BEFORE_A_DATE) {
		return `Used ${days} days ago`;
	}
	return `Used ${dayLabel(lastUsedAt, now, timeZone)}`;
}

/** Null for a key that never expires: a row with nothing to warn of says nothing. */
export function expiryLabel(expiresAt: Date | null, now: Date, timeZone?: string): string | null {
	if (expiresAt === null) {
		return null;
	}
	if (expiresAt.getTime() <= now.getTime()) {
		return "Expired";
	}
	return `Expires ${dayLabel(expiresAt, now, timeZone)}`;
}
