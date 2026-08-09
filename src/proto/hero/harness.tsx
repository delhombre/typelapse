import { useCallback, useState } from "react";
import { Picker } from "./picker";
import "./proto.css";
import { Editorial, Split, Terminal } from "./variants";

const VARIANTS = [
	{ name: "Terminal", render: () => <Terminal /> },
	{ name: "Editorial", render: () => <Editorial /> },
	{ name: "Split", render: () => <Split /> },
];

const initialIndex = () => {
	const raw = new URLSearchParams(window.location.search).get("v");
	const n = Number.parseInt(raw ?? "", 10);
	return n >= 1 && n <= VARIANTS.length ? n - 1 : 0;
};

export function HeroProto() {
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
		<div className="proto-root">
			<div key={`${current}-${nonce}`}>{variant?.render()}</div>
			{/* Editorial and Terminal both put a microline at bottom-centre, which
			    the picker would cover. The spec's one allowed modification. */}
			<Picker
				names={VARIANTS.map((v) => v.name)}
				current={current}
				onSelect={select}
				onReplay={replay}
				position="top"
			/>
		</div>
	);
}
