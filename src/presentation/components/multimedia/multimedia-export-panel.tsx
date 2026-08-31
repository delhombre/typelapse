import type { ProjectDocumentV2 } from "@/application/project/project-document";
import type {
	HostedRenderClientDownload,
	HostedRenderClientPort,
	HostedRenderJobSnapshot,
} from "@/application/render/hosted-render-client.port";
import type { LocalMultimediaRenderClientPort } from "@/application/render/local-multimedia-render-client.port";
import {
	HostedRenderAbortedError,
	HostedRenderJobCanceledError,
	HostedRenderJobFailedError,
	HostedRenderTimeoutError,
	waitForHostedRender,
} from "@/application/render/poll-hosted-render";
import { HostedRenderHttpError } from "@/infrastructure/export/hosted-render-http.adapter";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type SyntheticEvent, useEffect, useId, useRef, useState } from "react";
import { Check, Cloud, DocumentCode, Download, Loader, Pause, Video, X } from "reicon-react";
import "./multimedia-export-panel.css";

export type MultimediaDeploymentMode = "local" | "hosted";

export interface MultimediaCloudUpgradeCapability {
	/** Fail-closed: only true after the hosted runtime confirms billing is enabled. */
	readonly available: boolean;
	readonly busy?: boolean;
	readonly error?: string | null;
	readonly onRequest: () => void;
}

export interface MultimediaCloudExportCapability {
	readonly client: HostedRenderClientPort;
	readonly available: boolean;
	readonly reason?: string;
	readonly upgrade?: MultimediaCloudUpgradeCapability;
}

export interface MultimediaLocalExportCapability {
	readonly client: LocalMultimediaRenderClientPort;
	/** Fail-closed: the card is mounted only after the local runtime confirms availability. */
	readonly available: boolean;
	readonly reason?: string;
}

type ExportPhase =
	| { readonly kind: "idle" }
	| { readonly kind: "local-rendering" }
	| { readonly kind: "local-ready" }
	| { readonly kind: "submitting" }
	| { readonly kind: "waiting"; readonly job: HostedRenderJobSnapshot }
	| { readonly kind: "paused"; readonly job: HostedRenderJobSnapshot }
	| {
			readonly kind: "ready";
			readonly job: HostedRenderJobSnapshot;
			readonly download: HostedRenderClientDownload;
	  }
	| { readonly kind: "error"; readonly message: string };

type ExportFileSaver = (blob: Blob, fileName: string) => void | Promise<void>;

export interface MultimediaExportPanelProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly document: ProjectDocumentV2;
	readonly revision: number;
	readonly deploymentMode: MultimediaDeploymentMode;
	readonly cloud?: MultimediaCloudExportCapability;
	readonly local?: MultimediaLocalExportCapability;
	readonly saveProjectFile?: ExportFileSaver;
	readonly saveVideoFile?: ExportFileSaver;
	readonly pollIntervalMs?: number;
}

function defaultExportFileSaver(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = window.document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFileStem(title: string): string {
	return (
		title
			.trim()
			.replace(/[\\/:*?"<>|]+/g, "-")
			.replace(/\s+/g, " ")
			.slice(0, 80) || "Untitled"
	);
}

function projectFileName(title: string): string {
	return `${exportFileStem(title)}.typelapse.json`;
}

function videoFileName(title: string, format: "mp4" | "webm"): string {
	return `${exportFileStem(title)}.${format}`;
}

function panelDescription(videoMode: "hosted" | "local" | null): string {
	if (videoMode === "local") {
		return "Keep an editable source, or render the same scene timeline on this device.";
	}
	if (videoMode === "hosted") {
		return "Keep an editable source, or render the same scene timeline in the cloud.";
	}
	return "Keep an editable source you can reopen in Typelapse.";
}

function projectBlob(document: ProjectDocumentV2): Blob {
	return new Blob([`${JSON.stringify(document, null, 2)}\n`], {
		type: "application/json;charset=utf-8",
	});
}

function errorMessage(error: unknown): string {
	if (error instanceof HostedRenderHttpError) {
		switch (error.code) {
			case "authentication-required":
				return "Sign in before sending this project to the cloud renderer.";
			case "entitlement-required":
				return "Cloud video export is not included in the current plan.";
			case "conflict":
				return "This project changed in the cloud. Sync the latest revision, then try again.";
			case "not-found":
				return "This cloud project or render job is no longer available.";
			case "network":
			case "unavailable":
			case "rate-limited":
				return "The cloud renderer is temporarily unavailable. Your local project is safe.";
			case "request-too-large":
				return "This render request is larger than the hosted service accepts.";
			case "invalid-response":
			case "request-failed":
				return error.message;
		}
	}
	if (error instanceof HostedRenderTimeoutError) {
		return "The render is still running in the cloud. You can stop waiting and return later.";
	}
	if (error instanceof HostedRenderJobFailedError) {
		return error.renderCode
			? `The cloud renderer stopped (${error.renderCode}).`
			: "The cloud renderer could not finish this video.";
	}
	if (error instanceof HostedRenderJobCanceledError) {
		return "This cloud render was canceled.";
	}
	return error instanceof Error ? error.message : "Cloud video export could not start.";
}

function localErrorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim() !== ""
		? error.message
		: "Local video export could not finish.";
}

function jobLabel(status: HostedRenderJobSnapshot["status"]): string {
	switch (status) {
		case "queued":
			return "Waiting for a renderer";
		case "running":
			return "Rendering every scene";
		case "succeeded":
			return "Video ready";
		case "failed":
			return "Render stopped";
		case "canceled":
			return "Render canceled";
	}
}

/** A real export surface: project files always work; every video path is capability-gated. */
export function MultimediaExportPanel({
	open,
	onClose,
	document,
	revision,
	deploymentMode,
	cloud,
	local,
	saveProjectFile = defaultExportFileSaver,
	saveVideoFile = defaultExportFileSaver,
	pollIntervalMs = 1_100,
}: MultimediaExportPanelProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const titleId = useId();
	const reduceMotion = useReducedMotion() === true;
	const [format, setFormat] = useState<"mp4" | "webm">("mp4");
	const [fps, setFps] = useState<30 | 60>(30);
	const [includeAudio, setIncludeAudio] = useState(true);
	const [phase, setPhase] = useState<ExportPhase>({ kind: "idle" });

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog || !open || dialog.open) {
			return;
		}
		if (typeof dialog.showModal === "function") {
			dialog.showModal();
		} else {
			dialog.setAttribute("open", "");
		}
	}, [open]);

	useEffect(
		() => () => {
			controllerRef.current?.abort("export-panel-unmounted");
		},
		[],
	);

	const stopWaiting = () => {
		controllerRef.current?.abort("stopped-waiting");
		if (phase.kind === "waiting") {
			setPhase({ kind: "paused", job: phase.job });
		} else if (phase.kind === "submitting" || phase.kind === "local-rendering") {
			setPhase({ kind: "idle" });
		}
	};

	const close = () => {
		stopWaiting();
		onClose();
	};

	const waitForJob = async (job: HostedRenderJobSnapshot, controller: AbortController) => {
		const client = cloud?.client;
		if (!client) {
			setPhase({ kind: "error", message: "Cloud rendering is not configured for this build." });
			return;
		}
		setPhase({ kind: "waiting", job });
		try {
			const result = await waitForHostedRender(client, job.id, {
				signal: controller.signal,
				intervalMs: pollIntervalMs,
				onUpdate: (next) => setPhase({ kind: "waiting", job: next }),
			});
			setPhase({ kind: "ready", ...result });
		} catch (error) {
			if (error instanceof HostedRenderAbortedError) {
				setPhase((current) =>
					current.kind === "waiting" ? { kind: "paused", job: current.job } : current,
				);
				return;
			}
			setPhase({ kind: "error", message: errorMessage(error) });
		}
	};

	const startCloudRender = async () => {
		if (!cloud?.available) {
			return;
		}
		controllerRef.current?.abort("replaced-by-new-render");
		const controller = new AbortController();
		controllerRef.current = controller;
		setPhase({ kind: "submitting" });
		try {
			const job = await cloud.client.submit(
				{
					projectId: document.project.id,
					revision,
					renderOptions: {
						format,
						width: document.project.canvas.width,
						height: document.project.canvas.height,
						fps,
						includeAudio,
					},
				},
				{ signal: controller.signal },
			);
			await waitForJob(job, controller);
		} catch (error) {
			if (controller.signal.aborted || error instanceof HostedRenderAbortedError) {
				setPhase({ kind: "idle" });
				return;
			}
			setPhase({ kind: "error", message: errorMessage(error) });
		}
	};

	const resumeCloudRender = () => {
		if (!cloud?.available || phase.kind !== "paused") {
			return;
		}
		const controller = new AbortController();
		controllerRef.current = controller;
		void waitForJob(phase.job, controller);
	};

	const startLocalRender = async () => {
		if (deploymentMode !== "local" || local?.available !== true) {
			return;
		}
		controllerRef.current?.abort("replaced-by-new-render");
		const controller = new AbortController();
		controllerRef.current = controller;
		const renderFormat = format;
		setPhase({ kind: "local-rendering" });
		try {
			const output = await local.client.render({
				document,
				options: {
					format: renderFormat,
					width: document.project.canvas.width,
					height: document.project.canvas.height,
					fps,
					includeAudio,
				},
				signal: controller.signal,
			});
			if (controller.signal.aborted || controllerRef.current !== controller) {
				return;
			}
			await saveVideoFile(output, videoFileName(document.project.title, renderFormat));
			if (!controller.signal.aborted && controllerRef.current === controller) {
				setPhase({ kind: "local-ready" });
			}
		} catch (error) {
			if (controller.signal.aborted || controllerRef.current !== controller) {
				return;
			}
			setPhase({ kind: "error", message: localErrorMessage(error) });
		}
	};

	const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
		event.preventDefault();
		close();
	};

	const localFileName = projectFileName(document.project.title);
	const cloudAvailable = deploymentMode === "hosted" && cloud?.available === true;
	const localAvailable = deploymentMode === "local" && local?.available === true;
	const cloudReason = cloud?.reason ?? "Cloud rendering is not configured for this build.";
	const busy =
		phase.kind === "submitting" || phase.kind === "waiting" || phase.kind === "local-rendering";
	let videoMode: "hosted" | "local" | null = null;
	if (deploymentMode === "hosted") {
		videoMode = "hosted";
	} else if (localAvailable) {
		videoMode = "local";
	}

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			className="mm-export-dialog"
			onCancel={handleCancel}
		>
			<AnimatePresence onExitComplete={() => dialogRef.current?.close()}>
				{open ? (
					<>
						<motion.button
							type="button"
							className="mm-export-scrim"
							aria-label="Close export panel"
							onClick={close}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: reduceMotion ? 0 : 0.18 }}
						/>
						<div className="mm-export-positioner">
							<motion.section
								className="mm-export-panel"
								initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.985 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
								transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
							>
								<header className="mm-export-header">
									<div>
										<p className="mm-export-eyebrow">Output</p>
										<h2 id={titleId}>Export your project</h2>
										<p>{panelDescription(videoMode)}</p>
									</div>
									<button type="button" aria-label="Close export panel" onClick={close}>
										<X size={17} aria-hidden="true" />
									</button>
								</header>

								<div className="mm-export-options">
									<section className="mm-export-card">
										<div className="mm-export-card-icon">
											<DocumentCode size={20} aria-hidden="true" />
										</div>
										<div className="mm-export-card-copy">
											<p className="mm-export-card-kicker">Editable source</p>
											<h3>Typelapse project</h3>
											<p>
												Scenes, text, code, media references, motion and timing. Original media
												files are not embedded.
											</p>
										</div>
										<button
											type="button"
											className="mm-export-secondary"
											onClick={() => saveProjectFile(projectBlob(document), localFileName)}
										>
											<Download size={16} aria-hidden="true" />
											Download project file
										</button>
									</section>

									{videoMode ? (
										<section className="mm-export-card mm-export-card-cloud">
											<div className="mm-export-card-icon mm-export-card-icon-cloud">
												{videoMode === "hosted" ? (
													<Cloud size={20} aria-hidden="true" />
												) : (
													<Video size={20} aria-hidden="true" />
												)}
											</div>
											<div className="mm-export-card-copy">
												<p className="mm-export-card-kicker">
													{videoMode === "hosted" ? "Hosted renderer" : "Local renderer"}
												</p>
												<h3>Video</h3>
												<p>
													{document.project.canvas.width} × {document.project.canvas.height} ·
													{videoMode === "hosted"
														? " signed private output"
														: " private local output"}
												</p>
											</div>

											<div className="mm-export-controls">
												<div className="mm-export-segment" aria-label="Video format">
													{(["mp4", "webm"] as const).map((value) => (
														<button
															type="button"
															key={value}
															aria-pressed={format === value}
															disabled={busy}
															onClick={() => setFormat(value)}
														>
															{value.toUpperCase()}
														</button>
													))}
												</div>
												<div className="mm-export-segment" aria-label="Frame rate">
													{([30, 60] as const).map((value) => (
														<button
															type="button"
															key={value}
															aria-pressed={fps === value}
															disabled={busy}
															onClick={() => setFps(value)}
														>
															{value} fps
														</button>
													))}
												</div>
												<label className="mm-export-audio">
													<input
														type="checkbox"
														checked={includeAudio}
														disabled={busy}
														onChange={(event) => setIncludeAudio(event.currentTarget.checked)}
													/>
													<span>Include audio</span>
												</label>
											</div>

											{videoMode === "hosted" ? (
												<CloudExportAction
													phase={phase}
													format={format}
													available={cloudAvailable}
													reason={cloudReason}
													upgrade={cloud?.upgrade}
													onStart={() => void startCloudRender()}
													onStop={stopWaiting}
													onResume={resumeCloudRender}
												/>
											) : (
												<LocalExportAction phase={phase} onStart={() => void startLocalRender()} />
											)}
										</section>
									) : null}
								</div>
							</motion.section>
						</div>
					</>
				) : null}
			</AnimatePresence>
		</dialog>
	);
}

function LocalExportAction({
	phase,
	onStart,
}: {
	readonly phase: ExportPhase;
	readonly onStart: () => void;
}) {
	if (phase.kind === "local-rendering") {
		return (
			<output className="mm-export-cloud-action" aria-live="polite">
				<p>Rendering every scene on this device…</p>
				<button type="button" className="mm-export-primary" disabled>
					<Loader className="mm-export-spin" size={16} aria-hidden="true" />
					Rendering
				</button>
			</output>
		);
	}
	if (phase.kind === "local-ready") {
		return (
			<output className="mm-export-cloud-action mm-export-ready" aria-live="polite">
				<p>
					<Check size={14} aria-hidden="true" /> Download started for the finished video
				</p>
				<button type="button" className="mm-export-secondary" onClick={onStart}>
					<Video size={16} aria-hidden="true" />
					Render again
				</button>
			</output>
		);
	}
	if (phase.kind === "error") {
		return (
			<div className="mm-export-cloud-action mm-export-error" role="alert">
				<p>{phase.message}</p>
				<button type="button" className="mm-export-secondary" onClick={onStart}>
					Try again
				</button>
			</div>
		);
	}
	return (
		<div className="mm-export-cloud-action">
			<p>The finished video downloads directly from this local render.</p>
			<button type="button" className="mm-export-primary" onClick={onStart}>
				<Video size={16} aria-hidden="true" />
				Render video
			</button>
		</div>
	);
}

function CloudExportAction({
	phase,
	format,
	available,
	reason,
	upgrade,
	onStart,
	onStop,
	onResume,
}: {
	readonly phase: ExportPhase;
	readonly format: "mp4" | "webm";
	readonly available: boolean;
	readonly reason: string;
	readonly upgrade?: MultimediaCloudUpgradeCapability;
	readonly onStart: () => void;
	readonly onStop: () => void;
	readonly onResume: () => void;
}) {
	if (!available) {
		return (
			<div className="mm-export-cloud-action mm-export-cloud-locked">
				<div>
					<p>{reason}</p>
					{upgrade?.error ? <p role="alert">{upgrade.error}</p> : null}
				</div>
				{upgrade?.available ? (
					<button
						type="button"
						className="mm-export-primary"
						disabled={upgrade.busy}
						onClick={upgrade.onRequest}
					>
						<Cloud size={16} aria-hidden="true" />
						{upgrade.busy ? "Opening checkout…" : "Upgrade to Creator"}
					</button>
				) : (
					<button type="button" className="mm-export-primary" disabled>
						<Video size={16} aria-hidden="true" />
						Render video
					</button>
				)}
			</div>
		);
	}
	if (phase.kind === "submitting") {
		return (
			<output className="mm-export-cloud-action" aria-live="polite">
				<p>Creating a private render job…</p>
				<button type="button" className="mm-export-primary" disabled>
					<Loader className="mm-export-spin" size={16} aria-hidden="true" />
					Preparing
				</button>
			</output>
		);
	}
	if (phase.kind === "waiting") {
		return (
			<output className="mm-export-cloud-action" aria-live="polite">
				<p>{jobLabel(phase.job.status)}. You can stop waiting without canceling it.</p>
				<button type="button" className="mm-export-secondary" onClick={onStop}>
					<Pause size={16} aria-hidden="true" />
					Stop waiting
				</button>
			</output>
		);
	}
	if (phase.kind === "paused") {
		return (
			<output className="mm-export-cloud-action">
				<p>The render continues in the cloud.</p>
				<button type="button" className="mm-export-secondary" onClick={onResume}>
					<Cloud size={16} aria-hidden="true" />
					Check progress
				</button>
			</output>
		);
	}
	if (phase.kind === "ready") {
		return (
			<output className="mm-export-cloud-action mm-export-ready" aria-live="polite">
				<p>
					<Check size={14} aria-hidden="true" /> Video ready · private link expires soon
				</p>
				<a
					className="mm-export-primary"
					href={phase.download.url}
					download={`typelapse.${format}`}
					rel="noreferrer"
				>
					<Download size={16} aria-hidden="true" />
					Download {format.toUpperCase()}
				</a>
			</output>
		);
	}
	if (phase.kind === "error") {
		return (
			<div className="mm-export-cloud-action mm-export-error" role="alert">
				<p>{phase.message}</p>
				<button type="button" className="mm-export-secondary" onClick={onStart}>
					Try again
				</button>
			</div>
		);
	}
	return (
		<div className="mm-export-cloud-action">
			<p>The server renders the saved revision, never an untrusted client program.</p>
			<button type="button" className="mm-export-primary" onClick={onStart}>
				<Video size={16} aria-hidden="true" />
				Render video
			</button>
		</div>
	);
}
