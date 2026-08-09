import { useCallback, useState } from "react";
import { Picker } from "./picker";
import "./proto.css";
import { Terminal } from "./variants";

/**
 * The direction is settled (Terminal). This round compares themes, so the
 * variants are the two palettes rather than two layouts.
 */
const THEMES = ["Light", "Dark"] as const;

const initialIndex = () => {
	const raw = new URLSearchParams(window.location.search).get("v");
	const n = Number.parseInt(raw ?? "", 10);
	return n >= 1 && n <= THEMES.length ? n - 1 : 0;
};

export function HeroProto() {
	const [current, setCurrent] = useState(initialIndex);
	const [nonce, setNonce] = useState(0);

	const select = useCallback((i: number) => {
		setCurrent(i);
		setNonce((n) => n + 1);
		const url = new URL(window.location.href);
		url.searchParams.set("v", String(i + 1));
		window.history.replaceState(null, "", url);
	}, []);

	const replay = useCallback(() => setNonce((n) => n + 1), []);

	const theme = current === 1 ? "dark" : "light";

	return (
		<div className="proto-root" data-theme={theme}>
			<div key={`${current}-${nonce}`}>
				<Terminal />
			</div>
			{/* The microline sits at bottom-centre, so the picker moves to the top:
			    the spec's one allowed modification. */}
			<Picker
				names={[...THEMES]}
				current={current}
				onSelect={select}
				onReplay={replay}
				position="top"
			/>
		</div>
	);
}
