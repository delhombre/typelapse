import { feedback } from "@/presentation/haptics";
import { useDiffImportStore } from "@/presentation/stores/diff-import.store";
import { useShowcaseRequestStore } from "@/presentation/stores/showcase-request.store";
import { Add, ChevronRight } from "reicon-react";

/**
 * What a fresh studio offers where the scene list is empty: the studio already
 * holds sample code, so the first move is to capture it, and the two other ways
 * in (a starter project, a pull request) sit one press away instead of two menus
 * deep. One filled shape (the primary), two quiet rows (DECISIONS D2).
 *
 * The caller decides when it shows (no scene yet and code to capture); it goes
 * away by itself once a scene exists, because the caller stops rendering it.
 * The two rows ask the Showcase and the source hub's diff view to open through
 * their hand-off stores; neither surface is rebuilt here.
 */
export function EmptySceneFork({ onCapture }: { readonly onCapture: () => void }) {
	return (
		<fieldset className="sc-fork">
			<legend className="sr-only">Your first scene</legend>
			<p className="sc-fork-lead">
				Capture the code in the editor as your first scene, or start from something else.
			</p>
			<button type="button" className="sc-fork-action" data-kind="primary" onClick={onCapture}>
				<Add size={13} strokeWidth={1.8} aria-hidden="true" />
				Capture this code
			</button>
			<button
				type="button"
				className="sc-fork-action"
				data-kind="secondary"
				aria-haspopup="dialog"
				onClick={() => {
					feedback("selection");
					useShowcaseRequestStore.getState().request();
				}}
			>
				Start from an example
				<ChevronRight size={12} aria-hidden="true" />
			</button>
			<button
				type="button"
				className="sc-fork-action"
				data-kind="secondary"
				aria-haspopup="dialog"
				onClick={() => {
					feedback("selection");
					// An empty hand-off opens the diff view as it is.
					useDiffImportStore.getState().handOff("");
				}}
			>
				Import a pull request
				<ChevronRight size={12} aria-hidden="true" />
			</button>
		</fieldset>
	);
}
