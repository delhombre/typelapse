import {
	isStudioPersistenceHeld,
	onStudioPersistenceRelease,
} from "@/presentation/stores/studio-composition.store";

/**
 * Whether the composition on screen is the open project's own. It is not while
 * the boot restore reads the stored project (about half a second) or while the
 * project chip swaps projects: a layer added then lands on a document that the
 * restore is about to replace, and the import silently disappears. Imports wait
 * on this instead.
 */
// Open until the bridge mounts: its effect closes the gate before any input can
// reach a picker, and a surface rendered without the bridge has nothing to wait on.
let restored = true;
const waiting = new Set<() => void>();

function isReady(): boolean {
	return restored && !isStudioPersistenceHeld();
}

function notify(): void {
	for (const check of [...waiting]) {
		check();
	}
}

onStudioPersistenceRelease(notify);

/** The bridge calls this when its restore starts (false) and ends (true). */
export function setStudioCompositionRestored(value: boolean): void {
	restored = value;
	if (value) {
		notify();
	}
}

/** Resolves once the open project's composition is on screen. */
export function whenStudioCompositionReady(): Promise<void> {
	if (isReady()) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const check = () => {
			if (isReady()) {
				waiting.delete(check);
				resolve();
			}
		};
		waiting.add(check);
	});
}
