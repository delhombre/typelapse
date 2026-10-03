import { StudioTooltip } from "@/presentation/components/ui/studio-tooltip";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import {
	useStudioCompositionSelectionStore,
	useStudioCompositionStore,
} from "@/presentation/stores/studio-composition.store";
import { AnimatePresence, motion } from "motion/react";
import type { ComponentType } from "react";
import { Code, Eye, EyeOff, Image, Music, Text, Video } from "reicon-react";

type LayerIcon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

function sceneStartMs(sceneId: string): number {
	const scenes = useStudioCompositionStore.getState().value.project.scenes;
	let elapsed = 0;
	for (const scene of scenes) {
		if (scene.id === sceneId) {
			return elapsed;
		}
		elapsed += scene.durationMs + (scene.transitionOut?.durationMs ?? 0);
	}
	return 0;
}

/**
 * The tooltip is a one-line pill: a 255-character file name would run off the
 * screen. The middle goes, so the start and the extension stay readable.
 */
function shortName(name: string): string {
	return name.length <= 48 ? name : `${name.slice(0, 30)}…${name.slice(-15)}`;
}

function layerIcon(kind: "code" | "text" | "image" | "video"): LayerIcon {
	if (kind === "text") {
		return Text;
	}
	if (kind === "image") {
		return Image;
	}
	if (kind === "video") {
		return Video;
	}
	return Code;
}

/**
 * A contextual layer row inside the accepted scene inspector. It stays absent
 * for code-only projects, so the established Studio has no extra chrome until
 * the user actually composes with another medium.
 */
export function StudioLayerStrip() {
	const composition = useStudioCompositionStore();
	const selectedAudioCueId = useStudioCompositionSelectionStore(
		(state) => state.selectedAudioCueId,
	);
	const selectAudioCue = useStudioCompositionSelectionStore((state) => state.selectAudioCue);
	const scene = composition.value.project.scenes.find(
		(candidate) => candidate.id === composition.selectedSceneId,
	);
	if (!scene) {
		return null;
	}

	const startMs = sceneStartMs(scene.id);
	const endMs = startMs + scene.durationMs;
	const audioCues = composition.value.project.audioCues.filter(
		(cue) => cue.startMs < endMs && cue.endMs > startMs,
	);
	const authoredBlocks = scene.blocks.filter((block) => block.kind !== "code");
	const primaryCode = scene.blocks.find(
		(block) => block.kind === "code" && block.continuityKey === "primary-code",
	);
	// Undo lives with the project, in the header, so the row can leave with its
	// last layer: that deletion stays one Cmd+Z away.
	if (authoredBlocks.length === 0 && audioCues.length === 0) {
		return null;
	}

	// A chip names its file: three images used to read "Image", "Image", "Image".
	const fileNames = new Map(
		composition.value.project.assets.map((asset) => [asset.id, asset.metadata.fileName]),
	);
	const selectCode = () => {
		composition.selectBlock(scene.id, null);
		selectAudioCue(null);
	};
	const selectBlock = (blockId: string) => {
		composition.selectBlock(scene.id, blockId);
		selectAudioCue(null);
	};
	const selectAudio = (cueId: string) => {
		composition.selectBlock(scene.id, null);
		selectAudioCue(cueId);
	};

	return (
		<motion.div
			className="sc-layer-strip"
			initial={{ opacity: 0, y: 3 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springs.snappy}
		>
			<div className="sc-layer-strip-head">
				<span>Layers</span>
				<div>
					{primaryCode ? (
						<StudioTooltip
							content={primaryCode.opacity > 0 ? "Hide code layer" : "Show code layer"}
						>
							<button
								type="button"
								onClick={() => {
									composition.transact((project) =>
										updateCodeLayer(project, scene.id, primaryCode.id, {
											opacity: primaryCode.opacity > 0 ? 0 : 1,
										}),
									);
									feedback("toggle");
								}}
								aria-label={primaryCode.opacity > 0 ? "Hide code layer" : "Show code layer"}
							>
								{primaryCode.opacity > 0 ? (
									<Eye size={13} aria-hidden="true" />
								) : (
									<EyeOff size={13} aria-hidden="true" />
								)}
							</button>
						</StudioTooltip>
					) : null}
				</div>
			</div>
			<div className="sc-layer-pills">
				<LayerPill
					label="Code"
					Icon={Code}
					selected={composition.selectedBlockId === null && selectedAudioCueId === null}
					muted={primaryCode?.opacity === 0}
					onSelect={selectCode}
				/>
				<AnimatePresence initial={false}>
					{authoredBlocks.map((block) => (
						<LayerPill
							key={block.id}
							label={
								block.kind === "text"
									? "Text"
									: (fileNames.get(block.assetId) ?? (block.kind === "image" ? "Image" : "Video"))
							}
							Icon={layerIcon(block.kind)}
							selected={composition.selectedBlockId === block.id && selectedAudioCueId === null}
							onSelect={() => selectBlock(block.id)}
						/>
					))}
					{audioCues.map((cue) => (
						<LayerPill
							key={cue.id}
							label={fileNames.get(cue.assetId) ?? "Audio"}
							Icon={Music}
							selected={selectedAudioCueId === cue.id}
							onSelect={() => selectAudio(cue.id)}
						/>
					))}
				</AnimatePresence>
			</div>
		</motion.div>
	);
}

function LayerPill({
	label,
	Icon,
	selected,
	muted = false,
	onSelect,
}: {
	label: string;
	Icon: LayerIcon;
	selected: boolean;
	muted?: boolean;
	onSelect: () => void;
}) {
	return (
		<StudioTooltip content={shortName(label)}>
			<motion.button
				type="button"
				layout
				initial={{ opacity: 0, scale: 0.92 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.92 }}
				transition={springs.snappy}
				className="sc-layer-pill"
				data-selected={selected ? "" : undefined}
				data-muted={muted ? "" : undefined}
				aria-pressed={selected}
				onClick={onSelect}
			>
				<Icon size={13} aria-hidden={true} />
				<span>{label}</span>
			</motion.button>
		</StudioTooltip>
	);
}
import { updateCodeLayer } from "@/application/project/multimedia-authoring";
