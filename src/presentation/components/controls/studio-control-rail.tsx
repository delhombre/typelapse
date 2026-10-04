import { PreviewIsland } from "./preview-island";

/**
 * The scene-table layout gives playback to the timeline and keeps this rail for
 * picture decisions. It deliberately reuses the studio's proven panels instead
 * of creating a second settings system for the new shell.
 */
export function StudioControlRail() {
	return <PreviewIsland variant="timeline" />;
}
