/**
 * The two facts a cloud project's row states in words: how much is in it and when
 * it was last saved. Pure, with the clock as an argument, like the key labels.
 */
import { elapsedLabel } from "../auth/api-key-labels";

export function sceneCountLabel(count: number): string {
	if (count === 0) {
		return "No scenes";
	}
	return count === 1 ? "1 scene" : `${count} scenes`;
}

export function editedLabel(updatedAt: Date, now: Date, timeZone?: string): string {
	return elapsedLabel(updatedAt, now, "Edited", timeZone);
}
