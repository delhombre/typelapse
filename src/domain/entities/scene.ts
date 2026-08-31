import type { Block } from "./block";

export const MAX_SCENE_CAPTION_LENGTH = 80;

export const SCENE_TRANSITION_KINDS = ["cut", "crossfade", "magic-move"] as const;
export type SceneTransitionKind = (typeof SCENE_TRANSITION_KINDS)[number];

export interface SceneTransition {
	readonly kind: SceneTransitionKind;
	readonly durationMs: number;
}

export interface SceneCreateProps {
	readonly id?: string;
	readonly durationMs: number;
	readonly blocks: readonly Block[];
	readonly caption?: string;
	readonly transitionOut?: SceneTransition;
}

function normalizeCaption(caption: string | undefined): string | undefined {
	if (caption === undefined) {
		return undefined;
	}
	if (caption.length > MAX_SCENE_CAPTION_LENGTH) {
		throw new Error(`Scene caption must be at most ${MAX_SCENE_CAPTION_LENGTH} characters`);
	}
	const trimmed = caption.trim();
	return trimmed === "" ? undefined : trimmed;
}

function normalizeTransition(
	transition: SceneTransition | undefined,
): Readonly<SceneTransition> | undefined {
	if (transition === undefined) {
		return undefined;
	}
	if (!SCENE_TRANSITION_KINDS.includes(transition.kind)) {
		throw new Error(`Unsupported scene transition '${transition.kind}'`);
	}
	if (transition.kind === "cut") {
		if (transition.durationMs !== 0) {
			throw new Error("A cut transition must have zero duration");
		}
	} else if (!Number.isSafeInteger(transition.durationMs) || transition.durationMs <= 0) {
		throw new Error("Animated transition duration must be a positive integer");
	}
	return Object.freeze({ ...transition });
}

function validateBlocks(blocks: readonly Block[]): void {
	const ids = new Set(blocks.map((block) => block.id));
	if (ids.size !== blocks.length) {
		throw new Error("Scene block ids must be unique");
	}
}

/** A timed, ordered layer stack. Array order is the scene's z-order. */
export class Scene {
	readonly id: string;
	readonly durationMs: number;
	readonly blocks: readonly Block[];
	readonly caption?: string;
	readonly transitionOut?: Readonly<SceneTransition>;

	private constructor(props: {
		id: string;
		durationMs: number;
		blocks: readonly Block[];
		caption?: string;
		transitionOut?: Readonly<SceneTransition>;
	}) {
		this.id = props.id;
		this.durationMs = props.durationMs;
		this.blocks = props.blocks;
		this.caption = props.caption;
		this.transitionOut = props.transitionOut;
		Object.freeze(this);
	}

	static create(props: SceneCreateProps): Scene {
		if (props.id !== undefined && !props.id.trim()) {
			throw new Error("Scene id must not be empty");
		}
		if (!Number.isSafeInteger(props.durationMs) || props.durationMs <= 0) {
			throw new Error("Scene duration must be a positive integer");
		}
		validateBlocks(props.blocks);
		return new Scene({
			id: props.id ?? crypto.randomUUID(),
			durationMs: props.durationMs,
			blocks: Object.freeze([...props.blocks]),
			caption: normalizeCaption(props.caption),
			transitionOut: normalizeTransition(props.transitionOut),
		});
	}

	hasBlock(blockId: string): boolean {
		return this.blocks.some((block) => block.id === blockId);
	}

	replaceBlock(replacement: Block): Scene {
		if (!this.hasBlock(replacement.id)) {
			throw new Error(`Block ${replacement.id} does not belong to scene`);
		}
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks: this.blocks.map((block) => (block.id === replacement.id ? replacement : block)),
			...(this.caption ? { caption: this.caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	addBlock(block: Block, index = this.blocks.length): Scene {
		if (this.hasBlock(block.id)) {
			throw new Error(`Block ${block.id} already belongs to scene`);
		}
		if (!Number.isSafeInteger(index) || index < 0 || index > this.blocks.length) {
			throw new Error("Block insertion index is out of bounds");
		}
		const blocks = [...this.blocks];
		blocks.splice(index, 0, block);
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks,
			...(this.caption ? { caption: this.caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	removeBlock(blockId: string): Scene {
		if (!this.hasBlock(blockId)) {
			throw new Error(`Block ${blockId} does not belong to scene`);
		}
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks: this.blocks.filter((block) => block.id !== blockId),
			...(this.caption ? { caption: this.caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	reorderBlocks(orderedIds: readonly string[]): Scene {
		const expected = new Set(this.blocks.map((block) => block.id));
		const requested = new Set(orderedIds);
		if (
			orderedIds.length !== this.blocks.length ||
			requested.size !== orderedIds.length ||
			requested.size !== expected.size ||
			orderedIds.some((id) => !expected.has(id))
		) {
			throw new Error("Ordered block ids must be an exact permutation");
		}
		const byId = new Map(this.blocks.map((block) => [block.id, block]));
		const blocks = orderedIds.map((id) => {
			const block = byId.get(id);
			if (!block) {
				throw new Error("Ordered block ids must be an exact permutation");
			}
			return block;
		});
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks,
			...(this.caption ? { caption: this.caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	withDuration(durationMs: number): Scene {
		return Scene.create({
			id: this.id,
			durationMs,
			blocks: this.blocks,
			...(this.caption ? { caption: this.caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	withCaption(caption: string | undefined): Scene {
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks: this.blocks,
			...(caption !== undefined ? { caption } : {}),
			...(this.transitionOut ? { transitionOut: this.transitionOut } : {}),
		});
	}

	withTransition(transitionOut: SceneTransition | undefined): Scene {
		return Scene.create({
			id: this.id,
			durationMs: this.durationMs,
			blocks: this.blocks,
			...(this.caption ? { caption: this.caption } : {}),
			...(transitionOut ? { transitionOut } : {}),
		});
	}
}
