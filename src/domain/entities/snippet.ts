import { RenderConfig } from "./render-config";
import type { Step } from "./step";
import { Theme } from "./theme";

/**
 * The codes the magic move morphs between, one per scene: the live code before
 * any capture, each scene's code after. A blank scene (empty code) has no card,
 * so it holds the nearest scene's code (the next one, else the one before):
 * the card then fades in or out where it stands instead of growing out of an
 * empty window. Pure, so every renderer that lays out a plan (the studio, the
 * server's card) holds the same code on the same blank scene.
 */
export function morphCodes(sceneCodes: readonly string[], liveCode: string): string[] {
	if (sceneCodes.length === 0) {
		return [liveCode];
	}
	const codes = [...sceneCodes];
	let next = "";
	for (let index = codes.length - 1; index >= 0; index -= 1) {
		next = codes[index] || next;
		codes[index] = next;
	}
	let previous = liveCode;
	return codes.map((code) => {
		previous = code || previous;
		return previous;
	});
}

export interface SnippetCreateProps {
	title: string;
	code: string;
	language: string;
	theme?: Theme;
	renderConfig?: RenderConfig;
}

export class Snippet {
	readonly id: string;
	readonly title: string;
	readonly code: string;
	readonly language: string;
	readonly steps: readonly Step[];
	readonly theme: Theme;
	readonly renderConfig: RenderConfig;

	private constructor(props: {
		id: string;
		title: string;
		code: string;
		language: string;
		steps: readonly Step[];
		theme: Theme;
		renderConfig: RenderConfig;
	}) {
		this.id = props.id;
		this.title = props.title;
		this.code = props.code;
		this.language = props.language;
		this.steps = props.steps;
		this.theme = props.theme;
		this.renderConfig = props.renderConfig;
	}

	static create(props: SnippetCreateProps): Snippet {
		if (!props.title.trim()) {
			throw new Error("Snippet title must not be empty");
		}
		if (!props.code.trim()) {
			throw new Error("Snippet code must not be empty");
		}
		return new Snippet({
			id: crypto.randomUUID(),
			title: props.title,
			code: props.code,
			language: props.language,
			steps: [],
			theme: props.theme ?? Theme.midnight(),
			renderConfig: props.renderConfig ?? RenderConfig.defaults(),
		});
	}

	/** The codes the magic move morphs between, one per scene ({@link morphCodes}). */
	morphCodes(): string[] {
		return morphCodes(
			this.steps.map((step) => step.code),
			this.code,
		);
	}

	addStep(step: Step): Snippet {
		return new Snippet({
			...this,
			steps: [...this.steps, step],
		});
	}

	insertStep(step: Step, index: number): Snippet {
		if (!Number.isInteger(index) || index < 0 || index > this.steps.length) {
			throw new Error("Step insertion index must sit inside the timeline");
		}
		const steps = [...this.steps];
		steps.splice(index, 0, step);
		return new Snippet({
			...this,
			steps,
		});
	}

	removeStep(stepId: string): Snippet {
		return new Snippet({
			...this,
			steps: this.steps.filter((s) => s.id !== stepId),
		});
	}

	reorderSteps(orderedIds: string[]): Snippet {
		if (orderedIds.length !== this.steps.length) {
			throw new Error("Ordered IDs must match the number of steps");
		}

		const stepMap = new Map(this.steps.map((s) => [s.id, s]));
		const reordered = orderedIds.map((id) => {
			const step = stepMap.get(id);
			if (!step) {
				throw new Error(`Step with id ${id} not found`);
			}
			return step;
		});

		return new Snippet({
			...this,
			steps: reordered,
		});
	}
}
