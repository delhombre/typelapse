import { useLandingTheme } from "@/presentation/landing/use-landing-theme";
import { useCallback, useState } from "react";
import { Picker } from "./picker";
import "./proto.css";
import { Desk, DeskConcentric, DeskContinuous } from "./variants";

const VARIANTS = [
	{ name: "A · saddle", render: () => <Desk /> },
	{ name: "B · continuous", render: () => <DeskContinuous /> },
	{ name: "C · concentric", render: () => <DeskConcentric /> },
];

const initialIndex = () => {
	const raw = new URLSearchParams(window.location.search).get("v");
	const n = Number.parseInt(raw ?? "", 10);
	return n >= 1 && n <= VARIANTS.length ? n - 1 : 0;
};

/**
 * Six hero directions behind a live picker, all running the real Instrument.
 * The material is settled; what varies is where the object sits, how much of it
 * you get, and what it is allowed to do to the page around it.
 *
 * Throwaway: delete src/proto and the marked route in main.tsx once one wins.
 */
export function HeroProto() {
	const [theme, toggleTheme] = useLandingTheme();
	const [current, setCurrent] = useState(initialIndex);
	// Bumping the key re-mounts the variant so entrance animations re-run.
	const [nonce, setNonce] = useState(0);

	const select = useCallback((i: number) => {
		setCurrent(i);
		setNonce((n) => n + 1);
		const url = new URL(window.location.href);
		url.searchParams.set("v", String(i + 1));
		window.history.replaceState(null, "", url);
	}, []);

	const replay = useCallback(() => setNonce((n) => n + 1), []);

	const variant = VARIANTS[current] ?? VARIANTS[0];

	return (
		<div className="landing-root proto-root" data-theme={theme}>
			<div key={`${current}-${nonce}`}>{variant?.render()}</div>
			<Picker
				names={VARIANTS.map((v) => v.name)}
				current={current}
				onSelect={select}
				onReplay={replay}
				onToggleTheme={toggleTheme}
				position="top"
			/>
		</div>
	);
}
