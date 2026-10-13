import {
	type CaptureRecord,
	captureKind,
	formatCaptureBytes,
} from "@/application/captures/capture-record";
import { browserCaptureLibrary } from "@/infrastructure/captures/browser-capture-library";
import { StudioBottomSheet } from "@/presentation/components/ui/studio-bottom-sheet";
import { feedback } from "@/presentation/haptics";
import { springs } from "@/presentation/motion";
import { useLibraryRequestStore } from "@/presentation/stores/library-request.store";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Library, X } from "reicon-react";

/** The island's Export button: how a capture is made, and where the empty state hands over. */
const EXPORT_OPENER = '[data-island-opener="export"]';

/**
 * The captures kept on this device. `trigger` false is the phone under a finger:
 * the library stays mounted for the More menu's ask and draws no button of its
 * own (the Showcase's rule, `template-gallery.tsx`).
 */
export function CaptureLibrary({ trigger = true }: { trigger?: boolean } = {}) {
	const [open, setOpen] = useState(false);
	const [captures, setCaptures] = useState<CaptureRecord[]>([]);
	const triggerRef = useRef<HTMLButtonElement>(null);
	/** What the sheet does once it is gone, instead of handing focus back to its trigger. */
	const afterClose = useRef<(() => void) | null>(null);
	/** The control that asked from elsewhere: it gets focus back, as the trigger would. */
	const openerRef = useRef<HTMLElement | null>(null);

	const read = useCallback(async () => {
		setCaptures(await browserCaptureLibrary.list());
	}, []);

	// The sheet is as wide as what it holds, so it reads first and opens second: it
	// arrives at its final width instead of widening as its captures turn up.
	const show = useCallback(async () => {
		afterClose.current = null;
		await read();
		setOpen(true);
	}, [read]);

	// Another surface (the More menu) can ask for the library. Taking the request
	// makes it one-shot: a re-render must not reopen it behind the visitor.
	const requested = useLibraryRequestStore((state) => state.requested);
	const takeRequest = useLibraryRequestStore((state) => state.take);
	useEffect(() => {
		if (requested) {
			openerRef.current = useLibraryRequestStore.getState().opener;
			takeRequest();
			void show();
		}
	}, [requested, takeRequest, show]);

	// Open, it follows the library: a capture that finishes or goes appears in place.
	useEffect(
		() => (open ? browserCaptureLibrary.subscribe(() => void read()) : undefined),
		[open, read],
	);

	const close = useCallback(() => {
		afterClose.current = null;
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	const returnFocusToOpener = useCallback(() => {
		const opener = openerRef.current;
		openerRef.current = null;
		if (opener?.isConnected) {
			opener.focus();
		}
	}, []);

	// The panel is asked for after the sheet has closed: until then the page behind a
	// modal dialog is inert, and a panel opened now could not take focus.
	const exportInstead = useCallback(() => {
		afterClose.current = () => document.querySelector<HTMLElement>(EXPORT_OPENER)?.click();
		setOpen(false);
	}, []);

	return (
		<>
			{trigger && (
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
						void show();
					}}
				>
					<Library size={14} aria-hidden="true" />
					<span>Library</span>
				</motion.button>
			)}

			<StudioBottomSheet
				open={open}
				onClose={close}
				labelledBy="capture-library-title"
				className="capture-library-sheet"
				onClosed={() => {
					const next = afterClose.current;
					afterClose.current = null;
					// The Export panel asked for instead takes the focus; otherwise it goes back.
					if (next) {
						openerRef.current = null;
						next();
						return;
					}
					returnFocusToOpener();
				}}
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

				{captures.length === 0 ? (
					<div className="capture-library-empty">
						<span className="capture-library-empty-icon" aria-hidden="true">
							<Library size={16} aria-hidden="true" />
						</span>
						<p>Export a PNG, GIF, MP4 or WebM and it is kept here as a capture.</p>
						<motion.button
							type="button"
							className="capture-library-action"
							whileTap={{ scale: 0.97 }}
							transition={springs.snappy}
							onClick={exportInstead}
						>
							Export
						</motion.button>
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
					<img src={url} alt="" loading="lazy" decoding="async" />
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
					<strong title={capture.projectTitle}>{capture.projectTitle}</strong>
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
