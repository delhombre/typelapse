export { diffToSnapshots } from "./diff-to-snapshots";
export { parseUnifiedDiff } from "./parse-unified-diff";
export { generateSnapshots, normalizeSnapshots } from "./snapshots";
export type {
	CodeSnapshot,
	DiffFile,
	DiffHunk,
	DiffLine,
	DiffLineType,
	DiffStepMode,
	DiffToSnapshotsOptions,
	DiffToSnapshotsResult,
	GenerateSnapshotsOptions,
	ParsedDiff,
} from "./types";
export {
	CONTEXT_LINES,
	ELLIPSIS,
	MERGE_GAP,
	computeHunkWindows,
	fileHeaderLine,
	filterLockfiles,
	isLockfile,
	planWindows,
	renderWindowedStage,
} from "./windowing";
export type { FileWindowPlan, LineWindow } from "./windowing";
