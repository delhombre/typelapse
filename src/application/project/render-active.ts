/**
 * The one sentence a delete refused for a render in flight is answered with: the
 * server writes it into the 409 and the studio shows it as its own, so the two
 * cannot drift. Queued counts as much as running, since either holds a slot.
 */
export const RENDER_ACTIVE_SENTENCE =
	"A render is queued or running on this project. Delete it once it ends.";

/** A render job that still holds a slot of the account's concurrent renders. */
export function isActiveRenderStatus(status: string): boolean {
	return status === "queued" || status === "running";
}
