import { resolveBackgroundCss } from "@/application/backgrounds/mesh-gradient";
import { focusLineSet, readLineRanges } from "@/application/focus/line-ranges";
import { frameLineCount } from "@/application/magic-move/engine";
import { TEMPLATE_CATALOG, type TemplateDefinition } from "@/application/templates/catalog";
import { Theme } from "@/domain/entities/theme";
import { FrameChrome, isWindowChrome } from "@/presentation/components/preview/frame-chrome";
import { GrainOverlay } from "@/presentation/components/preview/grain-overlay";
import { LoopingFrames } from "@/presentation/components/preview/looping-frames";
import { StaticCodePoster } from "@/presentation/components/preview/static-code-poster";
import { ConfirmDiscard } from "@/presentation/components/ui/confirm-discard";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import {
	hasStudioWorkToLose,
	openStudioProjectDocument,
} from "@/presentation/utils/studio-project-replacement";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, memo, useCallback, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, Grid, X } from "reicon-react";

const SHOWCASE_THEMES: Record<string, () => Theme> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	frost: Theme.frost,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
};

const SHOWCASE_FEATURES: Record<string, string> = {
	"react-hook": "Magic move",
	"n-plus-one": "Code review",
	"typewriter-debounce": "Typewriter",
	"rate-limiter-walkthrough": "Focus tour",
	"batch-the-query": "Social cut",
	"grow-a-test-suite": "Progressive build",
};

const SHOWCASE_MESH_TIMES: Record<string, number> = {
	"react-hook": 1.2,
	"n-plus-one": 4.6,
	"typewriter-debounce": 7.4,
	"rate-limiter-walkthrough": 9.1,
	"batch-the-query": 12.8,
	"grow-a-test-suite": 16.2,
};

/** The drawer owns its first 300ms; syntax enrichment begins after it settles. */
const POSTER_HIGHLIGHT_DELAY_MS = 420;
const POSTER_HIGHLIGHT_STAGGER_MS = 110;

/** Six real starter projects presented as inspiration, then opened for editing. */
export function TemplateGallery() {
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<TemplateDefinition | null>(null);
	const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const reduce = useReducedMotion() === true;

	const close = useCallback(() => {
		setOpen(false);
		setPending(null);
		setActivePreviewId(null);
		triggerRef.current?.focus();
	}, []);
	const changeActivePreview = useCallback((id: string | null) => {
		setActivePreviewId(id);
	}, []);

	const load = useCallback(
		(template: TemplateDefinition) => {
			openStudioProjectDocument(JSON.stringify(template.project));
			feedback("commit");
			close();
		},
		[close],
	);

	const choose = useCallback(
		(template: TemplateDefinition) => {
			if (hasStudioWorkToLose()) {
				setActivePreviewId(null);
				setPending(template);
				return;
			}
			load(template);
		},
		[load],
	);

	const dismiss = pending ? () => setPending(null) : close;

	return (
		<>
			<motion.button
				ref={triggerRef}
				type="button"
				onClick={() => {
					feedback("selection");
					setOpen(true);
				}}
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label="Showcase"
				className="sc-island-trigger sc-showcase-trigger"
			>
				<Grid size={14} aria-hidden="true" />
				<span>Showcase</span>
			</motion.button>

			<StudioBottomSheet
				open={open}
				onClose={dismiss}
				labelledBy="showcase-title"
				className="showcase-sheet"
			>
				<header className="studio-sheet-header">
					<div>
						<h2 id="showcase-title">Showcase</h2>
						<p>Six real Typelapse projects. Explore the motion, then make one yours.</p>
					</div>
					<button
						type="button"
						onClick={dismiss}
						aria-label={pending ? "Back to showcase" : "Close showcase"}
					>
						{pending ? (
							<ChevronLeft size={14} strokeWidth={1.7} aria-hidden="true" />
						) : (
							<X size={14} strokeWidth={1.7} aria-hidden="true" />
						)}
					</button>
				</header>

				<AnimatePresence mode="wait" initial={false}>
					{pending ? (
						<motion.div
							key="confirm"
							className="showcase-confirm"
							initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
						>
							<TemplateArtwork
								template={pending}
								large
								active={!reduce}
								activated={!reduce}
								reduce={reduce}
							/>
							<div>
								<h3>{pending.name}</h3>
								<p>{pending.description}</p>
								<ConfirmDiscard
									message={`Replace what you have with “${pending.name}”?`}
									confirmLabel="Open example"
									onCancel={() => setPending(null)}
									onConfirm={() => load(pending)}
									className="mt-5"
								/>
							</div>
						</motion.div>
					) : (
						<motion.div key="grid" className="showcase-grid" initial={false} exit={{ opacity: 0 }}>
							{TEMPLATE_CATALOG.map((template, index) => (
								<TemplateCard
									key={template.id}
									template={template}
									reduce={reduce}
									active={activePreviewId === template.id}
									highlightDelayMs={POSTER_HIGHLIGHT_DELAY_MS + index * POSTER_HIGHLIGHT_STAGGER_MS}
									onPreviewChange={changeActivePreview}
									onSelect={choose}
								/>
							))}
						</motion.div>
					)}
				</AnimatePresence>
			</StudioBottomSheet>
		</>
	);
}

const TemplateCard = memo(function TemplateCard({
	template,
	reduce,
	active,
	highlightDelayMs,
	onPreviewChange,
	onSelect,
}: {
	template: TemplateDefinition;
	reduce: boolean;
	active: boolean;
	highlightDelayMs: number;
	onPreviewChange: (id: string | null) => void;
	onSelect: (template: TemplateDefinition) => void;
}) {
	const activate = () => {
		if (reduce) {
			return;
		}
		onPreviewChange(template.id);
	};
	const deactivate = () => onPreviewChange(null);

	return (
		<motion.button
			type="button"
			aria-label={`Open Showcase project ${template.name}`}
			onClick={() => onSelect(template)}
			onPointerEnter={activate}
			onPointerLeave={deactivate}
			onFocus={activate}
			onBlur={deactivate}
			data-template-id={template.id}
			data-preview-active={active ? "" : undefined}
			initial={false}
			whileTap={{ scale: 0.985 }}
			className="showcase-card"
		>
			<TemplateArtwork
				template={template}
				active={active && !reduce}
				activated={active && !reduce}
				reduce={reduce}
				highlightDelayMs={highlightDelayMs}
			/>
			<footer>
				<div className="showcase-card-copy">
					<strong>{template.name}</strong>
					<span className="showcase-card-feature">
						<span
							className="showcase-motion-dot"
							data-active={active ? "" : undefined}
							aria-hidden="true"
						/>
						{SHOWCASE_FEATURES[template.id] ?? "Magic move"}
						<span aria-hidden="true">·</span>
						{template.project.steps.length.toString().padStart(2, "0")} scenes
					</span>
				</div>
				<span className="showcase-card-action" aria-hidden="true">
					Open
					<ArrowUpRight size={12} strokeWidth={1.7} />
				</span>
				<span className="sr-only">{template.description}</span>
			</footer>
		</motion.button>
	);
});

function TemplateArtwork({
	template,
	large = false,
	active = false,
	activated = false,
	reduce = false,
	highlightDelayMs = 0,
}: {
	template: TemplateDefinition;
	large?: boolean;
	active?: boolean;
	activated?: boolean;
	reduce?: boolean;
	highlightDelayMs?: number;
}) {
	const theme = useMemo(
		() => (SHOWCASE_THEMES[template.project.themeName] ?? Theme.aurora)(),
		[template.project.themeName],
	);
	const frames = useMemo(() => {
		const steps = template.project.steps.map((step) => step.code);
		return steps.length > 0 ? steps : [template.project.code];
	}, [template.project.code, template.project.steps]);
	const holds = useMemo(
		() => [...template.project.steps.map((step) => step.duration), 900],
		[template.project.steps],
	);
	const focusSets = useMemo(
		() =>
			template.project.steps.map((step) => {
				const ranges = readLineRanges(step.focus ?? "");
				return ranges && ranges.length > 0
					? focusLineSet(ranges, frameLineCount(step.code))
					: undefined;
			}),
		[template.project.steps],
	);
	const ratio = (template.project.width ?? 1920) / (template.project.height ?? 1080);
	const portrait = ratio < 0.8;
	const chrome = isWindowChrome(template.project.windowChrome)
		? template.project.windowChrome
		: "macos";
	const style = {
		"--showcase-theme-bg": theme.background,
		"--showcase-theme-fg": theme.foreground,
	} as CSSProperties;
	const fontSize = large ? (portrait ? 5.2 : 8.8) : portrait ? 4.1 : 7.2;
	const previewPadding = large ? (portrait ? 5 : 10) : portrait ? 4 : 8;
	const posterCode = frames[frames.length - 1] ?? template.project.code;

	return (
		<div
			className="showcase-artwork"
			data-large={large ? "" : undefined}
			data-active={active ? "" : undefined}
			data-orientation={portrait ? "portrait" : "landscape"}
			data-feature={template.id}
			style={style}
		>
			<div
				className="showcase-video-canvas"
				role="img"
				aria-label={`Real Typelapse preview of ${template.name}`}
				style={{
					aspectRatio: `${ratio}`,
					background: resolveBackgroundCss(
						template.project.background,
						SHOWCASE_MESH_TIMES[template.id] ?? 0,
					),
				}}
			>
				<GrainOverlay />

				<div
					className="showcase-real-frame"
					style={{
						background: theme.background,
						color: theme.foreground,
						borderRadius: Math.max(5, (template.project.borderRadius ?? theme.borderRadius) * 0.68),
					}}
				>
					<FrameChrome
						chrome={chrome}
						title={template.project.title}
						foreground={theme.foreground}
						scale={large ? 0.72 : 0.56}
					/>
					<div className="showcase-code-viewport">
						<StaticCodePoster
							code={posterCode}
							language={template.project.language}
							themeName={template.project.themeName}
							theme={theme}
							fontSize={fontSize}
							lineHeightRatio={1.55}
							padding={previewPadding}
							lineNumbers={template.project.showLineNumbers}
							highlightDelayMs={highlightDelayMs}
						/>
						{activated && (
							<div className="showcase-live-layer" aria-hidden="true">
								<LoopingFrames
									frames={frames}
									holds={holds}
									theme={theme}
									language={template.project.language}
									fontSize={fontSize}
									lineHeightRatio={1.55}
									padding={previewPadding}
									lineNumbers={template.project.showLineNumbers}
									playing={active && !reduce}
									transitionMs={template.project.transitionMs}
									typewriter={template.project.typewriter}
									focusSets={focusSets}
									className="showcase-live-code"
									ariaHidden
								/>
							</div>
						)}
					</div>
				</div>

				{portrait && <span className="showcase-safe-zone" aria-hidden="true" />}
			</div>
		</div>
	);
}
