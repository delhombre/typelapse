export type CodeSendVerdict =
	| { readonly allowed: true }
	| { readonly allowed: false; readonly retryAfterSeconds: number };

export interface CodeSendLimitOptions {
	readonly max: number;
	readonly windowMs: number;
	readonly now?: () => number;
	/** Past this many addresses, those whose window has passed are forgotten. */
	readonly pruneAbove?: number;
}

export interface CodeSendLimit {
	consume(address: string): CodeSendVerdict;
	size(): number;
}

interface Window {
	readonly startedAt: number;
	readonly count: number;
}

/**
 * How many sign-in codes one address may receive in a window.
 *
 * Better Auth's limiter counts per client address and path, which a script on
 * many addresses walks around; this counts per recipient, so one mailbox cannot
 * be flooded with codes whoever asks. In memory, so the ceiling is per instance,
 * like Better Auth's own.
 */
export function createCodeSendLimit({
	max,
	windowMs,
	now = Date.now,
	pruneAbove = 10_000,
}: CodeSendLimitOptions): CodeSendLimit {
	const windows = new Map<string, Window>();

	const prune = (at: number) => {
		for (const [address, window] of windows) {
			if (at - window.startedAt >= windowMs) {
				windows.delete(address);
			}
		}
	};

	return {
		consume(rawAddress) {
			const address = rawAddress.trim().toLowerCase();
			const at = now();
			if (windows.size >= pruneAbove) {
				prune(at);
			}
			const current = windows.get(address);
			if (!current || at - current.startedAt >= windowMs) {
				windows.set(address, { startedAt: at, count: 1 });
				return { allowed: true };
			}
			if (current.count >= max) {
				return {
					allowed: false,
					retryAfterSeconds: Math.max(1, Math.ceil((current.startedAt + windowMs - at) / 1000)),
				};
			}
			windows.set(address, { startedAt: current.startedAt, count: current.count + 1 });
			return { allowed: true };
		},
		size: () => windows.size,
	};
}
