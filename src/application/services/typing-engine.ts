/**
 * Computes intermediate typing frames between two code states.
 *
 * Strategy: find the longest common prefix, then:
 * 1. Delete characters from the old suffix (right to left)
 * 2. Type characters of the new suffix (left to right)
 *
 * This simulates a developer editing code at the divergence point.
 */
export function computeTypingFrames(source: string, target: string, maxFrames: number): string[] {
	if (source === target) {
		return [target];
	}

	// Find longest common prefix
	let prefixLen = 0;
	const minLen = Math.min(source.length, target.length);
	while (prefixLen < minLen && source[prefixLen] === target[prefixLen]) {
		prefixLen++;
	}

	const prefix = source.slice(0, prefixLen);
	const oldSuffix = source.slice(prefixLen);
	const newSuffix = target.slice(prefixLen);

	const frames: string[] = [];

	// Phase 1: Delete old suffix characters (right to left)
	for (let i = oldSuffix.length - 1; i >= 0; i--) {
		frames.push(prefix + oldSuffix.slice(0, i));
	}

	// Phase 2: Type new suffix characters (left to right)
	for (let i = 1; i <= newSuffix.length; i++) {
		frames.push(prefix + newSuffix.slice(0, i));
	}

	// If we generated more frames than requested, sample evenly
	if (frames.length > maxFrames) {
		const sampled: string[] = [];
		for (let i = 0; i < maxFrames - 1; i++) {
			const idx = Math.round((i * (frames.length - 1)) / (maxFrames - 1));
			const frame = frames[idx];
			if (frame !== undefined) {
				sampled.push(frame);
			}
		}
		const last = frames[frames.length - 1];
		if (last !== undefined) {
			sampled.push(last);
		}
		return sampled;
	}

	return frames;
}
