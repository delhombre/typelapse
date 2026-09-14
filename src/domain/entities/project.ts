import type { Asset } from "./asset";
import type { AudioCue } from "./audio-cue";
import type { Block } from "./block";
import { MAX_RENDER_DIMENSION, MIN_RENDER_DIMENSION } from "./render-config";
import type { Scene } from "./scene";

export interface CanvasSettings {
	readonly width: number;
	readonly height: number;
	readonly background: string;
}

export interface ProjectCreateProps {
	readonly id?: string;
	readonly title: string;
	readonly canvas: CanvasSettings;
	readonly assets?: readonly Asset[];
	readonly audioCues?: readonly AudioCue[];
	readonly scenes: readonly Scene[];
}

interface ProjectState {
	readonly id: string;
	readonly title: string;
	readonly canvas: CanvasSettings;
	readonly assets: readonly Asset[];
	readonly audioCues: readonly AudioCue[];
	readonly scenes: readonly Scene[];
}

function normalizeCanvas(canvas: CanvasSettings): Readonly<CanvasSettings> {
	const validDimension = (value: number) =>
		Number.isSafeInteger(value) && value >= MIN_RENDER_DIMENSION && value <= MAX_RENDER_DIMENSION;
	if (!validDimension(canvas.width) || !validDimension(canvas.height)) {
		throw new Error("Project canvas dimensions must be supported integers");
	}
	if (!canvas.background.trim()) {
		throw new Error("Project canvas background must not be empty");
	}
	return Object.freeze({ ...canvas });
}

function assertUniqueEntityIds(
	id: string,
	assets: readonly Asset[],
	scenes: readonly Scene[],
	audioCues: readonly AudioCue[],
): void {
	const seen = new Set<string>();
	const add = (entityId: string) => {
		if (seen.has(entityId)) {
			throw new Error(`Project entity ids must be globally unique: ${entityId}`);
		}
		seen.add(entityId);
	};

	add(id);
	for (const asset of assets) {
		add(asset.id);
	}
	for (const scene of scenes) {
		add(scene.id);
		for (const block of scene.blocks) {
			add(block.id);
		}
	}
	for (const cue of audioCues) {
		add(cue.id);
	}
}

function assertAssetReferences(
	assets: readonly Asset[],
	scenes: readonly Scene[],
	audioCues: readonly AudioCue[],
): void {
	const byId = new Map(assets.map((asset) => [asset.id, asset]));
	for (const scene of scenes) {
		for (const block of scene.blocks) {
			if (block.kind === "image") {
				const asset = byId.get(block.assetId);
				if (!asset) {
					throw new Error(`Block '${block.id}' references missing asset '${block.assetId}'`);
				}
				if (asset.kind !== "image") {
					throw new Error(`Image block '${block.id}' must reference an image asset`);
				}
				continue;
			}
			if (block.kind !== "video") {
				continue;
			}
			const asset = byId.get(block.assetId);
			if (!asset) {
				throw new Error(`Block '${block.id}' references missing asset '${block.assetId}'`);
			}
			if (asset.metadata.kind !== "video") {
				throw new Error(`Video block '${block.id}' must reference a video asset`);
			}
			if (block.trim.endMs > asset.metadata.durationMs) {
				throw new Error(`Video block '${block.id}' trim exceeds asset duration`);
			}
		}
	}
	for (const cue of audioCues) {
		const asset = byId.get(cue.assetId);
		if (!asset) {
			throw new Error(`Audio cue '${cue.id}' references missing asset '${cue.assetId}'`);
		}
		if (asset.metadata.kind !== "audio") {
			throw new Error(`Audio cue '${cue.id}' must reference an audio asset`);
		}
		if (cue.trim.endMs > asset.metadata.durationMs) {
			throw new Error(`Audio cue '${cue.id}' trim exceeds asset duration`);
		}
	}
}

function projectDurationMs(scenes: readonly Scene[], audioCues: readonly AudioCue[]): number {
	let visualDurationMs = 0;
	for (const scene of scenes) {
		visualDurationMs += scene.durationMs + (scene.transitionOut?.durationMs ?? 0);
		if (!Number.isSafeInteger(visualDurationMs)) {
			throw new Error("Project visual duration must be a safe integer");
		}
	}
	const audioDurationMs = audioCues.reduce((endMs, cue) => Math.max(endMs, cue.endMs), 0);
	return Math.max(visualDurationMs, audioDurationMs);
}

function validateState(state: ProjectState): void {
	if (!state.id.trim()) {
		throw new Error("Project id must not be empty");
	}
	if (!state.title.trim()) {
		throw new Error("Project title must not be empty");
	}
	if (!state.scenes.some((scene) => scene.blocks.length > 0) && state.audioCues.length === 0) {
		throw new Error("Project must contain a visual block or an audio cue");
	}
	assertUniqueEntityIds(state.id, state.assets, state.scenes, state.audioCues);
	assertAssetReferences(state.assets, state.scenes, state.audioCues);
	projectDurationMs(state.scenes, state.audioCues);
}

/** Aggregate root for a single ordered multimedia timeline. */
export class Project {
	readonly id: string;
	readonly title: string;
	readonly canvas: Readonly<CanvasSettings>;
	readonly assets: readonly Asset[];
	readonly audioCues: readonly AudioCue[];
	readonly scenes: readonly Scene[];
	readonly durationMs: number;

	private constructor(state: ProjectState) {
		this.id = state.id;
		this.title = state.title;
		this.canvas = normalizeCanvas(state.canvas);
		this.assets = Object.freeze([...state.assets]);
		this.audioCues = Object.freeze([...state.audioCues]);
		this.scenes = Object.freeze([...state.scenes]);
		this.durationMs = projectDurationMs(state.scenes, state.audioCues);
		Object.freeze(this);
	}

	private static from(state: ProjectState): Project {
		validateState(state);
		return new Project(state);
	}

	static create(props: ProjectCreateProps): Project {
		const state: ProjectState = {
			id: props.id ?? crypto.randomUUID(),
			title: props.title,
			canvas: props.canvas,
			assets: props.assets ?? [],
			audioCues: props.audioCues ?? [],
			scenes: props.scenes,
		};
		return Project.from(state);
	}

	registerAsset(asset: Asset): Project {
		return Project.from({ ...this, assets: [...this.assets, asset] });
	}

	rename(title: string): Project {
		return Project.from({ ...this, title: title.trim() });
	}

	updateCanvas(canvas: CanvasSettings): Project {
		return Project.from({ ...this, canvas });
	}

	addScene(scene: Scene, index = this.scenes.length): Project {
		if (!Number.isSafeInteger(index) || index < 0 || index > this.scenes.length) {
			throw new Error("Scene insertion index is out of bounds");
		}
		const scenes = [...this.scenes];
		scenes.splice(index, 0, scene);
		return Project.from({ ...this, scenes });
	}

	replaceScene(replacement: Scene): Project {
		if (!this.scenes.some((scene) => scene.id === replacement.id)) {
			throw new Error(`Scene ${replacement.id} does not belong to project`);
		}
		return Project.from({
			...this,
			scenes: this.scenes.map((scene) => (scene.id === replacement.id ? replacement : scene)),
		});
	}

	removeScene(sceneId: string): Project {
		if (!this.scenes.some((scene) => scene.id === sceneId)) {
			throw new Error(`Scene ${sceneId} does not belong to project`);
		}
		return Project.from({
			...this,
			scenes: this.scenes.filter((scene) => scene.id !== sceneId),
		});
	}

	addAudioCue(cue: AudioCue): Project {
		return Project.from({ ...this, audioCues: [...this.audioCues, cue] });
	}

	replaceAudioCue(replacement: AudioCue): Project {
		if (!this.audioCues.some((cue) => cue.id === replacement.id)) {
			throw new Error(`Audio cue ${replacement.id} does not belong to project`);
		}
		return Project.from({
			...this,
			audioCues: this.audioCues.map((cue) => (cue.id === replacement.id ? replacement : cue)),
		});
	}

	removeAudioCue(cueId: string): Project {
		if (!this.audioCues.some((cue) => cue.id === cueId)) {
			throw new Error(`Audio cue ${cueId} does not belong to project`);
		}
		return Project.from({
			...this,
			audioCues: this.audioCues.filter((cue) => cue.id !== cueId),
		});
	}

	reorderScenes(orderedIds: readonly string[]): Project {
		const expected = new Set(this.scenes.map((scene) => scene.id));
		const requested = new Set(orderedIds);
		if (
			orderedIds.length !== this.scenes.length ||
			requested.size !== orderedIds.length ||
			requested.size !== expected.size ||
			orderedIds.some((id) => !expected.has(id))
		) {
			throw new Error("Ordered scene ids must be an exact permutation");
		}
		const byId = new Map(this.scenes.map((scene) => [scene.id, scene]));
		const scenes = orderedIds.map((id) => {
			const scene = byId.get(id);
			if (!scene) {
				throw new Error("Ordered scene ids must be an exact permutation");
			}
			return scene;
		});
		return Project.from({ ...this, scenes });
	}

	replaceBlock(sceneId: string, replacement: Block): Project {
		const scene = this.scenes.find((candidate) => candidate.id === sceneId);
		if (!scene) {
			throw new Error(`Scene ${sceneId} does not belong to project`);
		}
		const updatedScene = scene.replaceBlock(replacement);
		return Project.from({
			...this,
			scenes: this.scenes.map((candidate) => (candidate.id === sceneId ? updatedScene : candidate)),
		});
	}

	addBlock(sceneId: string, block: Block, index?: number): Project {
		const scene = this.scenes.find((candidate) => candidate.id === sceneId);
		if (!scene) {
			throw new Error(`Scene ${sceneId} does not belong to project`);
		}
		return this.replaceScene(scene.addBlock(block, index));
	}

	removeBlock(sceneId: string, blockId: string): Project {
		const scene = this.scenes.find((candidate) => candidate.id === sceneId);
		if (!scene) {
			throw new Error(`Scene ${sceneId} does not belong to project`);
		}
		return this.replaceScene(scene.removeBlock(blockId));
	}

	reorderBlocks(sceneId: string, orderedIds: readonly string[]): Project {
		const scene = this.scenes.find((candidate) => candidate.id === sceneId);
		if (!scene) {
			throw new Error(`Scene ${sceneId} does not belong to project`);
		}
		return this.replaceScene(scene.reorderBlocks(orderedIds));
	}

	removeUnusedAsset(assetId: string): Project {
		if (!this.assets.some((asset) => asset.id === assetId)) {
			throw new Error(`Asset ${assetId} does not belong to project`);
		}
		const isReferenced = this.scenes.some((scene) =>
			scene.blocks.some(
				(block) => (block.kind === "image" || block.kind === "video") && block.assetId === assetId,
			),
		);
		if (isReferenced) {
			throw new Error(`Asset ${assetId} is still referenced by a block`);
		}
		if (this.audioCues.some((cue) => cue.assetId === assetId)) {
			throw new Error(`Asset ${assetId} is still referenced by an audio cue`);
		}
		return Project.from({
			...this,
			assets: this.assets.filter((asset) => asset.id !== assetId),
		});
	}
}
