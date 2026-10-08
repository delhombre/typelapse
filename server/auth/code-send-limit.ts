export type CodeSendVerdict =
	| { readonly allowed: true }
	| { readonly allowed: false; readonly retryAfterSeconds: number };

export interface CodeSendLimitOptions {
	readonly max: number;
	readonly windowMs: number;
	readonly now?: () => number;
}

export interface CodeSendLimit {
	/** What a send would get now, counting nothing. */
	check(key: string): CodeSendVerdict;
	/** Count a send. Call only after every ceiling has said yes. */
	record(key: string): void;
	size(): number;
}

interface Window {
	readonly startedAt: number;
	readonly count: number;
}

/**
 * A fixed window per key, in memory: the ceiling is per instance, like Better
 * Auth's own limiter. The map is kept in the order windows started, so the ones
 * that have passed are always at its front and every write drops them: memory
 * holds only the keys seen within one window.
 */
export function createCodeSendLimit({
	max,
	windowMs,
	now = Date.now,
}: CodeSendLimitOptions): CodeSendLimit {
	const windows = new Map<string, Window>();

	const forgetPassed = (at: number) => {
		for (const [key, window] of windows) {
			if (at - window.startedAt < windowMs) {
				return;
			}
			windows.delete(key);
		}
	};

	const current = (key: string, at: number) => {
		const window = windows.get(key);
		return window && at - window.startedAt < windowMs ? window : null;
	};

	return {
		check(key) {
			const at = now();
			const window = current(key, at);
			if (!window || window.count < max) {
				return { allowed: true };
			}
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + windowMs - at) / 1000)),
			};
		},
		record(key) {
			const at = now();
			forgetPassed(at);
			const window = current(key, at);
			if (window) {
				windows.set(key, { startedAt: window.startedAt, count: window.count + 1 });
				return;
			}
			// A new window goes to the back, so the map stays in start order.
			windows.delete(key);
			windows.set(key, { startedAt: at, count: 1 });
		},
		size: () => windows.size,
	};
}

export interface CodeSendCeilingsOptions {
	readonly now?: () => number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Every ceiling on sending a sign-in code that does not depend on who asks:
 *
 * - ten codes an hour to one address, and twenty a day, so one mailbox cannot be
 *   flooded whoever asks, from however many clients;
 * - two hundred codes an hour from this instance, whatever the addresses, a
 *   backstop for the sending domain's reputation when the per-client limit is
 *   walked around with many client addresses.
 *
 * A send counts against every ceiling or none: one that is refused spends nothing.
 */
export function createCodeSendCeilings({ now = Date.now }: CodeSendCeilingsOptions = {}) {
	const addressHour = createCodeSendLimit({ max: 10, windowMs: HOUR, now });
	const addressDay = createCodeSendLimit({ max: 20, windowMs: DAY, now });
	const instanceHour = createCodeSendLimit({ max: 200, windowMs: HOUR, now });

	return {
		consume(rawAddress: string): CodeSendVerdict {
			const address = rawAddress.trim().toLowerCase();
			const checks: [CodeSendLimit, string][] = [
				[addressHour, address],
				[addressDay, address],
				[instanceHour, "*"],
			];
			const refusals = checks
				.map(([limit, key]) => limit.check(key))
				.filter(
					(verdict): verdict is Extract<CodeSendVerdict, { allowed: false }> => !verdict.allowed,
				);
			if (refusals.length > 0) {
				return {
					allowed: false,
					retryAfterSeconds: Math.max(...refusals.map((verdict) => verdict.retryAfterSeconds)),
				};
			}
			for (const [limit, key] of checks) {
				limit.record(key);
			}
			return { allowed: true };
		},
		/** How many addresses the per-address ceilings hold right now. */
		addressesHeld: () => Math.max(addressHour.size(), addressDay.size()),
	};
}
