import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./picker.css";

interface PickerProps {
	names: string[];
	current: number;
	onSelect: (index: number) => void;
	onReplay: () => void;
	/** The spec's single allowed modification, for variants that use the bottom. */
	position?: "top";
}

export function Picker({ names, current, onSelect, onReplay, position }: PickerProps) {
	const navRef = useRef<HTMLElement>(null);
	const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const [box, setBox] = useState({ left: 0, width: 0 });
	const [ready, setReady] = useState(false);

	useLayoutEffect(() => {
		const el = itemsRef.current[current];
		if (el) {
			setBox({ left: el.offsetLeft, width: el.offsetWidth });
		}
	}, [current]);

	useEffect(() => {
		const measure = () => {
			const el = itemsRef.current[current];
			if (el) {
				setBox({ left: el.offsetLeft, width: el.offsetWidth });
			}
		};
		window.addEventListener("resize", measure);
		return () => window.removeEventListener("resize", measure);
	}, [current]);

	// Enable the slide only after first paint, so load does not animate.
	useEffect(() => {
		const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
		return () => cancelAnimationFrame(id);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)
			) {
				return;
			}
			if (e.metaKey || e.ctrlKey || e.altKey) {
				return;
			}
			const num = Number.parseInt(e.key, 10);
			if (num >= 1 && num <= names.length) {
				onSelect(num - 1);
			} else if (e.key === "ArrowRight") {
				onSelect((current + 1) % names.length);
			} else if (e.key === "ArrowLeft") {
				onSelect((current - 1 + names.length) % names.length);
			} else if (e.key === "r" || e.key === "R") {
				onReplay();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [current, names.length, onSelect, onReplay]);

	return (
		<nav
			className="proto-picker"
			aria-label="Prototype variants"
			ref={navRef}
			{...(ready ? { "data-ready": "" } : {})}
			{...(position ? { "data-position": position } : {})}
		>
			<span
				className="proto-picker-highlight"
				aria-hidden="true"
				style={{ width: box.width, transform: `translateX(${box.left}px)` }}
			/>
			{names.map((name, i) => (
				<button
					key={name}
					type="button"
					className="proto-picker-item"
					ref={(el) => {
						itemsRef.current[i] = el;
					}}
					onClick={() => onSelect(i)}
					{...(i === current ? { "data-active": "", "aria-current": "true" as const } : {})}
				>
					{name}
				</button>
			))}
			<span className="proto-picker-divider" aria-hidden="true" />
			<button
				type="button"
				className="proto-picker-item proto-picker-replay"
				aria-label="Replay animation (R)"
				onClick={onReplay}
			>
				↻
			</button>
		</nav>
	);
}
