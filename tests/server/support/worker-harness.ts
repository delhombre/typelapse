import { EventEmitter } from "node:events";
import type { CreatorDatabase } from "../../../server/db/database";

/** A process stand-in a test can send SIGTERM or SIGINT through. */
export class ShutdownSignals extends EventEmitter {
	override once(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.once(event, listener);
	}

	override off(event: "SIGINT" | "SIGTERM", listener: () => void): this {
		return super.off(event, listener);
	}
}

/** A database whose only observable part is whether its pool was closed. */
export function closableDatabase() {
	const pool = { closed: 0 };
	const database = {
		$client: {
			end: async () => {
				pool.closed += 1;
			},
		},
	} as unknown as CreatorDatabase;
	return { database, pool };
}

/**
 * What one claim does in a scripted queue: hand out the next item, or throw.
 * Once the script runs out, every claim comes back empty.
 */
export type ScriptedClaim = "item" | "throws";

export function scriptedClaims<T>(
	script: ReadonlyArray<ScriptedClaim>,
	itemFor: (index: number) => T,
) {
	const remaining = [...script];
	const claims: Array<string | null> = [];
	let handedOut = 0;
	return {
		claims,
		next(): T | null {
			const step = remaining.shift();
			if (step === "throws") {
				claims.push("throws");
				throw new Error("DATABASE_URL=postgres://secret@db/claim-failed");
			}
			if (!step) {
				claims.push(null);
				return null;
			}
			handedOut += 1;
			claims.push(`item-${handedOut}`);
			return itemFor(handedOut);
		},
	};
}

/**
 * The worker's sleep: records each delay and sends SIGTERM after `stopAfter`
 * of them (once by default, so a worker that should have exited fails fast
 * instead of spinning).
 */
export function recordingSleep(signals: ShutdownSignals, stopAfter = 1) {
	const sleeps: number[] = [];
	const sleep = async (delayMs: number) => {
		sleeps.push(delayMs);
		if (sleeps.length === stopAfter) {
			signals.emit("SIGTERM");
		}
	};
	return { sleeps, sleep };
}
