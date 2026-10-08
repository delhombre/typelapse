# Launch assets

Every asset is rendered by Typelapse itself, from a file committed in this
repository, so anyone can rebuild it. Commands run from the repository root
after `pnpm install`. None of the outputs below is committed except where the
row says so; keep them out of git.

## 1. The 20 second launch clip

The project: `docs/launch/launch.project.json`. A text title card, a real pull
request diff from this repository playing as two scenes, then a code scene
with the WebM codec ladder. 1920x1080 at 60 fps, 20.00 s.

```bash
pnpm typelapse render docs/launch/launch.project.json --format mp4 --out launch.mp4
pnpm typelapse render docs/launch/launch.project.json --format webm --out launch.webm
```

The MP4 is for X and Product Hunt; the WebM is the sharp one (AV1 4:4:4 where
the machine has the encoder). A project with a text layer renders as MP4 or
WebM, not GIF. Check each file before posting:

```bash
ffprobe -v error -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration -of default=nw=1 launch.mp4
```

Expected: `h264`, `yuv420p`, `1920`, `1080`, `60/1`, `duration=20.000000`.

To edit it, open the studio, choose Add source, Open project file, and pick
`docs/launch/launch.project.json`; export the project file back over it.

## 2. The README demo

Committed as `docs/demo.gif`, from `docs/demo.project.json`, through the real
render route.

```bash
pnpm demo:render          # writes docs/demo.gif
pnpm demo:render --mp4    # also writes docs/demo.mp4, for X (not committed)
```

## 3. The sharpness pair

Committed as `docs/sharpness/av1-444.png`, `docs/sharpness/h264-420.png` and
`docs/sharpness/sharpness.json` (43.63 dB against 29.31 dB, frame 45 of
`docs/sharpness/sharpness.project.json`). The script drives the studio's own
on-device export in a headless Chromium, so the numbers are the browser's.

```bash
pnpm sharpness:render
```

For a post, put the two crops side by side with their numbers under them; the
landing's sharpness section already shows them this way.

## 4. The share image

`public/og.png` (1200x630) is a frame of the self-demo. No committed script
reproduces it yet; this does, from the same project:

```bash
pnpm typelapse render docs/demo.project.json --size 1200x630 --format mp4 --out og.mp4
ffmpeg -ss 3 -i og.mp4 -frames:v 1 public/og.png
```

Then build with `TYPELAPSE_APP_URL` set (see `checklist.md`): the build turns
`/og.png` into an absolute URL, which is the only form crawlers read.

## 5. The Action's comment

A screenshot of the comment the Action posts on a pull request of this
repository (`.github/workflows/render-pr.yml`). Open any pull request against
`main` once the repository variable `TYPELAPSE_STUDIO_URL` is set, so the link
in the comment opens the deployed studio rather than a local one.

## 6. The skill's answer

```bash
npx skills add delhombre/typelapse --skill typelapse-pr-to-video
```

Then ask the agent to render a public pull request and screenshot its three
line answer (path, measured line, studio link).
