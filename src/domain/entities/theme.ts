export interface ThemeProps {
	name: string;
	background: string;
	foreground: string;
	fontFamily: string;
	fontSize: number;
	padding: number;
	borderRadius: number;
}

export class Theme {
	readonly name: string;
	readonly background: string;
	readonly foreground: string;
	readonly fontFamily: string;
	readonly fontSize: number;
	readonly padding: number;
	readonly borderRadius: number;

	private constructor(props: ThemeProps) {
		this.name = props.name;
		this.background = props.background;
		this.foreground = props.foreground;
		this.fontFamily = props.fontFamily;
		this.fontSize = props.fontSize;
		this.padding = props.padding;
		this.borderRadius = props.borderRadius;
	}

	static create(props: ThemeProps): Theme {
		return new Theme(props);
	}

	static midnight(): Theme {
		return new Theme({
			name: "midnight",
			background: "#0d1117",
			foreground: "#e6edf3",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
			padding: 24,
			borderRadius: 12,
		});
	}

	static aurora(): Theme {
		return new Theme({
			name: "aurora",
			background: "#1a1b2e",
			foreground: "#d4d4e4",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
			padding: 24,
			borderRadius: 12,
		});
	}

	static frost(): Theme {
		return new Theme({
			name: "frost",
			background: "#f0f4f8",
			foreground: "#1a202c",
			fontFamily: "JetBrains Mono, monospace",
			fontSize: 14,
			padding: 24,
			borderRadius: 12,
		});
	}
}
