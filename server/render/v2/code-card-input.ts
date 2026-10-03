import { type BundledLanguage, type Highlighter, createHighlighter } from "shiki";
import { focusLineSet, parseLineRanges } from "../../../src/application/focus/line-ranges";
import { DEFAULT_TRANSITION_EASING } from "../../../src/application/magic-move/easing";
import { typingHoldIndex } from "../../../src/application/magic-move/typewriter";
import type {
	CodeBlockPayload,
	ProjectDocumentV2,
} from "../../../src/application/project/project-document";
import {
	PRIMARY_CODE_CONTINUITY_KEY,
	hasCodeCard,
} from "../../../src/application/render/composition-slots";
import { morphCodes } from "../../../src/domain/entities/snippet";
import { Theme } from "../../../src/domain/entities/theme";
import {
	resolveShikiLanguage,
	resolveShikiTheme,
} from "../../../src/infrastructure/highlighting/shiki-registry";
import { buildServerMagicMovePlan } from "../../remotion/magic-move-plan";
import type { RenderInput } from "../../remotion/types";

/** The studio's theme table (`snippet.store` opens a project through the same factories). */
const THEMES: Readonly<Record<string, () => Theme>> = {
	midnight: Theme.midnight,
	aurora: Theme.aurora,
	frost: Theme.frost,
	dracula: Theme.dracula,
	"one-dark": Theme.oneDark,
	catppuccin: Theme.catppuccin,
	nord: Theme.nord,
};

let highlighterPromise: Promise<Highlighter> | null = null;

function sharedHighlighter(): Promise<Highlighter> {
	highlighterPromise ??= createHighlighter({ themes: [], langs: [] });
	return highlighterPromise;
}

/** Each scene's card, the primary code block; a blank scene (a title card) has none. */
function sceneCards(document: ProjectDocumentV2): (CodeBlockPayload | undefined)[] {
	return document.project.scenes.map((scene) =>
		hasCodeCard(scene)
			? scene.blocks.find(
					(block): block is CodeBlockPayload =>
						block.kind === "code" && block.continuityKey === PRIMARY_CODE_CONTINUITY_KEY,
				)
			: undefined,
	);
}

function focusLines(focus: string | undefined): number[] | undefined {
	const ranges = focus ? parseLineRanges(focus) : null;
	const lines = ranges ? [...focusLineSet(ranges)] : [];
	return lines.length > 0 ? lines : undefined;
}

/**
 * The code card of a studio project, as the code-only composition draws it.
 *
 * The preview and the painter never draw a code block from its placement: they
 * draw the studio's card, the snippet the project opens into, centred by the
 * shared fit and morphed with magic move. This is that snippet read off the
 * document (the first card's look, every scene's code, hold and caption, the
 * project's tempo), with the magic-move plan laid out here because the
 * highlighter runs in Node, as the code-only route lays out its own.
 *
 * A blank scene holds its neighbour's code (`morphCodes`, as the studio lays
 * out its plan), so the card fades in or out in place; `primaryCodeOpacity`
 * hides it there. Null when no scene has a card.
 */
export async function buildCodeCardInput(input: {
	readonly document: ProjectDocumentV2;
	readonly loop: boolean;
	readonly highlighter?: Highlighter;
}): Promise<RenderInput | null> {
	const { project } = input.document;
	const cards = sceneCards(input.document);
	const present = cards.filter((card): card is CodeBlockPayload => card !== undefined);
	const first = present[0];
	const last = present.at(-1);
	if (!first || !last) {
		return null;
	}
	const codes = morphCodes(
		cards.map((card) => card?.code ?? ""),
		last.code,
	);
	const factory = (THEMES[first.themeName] ?? Theme.midnight)();
	const theme = {
		name: factory.name,
		background: factory.background,
		foreground: factory.foreground,
		fontFamily: first.fontFamily?.trim() ? first.fontFamily : factory.fontFamily,
		fontSize: factory.fontSize,
		borderRadius: first.borderRadius ?? factory.borderRadius,
	};
	const steps = project.scenes.map((scene, index) => {
		const focus = focusLines(cards[index]?.focus);
		return {
			code: codes[index] ?? last.code,
			duration: scene.durationMs,
			...(focus ? { focus } : {}),
			...(scene.caption ? { caption: scene.caption } : {}),
		};
	});

	const highlighter = input.highlighter ?? (await sharedHighlighter());
	const lang = resolveShikiLanguage(first.language);
	const shikiTheme = resolveShikiTheme(theme.name);
	if (!highlighter.getLoadedThemes().includes(shikiTheme)) {
		await highlighter.loadTheme(shikiTheme);
	}
	if (lang !== "text" && !highlighter.getLoadedLanguages().includes(lang)) {
		await highlighter.loadLanguage(lang as BundledLanguage);
	}
	const plan = buildServerMagicMovePlan(
		highlighter,
		steps.map((step) => step.code),
		lang,
		shikiTheme,
		theme.background,
		input.loop,
		steps.map((step) => step.focus),
	);

	return {
		title: project.title,
		language: first.language,
		theme,
		steps,
		background: project.canvas.background,
		windowChrome: first.chrome,
		showLineNumbers: first.showLineNumbers,
		lineNumberStart: first.lineNumberStart,
		framePadding: first.framePadding,
		cardMargin: first.cardMargin,
		plan,
		transitionMs: project.settings.transitionMs,
		transitionEasing: project.settings.transitionEasing ?? DEFAULT_TRANSITION_EASING,
		loop: input.loop,
		typewriter: project.settings.typewriter,
		// A title card first is typed past, as in the studio: the first card is typed.
		typingIndex: typingHoldIndex(cards.map((card) => card?.code ?? "")),
		focusZoom: project.settings.focusZoom,
		progressStyle: project.settings.progressStyle,
		// The multimedia composition draws the mark itself, over every layer.
		...(project.settings.watermark ? { watermark: project.settings.watermark } : {}),
	};
}
