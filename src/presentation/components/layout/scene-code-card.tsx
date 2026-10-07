import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { EditorPresence } from "@/presentation/contexts/editor-presence";
import { useEditorKind } from "@/presentation/hooks/use-editor-kind";
import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "reicon-react";

const LANGUAGES = [
	{ value: "typescript", label: "TypeScript" },
	{ value: "tsx", label: "TSX" },
	{ value: "javascript", label: "JavaScript" },
	{ value: "diff", label: "Diff" },
	{ value: "python", label: "Python" },
	{ value: "rust", label: "Rust" },
	{ value: "go", label: "Go" },
	{ value: "html", label: "HTML" },
	{ value: "css", label: "CSS" },
	{ value: "json", label: "JSON" },
	{ value: "java", label: "Java" },
	{ value: "csharp", label: "C#" },
	{ value: "cpp", label: "C++" },
	{ value: "php", label: "PHP" },
	{ value: "ruby", label: "Ruby" },
	{ value: "swift", label: "Swift" },
	{ value: "kotlin", label: "Kotlin" },
	{ value: "sql", label: "SQL" },
	{ value: "yaml", label: "YAML" },
	{ value: "markdown", label: "Markdown" },
	{ value: "shell", label: "Shell" },
	{ value: "dockerfile", label: "Dockerfile" },
];

/**
 * The work surface, floating on the left of the scene: the editor and the steps
 * in one card that folds away to a vertical tab.
 *
 * Both shapes are always mounted, and the fold is a transform and an opacity
 * across the two of them. That is not a shortcut around a shared-element morph,
 * it is the only version that survives being interrupted: the card holds Monaco,
 * which costs a beat to build and re-lays itself out whenever its box changes,
 * so a fold that unmounted it would stutter on the way out and blink on the way
 * back. Kept mounted, the fold is pure compositing, and a press mid-flight only
 * reverses the springs it is already running.
 *
 * The first time it is unfolded is the first time Monaco is mounted (and so
 * downloaded): a studio that opens in Preview never pays for the editor.
 *
 * Folded, the card is inert rather than merely invisible: hidden work that can
 * still be tabbed into is worse than no work at all.
 */
export function SceneCodeCard({
	folded,
	onFold,
	editor,
	sceneInspector,
}: {
	folded: boolean;
	onFold: (folded: boolean) => void;
	editor: ReactNode;
	sceneInspector: ReactNode;
}) {
	const language = useSnippetStore((s) => s.snippet.language);
	const setLanguage = useSnippetStore((s) => s.setLanguage);
	const editorKind = useEditorKind();
	const isCode = editorKind === "Code";

	return (
		<>
			<motion.div
				className="sc-card"
				data-editor-kind={isCode ? "code" : "layer"}
				animate={{ x: folded ? -22 : 0, opacity: folded ? 0 : 1, scale: folded ? 0.97 : 1 }}
				transition={springs.default}
				style={{ transformOrigin: "left center" }}
				aria-hidden={folded}
				inert={folded}
			>
				<header className="sc-card-head">
					<span className="sc-eyebrow">{editorKind}</span>
					{/* A layer's head is its kind alone: the inspector below names the
					    layer itself, so "Scene layer" here only said "layer" twice. */}
					{isCode ? (
						<select
							value={language}
							onChange={(event) => setLanguage(event.target.value)}
							aria-label="Language"
							className="sc-select"
						>
							{LANGUAGES.map((entry) => (
								<option key={entry.value} value={entry.value}>
									{entry.label}
								</option>
							))}
						</select>
					) : null}
					<span className="sc-card-spacer" />
					{/* `hit-ext`: the glyph is 30px and the header is 44, and nothing else
					    is within 44px of it, so the target can take the whole height the
					    header already leaves rather than only the mark. */}
					<StudioTooltip content={`Fold ${editorKind.toLowerCase()}`} side="bottom">
						<button
							type="button"
							onClick={() => onFold(true)}
							aria-label="Fold the code away"
							className="hit-ext sc-glyph-button"
						>
							<ChevronGlyph direction="left" />
						</button>
					</StudioTooltip>
				</header>

				<div className="sc-card-editor">
					{/* Folded is Preview: the editor is not downloaded for a visit that
					    never leaves it, and stays mounted once it has been shown. */}
					<EditorPresence shown={!folded}>{editor}</EditorPresence>
				</div>

				<div className="sc-card-steps">
					<span className="sc-eyebrow">Scene</span>
					<div className="sc-card-steps-body">{sceneInspector}</div>
				</div>
			</motion.div>

			<StudioTooltip content={`Show ${editorKind.toLowerCase()}`}>
				<motion.button
					type="button"
					onClick={() => onFold(false)}
					className="sc-tab"
					animate={{ x: folded ? 0 : -14, opacity: folded ? 1 : 0, scale: folded ? 1 : 0.9 }}
					// The press has to come from Motion and not from CSS: the fold already
					// writes this element's transform inline, and an inline transform beats
					// a stylesheet's, so a `:active { scale }` rule would simply never show.
					//
					// It carries its own spring, because the element's is the fold's. On
					// `springs.default` the press reached 96% of its 0.04 of travel at 227ms,
					// against 93ms for every CSS press in the scene: inside the 300ms UI
					// budget and still 2.4× slower than the finger that caused it. `snappy`
					// is the spring the rest of the product presses with.
					whileTap={{ scale: 0.97, transition: springs.snappy }}
					transition={springs.default}
					style={{ transformOrigin: "left center" }}
					aria-hidden={!folded}
					inert={!folded}
					aria-label="Bring the code back"
				>
					<ChevronGlyph direction="right" />
					<span className="sc-tab-label">{editorKind.toUpperCase()}</span>
				</motion.button>
			</StudioTooltip>
		</>
	);
}

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
	return direction === "left" ? (
		<ChevronLeft size={13} strokeWidth={2} aria-hidden="true" />
	) : (
		<ChevronRight size={13} strokeWidth={2} aria-hidden="true" />
	);
}
