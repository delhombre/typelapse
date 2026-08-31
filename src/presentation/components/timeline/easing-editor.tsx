import { type CubicBezier, TRANSITION_EASING_PRESETS } from "@/application/magic-move/easing";
import { feedback } from "@/presentation/haptics";
import { motion, useReducedMotion } from "motion/react";
import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

const CHART_WIDTH = 284;
const CHART_HEIGHT = 146;
const CHART_PADDING = 18;
const EASING_AXES = [
	{ label: "X1", index: 0 },
	{ label: "Y1", index: 1 },
	{ label: "X2", index: 2 },
	{ label: "Y2", index: 3 },
] as const;

export function EasingEditor({
	value,
	onChange,
	anchor,
	onRequestClose,
}: {
	value: CubicBezier;
	onChange: (value: CubicBezier) => void;
	anchor: HTMLElement | null;
	onRequestClose: () => void;
}) {
	const reduceMotion = useReducedMotion() === true;
	const svgRef = useRef<SVGSVGElement>(null);
	const panelRef = useRef<HTMLDialogElement>(null);
	const [dragging, setDragging] = useState<0 | 1 | null>(null);
	const [position, setPosition] = useState({ left: 12, bottom: 12 });

	useLayoutEffect(() => {
		if (!anchor) {
			return;
		}
		const updatePosition = () => {
			const rect = anchor.getBoundingClientRect();
			setPosition({
				left: clamp(rect.left - 38, 12, window.innerWidth - 348),
				bottom: Math.max(window.innerHeight - rect.top + 8, 12),
			});
		};
		updatePosition();
		window.addEventListener("resize", updatePosition);
		window.addEventListener("scroll", updatePosition, true);
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	}, [anchor]);

	useEffect(() => {
		const closeOutside = (event: globalThis.PointerEvent) => {
			const target = event.target as Node;
			if (!anchor?.contains(target) && !panelRef.current?.contains(target)) {
				onRequestClose();
			}
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, [anchor, onRequestClose]);

	const updateHandle = (event: ReactPointerEvent<SVGSVGElement>, handle: 0 | 1) => {
		const rect = svgRef.current?.getBoundingClientRect();
		if (!rect) {
			return;
		}
		const plotWidth = CHART_WIDTH - CHART_PADDING * 2;
		const plotHeight = CHART_HEIGHT - CHART_PADDING * 2;
		const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
		const y = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
		const normalizedX = clamp((x * CHART_WIDTH - CHART_PADDING) / plotWidth, 0, 1);
		const normalizedY = clamp((y * CHART_HEIGHT - CHART_PADDING) / plotHeight, 0, 1);
		const next: CubicBezier =
			handle === 0
				? [normalizedX, normalizedY, value[2], value[3]]
				: [value[0], value[1], normalizedX, normalizedY];
		onChange(roundCurve(next));
	};

	const onPointerDown = (event: ReactPointerEvent<SVGCircleElement>, handle: 0 | 1) => {
		event.preventDefault();
		setDragging(handle);
		svgRef.current?.setPointerCapture(event.pointerId);
		updateHandle(event as unknown as ReactPointerEvent<SVGSVGElement>, handle);
	};

	const activePreset = TRANSITION_EASING_PRESETS.find(({ value: preset }) =>
		curvesEqual(preset, value),
	)?.id;

	return createPortal(
		<motion.dialog
			ref={panelRef}
			open
			aria-label="Transition easing"
			className="studio-easing-editor"
			style={{ left: position.left, bottom: position.bottom }}
			initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 5, scale: 0.99 }}
			transition={reduceMotion ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
		>
			<div className="studio-easing-heading">
				<strong>Transition easing</strong>
				<span>Every morph</span>
			</div>

			<svg
				ref={svgRef}
				className="studio-easing-chart"
				viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
				aria-hidden="true"
				onPointerMove={(event) => {
					if (dragging !== null) {
						updateHandle(event, dragging);
					}
				}}
				onPointerUp={(event) => {
					if (dragging !== null) {
						event.currentTarget.releasePointerCapture(event.pointerId);
						setDragging(null);
						feedback("commit");
					}
				}}
				onPointerCancel={() => setDragging(null)}
			>
				<title>Custom cubic Bézier curve</title>
				<ChartGrid />
				<CurveDrawing value={value} />
				<circle
					className="studio-easing-handle"
					cx={chartX(value[0])}
					cy={chartY(value[1])}
					r="6"
					onPointerDown={(event) => onPointerDown(event, 0)}
				/>
				<circle
					className="studio-easing-handle"
					cx={chartX(value[2])}
					cy={chartY(value[3])}
					r="6"
					onPointerDown={(event) => onPointerDown(event, 1)}
				/>
			</svg>

			<div className="studio-easing-values">
				{EASING_AXES.map(({ label, index }) => (
					<label key={label}>
						<span className="sr-only">Cubic Bézier {label}</span>
						<input
							type="number"
							min={0}
							max={1}
							step={0.01}
							value={value[index].toFixed(2)}
							onFocus={(event) => event.currentTarget.select()}
							onChange={(event) => {
								const parsed = Number.parseFloat(event.currentTarget.value);
								if (!Number.isFinite(parsed)) {
									return;
								}
								const next = [...value] as [number, number, number, number];
								next[index] = clamp(parsed, 0, 1);
								onChange(roundCurve(next));
							}}
						/>
					</label>
				))}
			</div>

			<span className="studio-easing-presets-label">Presets</span>
			<div className="studio-easing-presets">
				{TRANSITION_EASING_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						aria-label={`${preset.label} easing`}
						aria-pressed={activePreset === preset.id}
						data-active={activePreset === preset.id ? "" : undefined}
						onClick={() => {
							onChange([...preset.value]);
							feedback("selection");
						}}
					>
						<MiniCurve value={preset.value} />
						<span>{preset.label}</span>
					</button>
				))}
			</div>
		</motion.dialog>,
		document.querySelector(".studio-camera-root") ?? document.body,
	);
}

function ChartGrid() {
	const left = CHART_PADDING;
	const top = CHART_PADDING;
	const right = CHART_WIDTH - CHART_PADDING;
	const bottom = CHART_HEIGHT - CHART_PADDING;
	return (
		<g className="studio-easing-grid">
			<rect x={left} y={top} width={right - left} height={bottom - top} rx="12" />
			<path d={`M ${left} ${(top + bottom) / 2} H ${right}`} />
			<path d={`M ${(left + right) / 2} ${top} V ${bottom}`} />
		</g>
	);
}

function CurveDrawing({ value }: { value: CubicBezier }) {
	const startX = chartX(0);
	const startY = chartY(0);
	const endX = chartX(1);
	const endY = chartY(1);
	const firstX = chartX(value[0]);
	const firstY = chartY(value[1]);
	const secondX = chartX(value[2]);
	const secondY = chartY(value[3]);
	return (
		<g>
			<path
				className="studio-easing-guide"
				d={`M ${startX} ${startY} L ${firstX} ${firstY} M ${endX} ${endY} L ${secondX} ${secondY}`}
			/>
			<path
				className="studio-easing-curve"
				d={`M ${startX} ${startY} C ${firstX} ${firstY}, ${secondX} ${secondY}, ${endX} ${endY}`}
			/>
		</g>
	);
}

function MiniCurve({ value }: { value: CubicBezier }) {
	const width = 78;
	const height = 42;
	const padding = 6;
	const x = (position: number) => padding + position * (width - padding * 2);
	const y = (position: number) => height - padding - position * (height - padding * 2);
	return (
		<svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
			<path
				d={`M ${x(0)} ${y(0)} C ${x(value[0])} ${y(value[1])}, ${x(value[2])} ${y(value[3])}, ${x(1)} ${y(1)}`}
			/>
			<circle cx={x(0)} cy={y(0)} r="2" />
			<circle cx={x(1)} cy={y(1)} r="2" />
		</svg>
	);
}

function chartX(position: number): number {
	return CHART_PADDING + position * (CHART_WIDTH - CHART_PADDING * 2);
}

function chartY(position: number): number {
	return CHART_HEIGHT - CHART_PADDING - position * (CHART_HEIGHT - CHART_PADDING * 2);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function roundCurve(value: CubicBezier): CubicBezier {
	return value.map((point) => Math.round(point * 100) / 100) as unknown as CubicBezier;
}

function curvesEqual(left: CubicBezier, right: CubicBezier): boolean {
	return (
		Math.abs(left[0] - right[0]) < 0.001 &&
		Math.abs(left[1] - right[1]) < 0.001 &&
		Math.abs(left[2] - right[2]) < 0.001 &&
		Math.abs(left[3] - right[3]) < 0.001
	);
}
