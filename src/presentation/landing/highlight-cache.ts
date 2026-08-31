// Compatibility barrel for the landing tests and older imports. The cache is a
// presentation primitive now that both marketing frames and studio posters use it.
export {
	clearHighlightCache,
	highlightCacheKey,
	highlightOnce,
	readHighlight,
} from "@/presentation/utils/highlight-cache";
