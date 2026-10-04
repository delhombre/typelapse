import { feedback } from "@/presentation/haptics";
import { useNoticeStore } from "@/presentation/stores/notice.store";
import { importStudioMediaFiles } from "@/presentation/utils/studio-media-import";
import { useEffect, useState } from "react";

const SLOW_IMPORT_MS = 400;

function carriesFiles(event: DragEvent): boolean {
	return [...(event.dataTransfer?.types ?? [])].includes("Files");
}

/**
 * A file dropped anywhere on the studio is added to the selected scene, or
 * refused with its reason. Without this the browser opened the file in place of
 * the app. The listeners capture on the window, ahead of the code editor, and
 * ignore drags that carry no file (text, timeline rows). Returns whether a file
 * is being dragged over the page, for the drop veil.
 */
export function useStudioFileDrop(): boolean {
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		let depth = 0;
		const onDragEnter = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			depth += 1;
			setDragging(true);
		};
		const onDragOver = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
			setDragging(true);
		};
		const onDragLeave = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) setDragging(false);
		};
		const onDrop = (event: DragEvent) => {
			if (!carriesFiles(event)) return;
			event.preventDefault();
			event.stopPropagation();
			depth = 0;
			setDragging(false);
			const files = [...(event.dataTransfer?.files ?? [])];
			if (files.length === 0) return;
			// Most files land or are refused at once; only a slow one (a long video
			// being hashed) earns a progress notice, so a refusal never follows a flash.
			const { notify, dismiss } = useNoticeStore.getState();
			let progress: number | null = null;
			const slow = setTimeout(() => {
				progress = notify(
					files.length === 1 ? "Adding the file to this scene." : `Adding ${files.length} files.`,
					{ ...(files.length === 1 ? { detail: files[0]?.name } : {}), durationMs: 60_000 },
				);
			}, SLOW_IMPORT_MS);
			void importStudioMediaFiles(files).then((added) => {
				clearTimeout(slow);
				if (progress !== null) dismiss(progress);
				feedback(added > 0 ? "commit" : "error");
			});
		};
		const options = { capture: true } as const;
		window.addEventListener("dragenter", onDragEnter, options);
		window.addEventListener("dragover", onDragOver, options);
		window.addEventListener("dragleave", onDragLeave, options);
		window.addEventListener("drop", onDrop, options);
		return () => {
			window.removeEventListener("dragenter", onDragEnter, options);
			window.removeEventListener("dragover", onDragOver, options);
			window.removeEventListener("dragleave", onDragLeave, options);
			window.removeEventListener("drop", onDrop, options);
		};
	}, []);

	return dragging;
}
