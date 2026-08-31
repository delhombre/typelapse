import {
	type CaptureRecord,
	captureKind,
	formatCaptureBytes,
} from "@/application/captures/capture-record";
import { browserCaptureLibrary } from "@/infrastructure/captures/browser-capture-library";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Library, X } from "reicon-react";

export function CaptureLibrary() {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [captures, setCaptures] = useState<CaptureRecord[]>([]);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		setCaptures(await browserCaptureLibrary.list());
		setLoading(false);
	}, []);

	useEffect(() => browserCaptureLibrary.subscribe(() => void refresh()), [refresh]);
	useEffect(() => {
		if (open) {
			void refresh();
		}
	}, [open, refresh]);

	const close = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	return (
		<>
			<motion.button
				ref={triggerRef}
				type="button"
				aria-label="Library"
				aria-haspopup="dialog"
				aria-expanded={open}
				className="sc-island-trigger sc-library-trigger"
				whileTap={{ scale: 0.97 }}
				transition={springs.snappy}
				onClick={() => {
					feedback("selection");
					setOpen(true);
				}}
			>
				<Library size={14} aria-hidden="true" />
				<span>Library</span>
			</motion.button>

			<StudioBottomSheet
				open={open}
				onClose={close}
				labelledBy="capture-library-title"
				className="capture-library-sheet"
			>
				<header className="studio-sheet-header">
					<div>
						<h2 id="capture-library-title">Capture library</h2>
						<p>Exports stay on this device and remain available across local projects.</p>
					</div>
					<button type="button" onClick={close} aria-label="Close capture library">
						<X size={14} aria-hidden="true" />
					</button>
				</header>

				{loading ? (
					<div className="capture-library-empty" aria-live="polite">
						<span className="capture-library-spinner" aria-hidden="true" />
						<p>Opening library…</p>
					</div>
				) : captures.length === 0 ? (
					<div className="capture-library-empty">
						<span className="capture-library-empty-icon" aria-hidden="true">
							<Library size={14} aria-hidden="true" />
						</span>
						<strong>No captures yet</strong>
						<p>Export a PNG, GIF, MP4 or WebM and it will appear here.</p>
					</div>
				) : (
					<div className="capture-library-grid">
						{captures.map((capture) => (
							<CaptureCard key={capture.id} capture={capture} />
						))}
					</div>
				)}
			</StudioBottomSheet>
		</>
	);
}

function CaptureCard({ capture }: { capture: CaptureRecord }) {
	const [url, setUrl] = useState<string | null>(null);
	const kind = captureKind(capture.mimeType);

	useEffect(() => {
		if (typeof URL.createObjectURL !== "function") {
			return;
		}
		const next = URL.createObjectURL(capture.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [capture.blob]);

	const download = () => {
		if (!url) {
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = capture.filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		feedback("success");
	};

	return (
		<article className="capture-card">
			<div className="capture-card-preview">
				{url && kind === "video" ? (
					<video src={url} muted playsInline preload="metadata" aria-label={capture.filename} />
				) : url ? (
					<img src={url} alt="" />
				) : (
					<span aria-hidden="true">
						<Library size={14} />
					</span>
				)}
				<span className="capture-card-format">
					{capture.filename.split(".").pop()?.toUpperCase()}
				</span>
			</div>
			<footer>
				<div>
					<strong>{capture.projectTitle}</strong>
					<span>
						{formatDate(capture.createdAt)} · {formatCaptureBytes(capture.bytes)}
					</span>
				</div>
				<button
					type="button"
					onClick={download}
					disabled={!url}
					aria-label={`Download ${capture.filename}`}
				>
					<Download size={14} aria-hidden="true" />
				</button>
			</footer>
		</article>
	);
}

function formatDate(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);
}
