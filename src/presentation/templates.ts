/**
 * Curated starter templates: each is a ready-to-animate snippet with steps,
 * theme and background already set. Loaded through the same path as JSON import
 * (see `importFromJson`), so the shape matches a share payload exactly.
 */
export interface Template {
	id: string;
	name: string;
	title: string;
	code: string;
	language: string;
	themeName: string;
	background: string;
	steps: { code: string; duration: number }[];
}

export const TEMPLATES: Template[] = [
	{
		id: "types",
		name: "Add types",
		title: "sum.ts",
		code: "function sum(a: number, b: number): number {\n  return a + b;\n}",
		language: "typescript",
		themeName: "one-dark",
		background: "mesh:aurora",
		steps: [
			{ code: "function sum(a, b) {\n  return a + b;\n}", duration: 1600 },
			{ code: "function sum(a: number, b: number): number {\n  return a + b;\n}", duration: 1800 },
		],
	},
	{
		id: "hook",
		name: "React hook",
		title: "Counter.tsx",
		code: "function Counter() {\n  const [n, setN] = useState(0)\n  return <button onClick={() => setN(n + 1)}>{n}</button>\n}",
		language: "typescript",
		themeName: "dracula",
		background: "mesh:nebula",
		steps: [
			{ code: "function Counter() {\n  return <button>0</button>\n}", duration: 1600 },
			{
				code: "function Counter() {\n  const [n, setN] = useState(0)\n  return <button>{n}</button>\n}",
				duration: 1600,
			},
			{
				code: "function Counter() {\n  const [n, setN] = useState(0)\n  return <button onClick={() => setN(n + 1)}>{n}</button>\n}",
				duration: 2000,
			},
		],
	},
	{
		id: "fetch",
		name: "Async fetch",
		title: "load.ts",
		code: "const res = await fetch(url)\nconst data = await res.json()\nconsole.log(data)",
		language: "typescript",
		themeName: "midnight",
		background: "mesh:ocean",
		steps: [
			{ code: "const res = await fetch(url)", duration: 1500 },
			{ code: "const res = await fetch(url)\nconst data = await res.json()", duration: 1500 },
			{
				code: "const res = await fetch(url)\nconst data = await res.json()\nconsole.log(data)",
				duration: 1800,
			},
		],
	},
	{
		id: "python",
		name: "Python refactor",
		title: "user.py",
		code: "class User:\n    def __init__(self, name):\n        self.name = name",
		language: "python",
		themeName: "catppuccin",
		background: "mesh:forest",
		steps: [
			{ code: "class User:\n    pass", duration: 1500 },
			{
				code: "class User:\n    def __init__(self, name):\n        self.name = name",
				duration: 1900,
			},
		],
	},
];
