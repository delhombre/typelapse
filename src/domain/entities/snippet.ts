import { RenderConfig } from "./render-config";
import type { Step } from "./step";
import { Theme } from "./theme";

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

	addStep(step: Step): Snippet {
		return new Snippet({
			...this,
			steps: [...this.steps, step],
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
