export interface HighlightRangeProps {
	startLine: number;
	endLine: number;
	startColumn?: number;
	endColumn?: number;
}

export class HighlightRange {
	readonly startLine: number;
	readonly endLine: number;
	readonly startColumn?: number;
	readonly endColumn?: number;

	private constructor(props: HighlightRangeProps) {
		this.startLine = props.startLine;
		this.endLine = props.endLine;
		this.startColumn = props.startColumn;
		this.endColumn = props.endColumn;
	}

	static create(props: HighlightRangeProps): HighlightRange {
		if (props.startLine < 0 || props.endLine < 0) {
			throw new Error("Line numbers must be non-negative");
		}
		if (props.endLine < props.startLine) {
			throw new Error("endLine must be >= startLine");
		}
		return new HighlightRange(props);
	}
}
