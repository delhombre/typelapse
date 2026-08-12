import { Logomark } from "@/presentation/components/ui/logomark";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { Link } from "react-router-dom";

/**
 * The project, top left, as a chip rather than a bar.
 *
 * It says the three things a title bar ever said — where you are, what this is
 * called, and how long it runs — and it takes 200px of a corner to say them
 * instead of the full width of the window. The name is the field itself: a
 * title that has to be opened before it can be renamed is a title behind a
 * door, and there is nothing behind this one.
 *
 * It is also the only place the project's name is editable now. The code card
 * used to carry a second field bound to the same value; two inputs for one
 * string is a question about which one is the real one, and the answer was
 * never interesting.
 */
export function ProjectChip() {
	const title = useSnippetStore((s) => s.snippet.title);
	const setTitle = useSnippetStore((s) => s.setTitle);
	const steps = useSnippetStore((s) => s.snippet.steps.length);

	return (
		<div className="sc-chip sc-project">
			<Link to="/" className="sc-brand" title="Back to home" aria-label="Typelapse home">
				<Logomark size={13} />
			</Link>
			<input
				type="text"
				value={title}
				onChange={(event) => setTitle(event.target.value)}
				placeholder="Untitled"
				aria-label="Project name"
				className="sc-title"
			/>
			<span className="sc-steps">{steps === 1 ? "1 step" : `${steps} steps`}</span>
		</div>
	);
}
