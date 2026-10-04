import { crc32, deflateSync } from "node:zlib";

/**
 * Media fixtures written in code rather than committed as binaries: what a
 * journey feeds the studio is readable here, and a fixture cannot drift from
 * the assertion that depends on its size or length.
 */

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/** An RGB PNG with four flat quadrants, so a placed image is easy to spot. */
export function quadrantPng(width = 320, height = 180): Buffer {
	const colors = [
		[230, 57, 70],
		[42, 157, 143],
		[233, 196, 106],
		[38, 70, 83],
	] as const;
	const rows: Buffer[] = [];
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(1 + width * 3);
		for (let x = 0; x < width; x++) {
			const quadrant = (y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1);
			const [r, g, b] = colors[quadrant] ?? colors[0];
			row.set([r, g, b], 1 + x * 3);
		}
		rows.push(row);
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", deflateSync(Buffer.concat(rows))),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** A mono 16-bit PCM WAV of a 440 Hz tone lasting exactly `seconds`. */
export function toneWav(seconds: number, sampleRate = 8000): Buffer {
	const samples = Math.round(seconds * sampleRate);
	const data = Buffer.alloc(samples * 2);
	for (let i = 0; i < samples; i++) {
		data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000), i * 2);
	}
	const header = Buffer.alloc(44);
	header.write("RIFF", 0, "ascii");
	header.writeUInt32LE(36 + data.length, 4);
	header.write("WAVE", 8, "ascii");
	header.write("fmt ", 12, "ascii");
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(1, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(sampleRate * 2, 28);
	header.writeUInt16LE(2, 32);
	header.writeUInt16LE(16, 34);
	header.write("data", 36, "ascii");
	header.writeUInt32LE(data.length, 40);
	return Buffer.concat([header, data]);
}

/** A two-hunk unified diff of one file: the studio turns it into two scenes. */
export const GREET_DIFF = `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,5 +1,6 @@
 export function greet(name: string) {
-  return "Hello " + name;
+  const trimmed = name.trim();
+  return \`Hello, \${trimmed}!\`;
 }

 console.log(greet("Typelapse"));
`;
