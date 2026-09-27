#!/usr/bin/env python3
"""
Contact sheet + reference comparison for review rounds.

A reviewer judging one render at a time drifts. Putting the render next to the
reference photograph, at matched scale, in one image, makes errors that were
invisible in isolation obvious.

    python3 tools/sheet.py --dir renders/round1
        → renders/round1/_sheet.png, every view tiled and labelled

    python3 tools/sheet.py --compare renders/round1/photomatch.png
        → a side-by-side against the original photograph, plus a difference
          read on the paint colour

    python3 tools/sheet.py --dir renders/round1 --vs renders/round0
        → this round beside the last one, per view, to answer "is it better"
"""

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np
except ImportError:
    sys.exit("needs Pillow and numpy: python3 -m pip install pillow numpy")

ROOT = Path(__file__).resolve().parent.parent
REFERENCE_PHOTO = Path(
    "/private/tmp/claude-501/-Volumes-Projects-5000/"
    "bc0b881c-63e9-46d6-b86f-3f81684efba2/images/1.jpg"
)

# Paint target, white-balanced, sampled from the photograph's fender faces.
PAINT_TARGET = (0x92, 0x93, 0x9B)

VIEW_ORDER = [
    "side", "front3q", "rear3q", "front", "rear", "top",
    "wheel", "headlight", "taillight", "platecam", "badge", "roofrail",
    "interior", "dash", "photomatch",
]


def font(size=22):
    for p in (
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return ImageFont.load_default()


def label(img, text, sub=""):
    """Caption a tile without covering it."""
    d = ImageDraw.Draw(img, "RGBA")
    f, fs = font(24), font(17)
    d.rectangle([0, 0, img.width, 40], fill=(0, 0, 0, 190))
    d.text((12, 8), text, fill=(240, 240, 240), font=f)
    if sub:
        w = d.textlength(sub, font=fs)
        d.text((img.width - w - 12, 12), sub, fill=(150, 155, 162), font=fs)
    return img


def contact_sheet(directory: Path, cols=3, tile_w=760):
    pngs = {p.stem: p for p in sorted(directory.glob("*.png")) if not p.stem.startswith("_")}
    if not pngs:
        sys.exit(f"no PNGs in {directory}")

    names = [v for v in VIEW_ORDER if v in pngs] + [k for k in pngs if k not in VIEW_ORDER]
    tiles = []
    for n in names:
        im = Image.open(pngs[n]).convert("RGB")
        h = int(im.height * tile_w / im.width)
        im = im.resize((tile_w, h), Image.LANCZOS)
        tiles.append(label(im, n, f"{Image.open(pngs[n]).width}px"))

    rows = (len(tiles) + cols - 1) // cols
    row_h = [max(t.height for t in tiles[r * cols:(r + 1) * cols]) for r in range(rows)]
    pad = 10
    sheet = Image.new(
        "RGB",
        (cols * tile_w + pad * (cols + 1), sum(row_h) + pad * (rows + 1)),
        (16, 17, 19),
    )
    y = pad
    for r in range(rows):
        x = pad
        for t in tiles[r * cols:(r + 1) * cols]:
            sheet.paste(t, (x, y))
            x += tile_w + pad
        y += row_h[r] + pad

    out = directory / "_sheet.png"
    sheet.save(out)
    print(f"✓ {out}  ({len(tiles)} views, {sheet.width}×{sheet.height})")
    return out


def wb(a):
    """White-balance an array with the gains derived in docs/REFERENCE-PHOTO.md."""
    return np.clip(a * np.array([0.9478, 1.0129, 1.0727]), 0, 255)


def compare_to_photo(render_path: Path):
    if not REFERENCE_PHOTO.exists():
        sys.exit(f"reference photograph not found at {REFERENCE_PHOTO}")

    ref = Image.open(REFERENCE_PHOTO).convert("RGB")
    ren = Image.open(render_path).convert("RGB")

    h = 900
    ref_r = ref.resize((int(ref.width * h / ref.height), h), Image.LANCZOS)
    ren_r = ren.resize((int(ren.width * h / ren.height), h), Image.LANCZOS)

    gap = 14
    out = Image.new("RGB", (ref_r.width + ren_r.width + gap * 3, h + 130), (16, 17, 19))
    out.paste(ref_r, (gap, 56))
    out.paste(ren_r, (ref_r.width + gap * 2, 56))

    d = ImageDraw.Draw(out)
    f, fs = font(26), font(18)
    d.text((gap, 16), "REFERENCE PHOTOGRAPH  ·  1988", fill=(235, 235, 235), font=f)
    d.text((ref_r.width + gap * 2, 16), f"RENDER  ·  {render_path.stem}", fill=(235, 235, 235), font=f)

    # Paint readout from the render: sample the brightest large neutral region
    # in the lower-middle of the frame, which is where bodywork lands in the
    # photomatch pose.
    # Find the paint rather than assuming where it is — but only ON THE CAR.
    #
    # This gate has now failed twice in opposite directions. First it sampled a
    # fixed patch and read the grille, reporting 112 while the paint was within
    # 6. Then it searched for a near-neutral mid-value patch and happily found
    # EMPTY ROAD HAZE 250 px from the car, reporting "3.9, PASS" while shaded
    # body panels were two stops too dark. A gate that can pass on background
    # is worse than no gate: it actively hid that defect for two review rounds.
    #
    # So the search is now masked to the car. The background in every view is a
    # smooth horizontal gradient — sky above, road below — so a pixel that
    # differs markedly from its own row's median is car, and one that doesn't
    # is not. A candidate patch must be almost entirely inside that mask.
    a = np.array(ren.convert("RGB")).astype(float)
    hgt, wid = a.shape[:2]
    tgt = np.array(PAINT_TARGET, dtype=float)

    row_bg = np.median(a, axis=1, keepdims=True)
    car_mask = np.abs(a - row_bg).mean(axis=2) > 12.0

    candidates = []
    for fy in np.arange(0.28, 0.72, 0.02):
        for fx in np.arange(0.10, 0.92, 0.02):
            y0, y1 = int(hgt * fy), int(hgt * (fy + 0.05))
            x0, x1 = int(wid * fx), int(wid * (fx + 0.03))
            if car_mask[y0:y1, x0:x1].mean() < 0.92:
                continue
            block = a[y0:y1, x0:x1].reshape(-1, 3)
            if block.size == 0:
                continue
            m = np.median(block, axis=0)
            hi, lo = m.max(), m.min()
            sat = (hi - lo) / max(hi, 1.0)
            if sat < 0.13 and 40.0 < hi < 210.0:
                candidates.append((float(np.sqrt(((m - tgt) ** 2).sum())), m, sat, fx, fy))

    if candidates:
        candidates.sort(key=lambda c: c[0])
        dist, med, sat, fx, fy = candidates[0]
        where = f"on car at x {fx:.2f} y {fy:.2f}, sat {sat:.3f}"
    else:
        med = np.array([0.0, 0.0, 0.0])
        dist = float("nan")
        where = "NO PAINT FOUND ON THE CAR — gate did not run"

    # Brightness of the car overall, which is the thing a single patch hides.
    car_px = a[car_mask]
    car_median = float(np.median(car_px)) if car_px.size else float("nan")
    crushed = float((car_px.mean(axis=1) < 40).mean() * 100) if car_px.size else float("nan")

    note = (
        f"paint target (white-balanced fender)  #{PAINT_TARGET[0]:02x}{PAINT_TARGET[1]:02x}{PAINT_TARGET[2]:02x}"
        f"     render centre patch  #{int(med[0]):02x}{int(med[1]):02x}{int(med[2]):02x}"
        f"     RGB distance {dist:.1f}   ({where})"
    )
    d.text((gap, h + 74), note, fill=(150, 155, 162), font=fs)
    d.text(
        (gap, h + 98),
        "check: nose height · grille-to-lamp width ratio 1.41:1 · lamp aspect · bumper depth · "
        "plate position · roof rails present · glass flushness",
        fill=(120, 125, 132),
        font=fs,
    )

    out_path = render_path.parent / f"_compare_{render_path.stem}.png"
    out.save(out_path)
    print(f"✓ {out_path}")
    print(f"  paint distance from photograph target: {dist:.1f} (aim < 18)  [{where}]")
    print(f"  car median level {car_median:.0f} (photograph 131)   "
          f"pixels below 40: {crushed:.1f}% (photograph 3.2%)")
    return out_path


def side_by_side(new_dir: Path, old_dir: Path, tile_w=820):
    news = {p.stem: p for p in new_dir.glob("*.png") if not p.stem.startswith("_")}
    olds = {p.stem: p for p in old_dir.glob("*.png") if not p.stem.startswith("_")}
    common = [v for v in VIEW_ORDER if v in news and v in olds]
    if not common:
        sys.exit("no views in common between the two directories")

    rows = []
    for n in common:
        a = Image.open(olds[n]).convert("RGB")
        b = Image.open(news[n]).convert("RGB")
        ha = int(a.height * tile_w / a.width)
        a = label(a.resize((tile_w, ha), Image.LANCZOS), n, f"before · {old_dir.name}")
        b = label(b.resize((tile_w, ha), Image.LANCZOS), n, f"AFTER · {new_dir.name}")
        row = Image.new("RGB", (tile_w * 2 + 12, ha), (16, 17, 19))
        row.paste(a, (0, 0))
        row.paste(b, (tile_w + 12, 0))
        rows.append(row)

    sheet = Image.new("RGB", (rows[0].width, sum(r.height + 12 for r in rows) + 12), (16, 17, 19))
    y = 12
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 12
    out = new_dir / "_vs.png"
    sheet.save(out)
    print(f"✓ {out}  ({len(rows)} view pairs)")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, help="render directory to tile")
    ap.add_argument("--compare", type=Path, help="single render to put beside the photograph")
    ap.add_argument("--vs", type=Path, help="previous round directory, for a before/after")
    ap.add_argument("--cols", type=int, default=3)
    a = ap.parse_args()

    if a.compare:
        compare_to_photo(a.compare)
    if a.dir and a.vs:
        side_by_side(a.dir, a.vs)
    elif a.dir:
        contact_sheet(a.dir, cols=a.cols)
    if not (a.dir or a.compare):
        ap.print_help()
