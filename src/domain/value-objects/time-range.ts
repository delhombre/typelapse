export interface TimeRangeProps {
	start: number;
	end: number;
}

export class TimeRange {
	readonly start: number;
	readonly end: number;

	private constructor(props: TimeRangeProps) {
		this.start = props.start;
		this.end = props.end;
	}

	get duration(): number {
		return this.end - this.start;
	}

	static create(props: TimeRangeProps): TimeRange {
		if (props.start < 0) {
			throw new Error("start must be non-negative");
		}
		if (props.end <= props.start) {
			throw new Error("end must be greater than start");
		}
		return new TimeRange(props);
	}
}
