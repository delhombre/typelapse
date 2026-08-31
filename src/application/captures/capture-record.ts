export interface CaptureRecord {
	id: string;
	createdAt: number;
	projectId: string | null;
	projectTitle: string;
	filename: string;
	mimeType: string;
	bytes: number;
	blob: Blob;
}

export type CaptureKind = "image" | "video";

export function captureKind(mimeType: string): CaptureKind {
	return mimeType.startsWith("video/") ? "video" : "image";
}

export function sortCaptures(captures: readonly CaptureRecord[]): CaptureRecord[] {
	return [...captures].sort((a, b) => b.createdAt - a.createdAt);
}

export function formatCaptureBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Number((bytes / 1024).toFixed(1))} KB`;
	}
	return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}
