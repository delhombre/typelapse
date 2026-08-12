import { useCallback, useEffect, useState } from "react";
import { DirectionA } from "./direction-a";
import { DirectionB } from "./direction-b";
import { DirectionC } from "./direction-c";
import { MobileSketch } from "./mobile";
import { Picker } from "./picker";
import "./shell.css";

const VARIANTS = [
	{ name: "A · Instrument", render: () => <DirectionA /> },
	{ name: "B · Atelier", render: () => <DirectionB /> },
	{ name: "C · Scène", render: () => <DirectionC /> },
	{ name: "390", render: () => <MobileSketch /> },
];

const initialIndex = () => {
	const raw = new URLSearchParams(window.location.search).get("v");
	const n = Number.parseInt(raw ?? "", 10);
	return n >= 1 && n <= VARIANTS.length ? n - 1 : 0;
};

/**
 * Three structural directions for the studio shell, behind one picker.
 *
 * The project is held fixed — the same three steps, the same Solar mesh, the
 * same Midnight theme, the same step selected — so the only variable on the
 * page is where things are. The dark island under the preview is treated as
 * acquired (PR #48) and is sketched in place in all three; what each direction
 * decides is what happens to the settings strip and the export bar around it.
 *
 * Throwaway: delete src/proto/shell and the marked route in main.tsx once one
 * wins.
 */
export function StudioShellProto() {
	const [current, setCurrent] = useState(initialIndex);
	// Bumping the key re-mounts the variant, so a direction is always judged
	// from its resting state rather than from whatever was last clicked.
	const [nonce, setNonce] = useState(0);
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
	}, [dark]);

	const select = useCallback((i: number) => {
		setCurrent(i);
		setNonce((n) => n + 1);
		const url = new URL(window.location.href);
		url.searchParams.set("v", String(i + 1));
		window.history.replaceState(null, "", url);
	}, []);

	const replay = useCallback(() => setNonce((n) => n + 1), []);
	const toggleTheme = useCallback(() => setDark((d) => !d), []);

	const variant = VARIANTS[current] ?? VARIANTS[0];

	return (
		<>
			<div key={`${current}-${nonce}`}>{variant?.render()}</div>
			<Picker
				names={VARIANTS.map((v) => v.name)}
				current={current}
				onSelect={select}
				onReplay={replay}
				onToggleTheme={toggleTheme}
				position="top"
			/>
		</>
	);
}
