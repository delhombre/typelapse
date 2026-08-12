import { springs } from "@/presentation/motion";
import { useSnippetStore } from "@/presentation/stores/snippet.store";
import { motion } from "motion/react";
import type { ReactNode } from "react";

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
 * Folded, the card is inert rather than merely invisible: hidden work that can
 * still be tabbed into is worse than no work at all.
 */
export function SceneCodeCard({
	folded,
	onFold,
	editor,
	stepBuilder,
}: {
	folded: boolean;
	onFold: (folded: boolean) => void;
	editor: ReactNode;
	stepBuilder: ReactNode;
}) {
	const language = useSnippetStore((s) => s.snippet.language);
	const setLanguage = useSnippetStore((s) => s.setLanguage);

	return (
		<>
			<motion.div
				className="sc-card"
				animate={{ x: folded ? -22 : 0, opacity: folded ? 0 : 1, scale: folded ? 0.97 : 1 }}
				transition={springs.default}
				style={{ transformOrigin: "left center" }}
				aria-hidden={folded}
				inert={folded}
			>
				<header className="sc-card-head">
					<span className="sc-eyebrow">Code</span>
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
					<span className="sc-card-spacer" />
					<button
						type="button"
						onClick={() => onFold(true)}
						aria-label="Fold the code away"
						title="Fold the code away"
						className="sc-glyph-button"
					>
						<ChevronGlyph direction="left" />
					</button>
				</header>

				<div className="sc-card-editor">{editor}</div>

				<div className="sc-card-steps">
					<span className="sc-eyebrow">Steps</span>
					<div className="sc-card-steps-body">{stepBuilder}</div>
				</div>
			</motion.div>

			<motion.button
				type="button"
				onClick={() => onFold(false)}
				className="sc-tab"
				animate={{ x: folded ? 0 : -14, opacity: folded ? 1 : 0, scale: folded ? 1 : 0.9 }}
				transition={springs.default}
				style={{ transformOrigin: "left center" }}
				aria-hidden={!folded}
				inert={!folded}
				aria-label="Bring the code back"
				title="Bring the code back"
			>
				<ChevronGlyph direction="right" />
				<span className="sc-tab-label">CODE</span>
			</motion.button>
		</>
	);
}

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
		</svg>
	);
}
