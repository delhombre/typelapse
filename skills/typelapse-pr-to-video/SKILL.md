---
name: typelapse-pr-to-video
description: Render a GitHub pull request into a code video with Typelapse, on this machine, and return the file plus a link that opens the same project in the Typelapse editor. Use when asked to turn a PR, a commit or the current branch into a video, a GIF or a changelog clip.
---

# Typelapse: pull request to video

The Typelapse CLI renders the change through the studio's own export, so the
file is the one the editor would export and the link reopens it there for
editing. Walk the five steps in order, every run.

## 1. Resolve the source to one argument

| The user gave | Argument |
| --- | --- |
| `https://github.com/<owner>/<repo>/pull/<n>` or `.../commit/<sha>` | the URL as is |
| `<owner>/<repo>#<n>` | `https://github.com/<owner>/<repo>/pull/<n>` |
| "this PR", "my PR" | `gh pr view --json url -q .url`, run in the user's repository |
| "my branch", or `gh pr view` finds no PR | `git diff "$(git merge-base origin/HEAD HEAD)" > "$PWD/typelapse.diff"`, then the absolute path of that file |

Done when you hold exactly one URL or one absolute diff path. The CLI reads
GitHub links only as full URLs, so expand the short forms yourself.

## 2. Find the Typelapse checkout

The CLI is not on npm; it runs from a checkout. Use the first that applies:

1. The current directory's `package.json` has `"name": "typelapse"`: `DIR="$PWD"`.
2. Otherwise `DIR="${TYPELAPSE_HOME:-$HOME/.typelapse}"`. If `$DIR/package.json`
   is missing, tell the user in one sentence that you are cloning Typelapse
   there, then `git clone --depth 1 https://github.com/delhombre/typelapse "$DIR"`.
3. If `$DIR/node_modules` is missing, run `pnpm --dir "$DIR" install --frozen-lockfile`.

When `$DIR/node_modules/.remotion` is missing, the render downloads Remotion's
headless Chrome (about 100 MB) first: say so in one sentence and give that run a
600 second timeout. Otherwise a small PR takes 15 to 60 seconds.

## 3. Render

```bash
GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}" \
  pnpm --silent --dir "$DIR" typelapse render "<argument>" --json --open --out "$PWD/"
```

- Add `--format`, `--size`, `--fps` or `--theme` only when the user named that
  choice ("as a GIF" is `--format gif`). The defaults are the studio's export
  defaults, which is what makes the link reopen the same picture.
- The token lifts GitHub's 60 requests an hour and reads private repositories;
  the CLI sends it to api.github.com only.
- `--open` adds `studioUrl` to the JSON; `--json` makes stdout exactly one JSON
  line, with progress on stderr. Parse the last stdout line.

## 4. Branch on the exit code

- **Exit 0**: go to step 5.
- **Exit 2**: the JSON `error` names the argument or the file that is wrong. Fix
  that one thing and rerun once; a second exit 2 goes to the user verbatim.
- **Exit 3**: GitHub refused the source (private, missing, rate-limited,
  offline). Rerun only after something changed: a token now set, a corrected
  URL. Otherwise give the user the `error` sentence and ask for `gh auth login`.
- **Exit 4**: the render failed. Rerun once, since a first-run browser download
  can break midway; a second exit 4 goes to the user with the `error` sentence
  and the last 20 lines of stderr.

## 5. Report

Reply with these lines, in this order:

1. The absolute `path`, then the measured facts from the JSON:
   `width`x`height`, `fps` fps, `durationMs / 1000` s and `bytes / 1048576` MB
   (both to one decimal, the units the PR comment uses), `codec`.
   Describe the video only through these fields: you have not watched it.
2. The `studioUrl`. When it starts with `http://localhost`, add the command that
   serves that studio first, with `$DIR` written out as its absolute path:
   `pnpm --dir /abs/path/to/typelapse dev`. The link carries the PR
   address, so the editor imports the same change; nothing is uploaded.
3. For an MP4 or a WebM, one sentence: this file comes from the server
   renderer in 4:2:0 chroma (H.264 or VP8), and the sharpest file, AV1 4:4:4,
   is the WebM export inside the studio. Skip it for a GIF.
