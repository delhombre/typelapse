"""
Rebuild the self-hosted Fira Code, Source Code Pro, IBM Plex Mono, Cascadia Code
and Inter files under public/fonts from their upstream releases.

    python3 -m venv venv && venv/bin/pip install fonttools==4.66.1 brotli==1.2.0
    venv/bin/python scripts/subset-fonts.py <folder holding the upstream files>

Upstream (all SIL OFL 1.1, licences beside the fonts). The file to take out of
each release archive, and the archive:

    FiraCode-VF.woff2              woff2/ in
        https://github.com/tonsky/FiraCode/releases/download/6.2/Fira_Code_v6.2.zip
    SourceCodeVF-Upright.ttf       VF/ in
        https://github.com/adobe-fonts/source-code-pro/releases/download/2.042R-u%2F1.062R-i%2F1.026R-vf/VF-source-code-VF-1.026R.zip
    IBM Plex Mono Var-Roman.woff2  fonts/complete/woff2/ in
        https://github.com/IBM/plex/releases/download/%40ibm%2Fplex-mono-variable%401.0.0/plex-mono-variable.zip
    CascadiaCode.woff2             woff2/ in
        https://github.com/microsoft/cascadia-code/releases/download/v2407.24/CascadiaCode-2407.24.zip
    InterVariable.woff2            web/ in
        https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip

Each family is cut at the unicode ranges of SUBSET_RANGES in
src/application/fonts/code-fonts.ts (tests/application/subset-ranges.test.ts
fails when the two lists drift), so a document only fetches the subset a
character needs. Variable axes, layout features (ligatures) and the original
`name` tables are kept.
"""

import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

OUT = Path(__file__).resolve().parent.parent / "public" / "fonts"

# Cyrillic and Cyrillic-ext, Greek and Greek-ext, Latin-ext and Vietnamese are
# each one file here: the registry's ranges are the unions of Google's blocks.
CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116, U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F"
GREEK = "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF, U+1F00-1FFF"
LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD"
LATIN_EXT = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF, U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB"
# The box drawing Google serves Fira Code and Cascadia Code with.
SYMBOLS = "U+2000-2001, U+2004-2008, U+200A, U+23B8-23BD, U+2500-259F"

BASE = [("latin", LATIN), ("latin-ext", LATIN_EXT), ("cyrillic", CYRILLIC), ("greek", GREEK)]
FAMILIES = {
    "FiraCode": ("FiraCode-VF.woff2", BASE + [("symbols", SYMBOLS)]),
    "SourceCodePro": ("SourceCodeVF-Upright.ttf", BASE),
    "IBMPlexMono": ("IBM Plex Mono Var-Roman.woff2", BASE),
    "CascadiaCode": ("CascadiaCode.woff2", BASE + [("symbols", SYMBOLS)]),
    "Inter": ("InterVariable.woff2", BASE),
}


# Inter ships a weight axis of 100-900 and an optical-size axis; captions are set
# in 400 to 600 at the text size, so the file keeps only that and the layout
# features a caption reads (the rest of its stylistic sets are not on offer).
INTER_AXES = {"wght": (400, 600), "opsz": 14}
INTER_FEATURES = ["calt", "ccmp", "kern", "liga", "locl", "mark", "mkmk", "tnum"]


def codepoints(ranges: str) -> list[int]:
    found = []
    for part in ranges.replace("U+", "").split(","):
        low, _, high = part.strip().partition("-")
        found.extend(range(int(low, 16), int(high or low, 16) + 1))
    return found


def load(path: Path, family: str) -> TTFont:
    font = TTFont(path)
    if family != "Inter":
        return font
    # Instanced, then written out and read back: the subsetter wants a font it
    # loaded from bytes, not one the instancer left half lazy.
    buffer = io.BytesIO()
    instancer.instantiateVariableFont(font, INTER_AXES).save(buffer)
    buffer.seek(0)
    return TTFont(buffer)


def main(src: Path) -> None:
    for family, (source, subsets) in FAMILIES.items():
        for name, ranges in subsets:
            font = load(src / source, family)
            options = subset.Options()
            options.flavor = "woff2"
            options.layout_features = INTER_FEATURES if family == "Inter" else ["*"]
            options.notdef_outline = True
            options.name_IDs = ["*"]
            subsetter = subset.Subsetter(options)
            subsetter.populate(unicodes=codepoints(ranges))
            subsetter.subset(font)
            out = OUT / f"{family}-{name}.woff2"
            font.flavor = "woff2"
            font.save(out)
            print(f"{out.name}: {out.stat().st_size} bytes")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
