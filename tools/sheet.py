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
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
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

# Gain that makes the licence plate — the one certain neutral in frame — read
# 236,236,236. See docs/REFERENCE-PHOTO.md.
WB_GAIN = (0.948, 1.013, 1.073)

# The car in the photograph, traced by hand as a polygon in fractions of the
# frame. Everything the tool says about "the car" is read through this.
#
# It has to be hand-traced because there is no other way to get it: the frame
# has two people leaning on the car, trees behind it and a road under it. The
# polygon deliberately stops short of the people at the left and of the road
# at the lower right — it is 17.8 % of the frame and is car all the way
# through, which was checked by overlaying it.
# The painted bodywork visible in the SAME frame — bonnet, front panel and the
# right wing's outer face. Traced the same way and checked by overlay.
#
# This exists because `PAINT_TARGET` above is a *vertical fender face*, and at
# the `photomatch` pose there is no vertical fender face in frame: the camera
# is dead ahead of the nose. Nearly all the paint it can see is the bonnet,
# which is a horizontal mirror and is therefore strongly blue — the photograph
# measures (91, 110, 134) there, B-R of +43, where a fender face is neutral.
# Judging this frame against the fender number asks the bonnet to be grey.
PHOTO_PAINT_POLY = [
    (0.5971, 0.4590), (0.7143, 0.4457), (0.8071, 0.4495), (0.8714, 0.4781),
    (0.9129, 0.5219), (0.9371, 0.5733), (0.9486, 0.6152), (0.9386, 0.6305),
    (0.8229, 0.6248), (0.7143, 0.6286), (0.5986, 0.6305),
]

PHOTO_CAR_POLY = [
    (0.5943, 0.2838), (0.8000, 0.2800), (0.8300, 0.3010), (0.8729, 0.3962),
    (0.9229, 0.5067), (0.9500, 0.6114), (0.9643, 0.7219), (0.9586, 0.8210),
    (0.7857, 0.8362), (0.5957, 0.8286),
]
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


def photo_pixels(poly):
    """A traced region of the photograph, white-balanced, as an N×3 array."""
    ref = np.array(Image.open(REFERENCE_PHOTO).convert("RGB")).astype(float)
    h, w = ref.shape[:2]
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).polygon([(fx * w, fy * h) for fx, fy in poly], fill=255)
    return np.clip(ref * np.array(WB_GAIN), 0, 255)[np.array(m) > 127]


def photo_car_pixels():
    return photo_pixels(PHOTO_CAR_POLY)


def silhouette_mask(render_path: Path, shape, suffix="mask"):
    """
    Exact car mask from the silhouette frame `shoot.mjs --mask` writes.

    Falls back to the old "a pixel far from its own row's median is car" rule
    when that frame is absent, and says so — loudly, because that rule is what
    this whole gate used to believe and it was wrong. The background was a
    smooth gradient when it was written; once the environment grew trees, road
    texture and a HUD it selected 57 % of the frame, so `car_median` and the
    crush figure were describing the whole scene. Both reference constants in
    this file were fitted to that, and both were wrong.
    """
    mp = render_path.parent / f"{render_path.stem}_{suffix}.png"
    if mp.exists():
        mk = np.array(Image.open(mp).convert("RGB").resize((shape[1], shape[0]))).astype(float)
        r, g, b = mk[..., 0], mk[..., 1], mk[..., 2]
        # The silhouette is drawn in magenta and still goes through the
        # grade, so test the hue rather than the value. ACES cannot turn
        # magenta white — its input matrix gives the green channel only
        # 0.076 R + 0.134 B — and nothing else in the scene has both R and B
        # well above G. Bloom could: it takes everything over its threshold,
        # blurs it and adds it back, so a bright sky spilling white over the
        # car lifts green until the test fails. It did exactly that once, and
        # the gate then dropped the headlamps from the mask and reported
        # "above 224 = 0.0 %" on a frame whose lamps measured 233. The chain
        # now stands bloom and defocus down for this frame
        # (`PostChain.setMaskMode`), so the margin here can be generous.
        m = (r > g * 1.15) & (b > g * 1.15) & ((r + b) * 0.5 > 40)
        # Shed the two pixels of bloom spill and defocus around the edge.
        m = np.array(Image.fromarray((m * 255).astype(np.uint8))
                     .filter(ImageFilter.MinFilter(5))) > 127
        # A mask that silently selects nothing, or the whole frame, is how the
        # rule this replaced went wrong for several rounds without anyone
        # noticing. The car is 16-18 % of the frame at every standard pose.
        frac = 100 * m.mean()
        if suffix == "mask" and not 3.0 < frac < 40.0:
            print(f"  !! car mask is {frac:.1f}% of the frame — that is not a car. "
                  f"Check {mp.name}; every figure below is meaningless.", file=sys.stderr)
        return m, True
    return None, False


def tone_profile(px, bins=16):
    """Distribution of luminance over a set of pixels, as percentages."""
    lum = px.mean(axis=1)
    return np.histogram(lum, bins=bins, range=(0, 256))[0] / max(len(lum), 1) * 100.0


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

    car_mask, exact = silhouette_mask(render_path, a.shape[:2])
    paint_mask, _ = silhouette_mask(render_path, a.shape[:2], "paint")
    if car_mask is None:
        row_bg = np.median(a, axis=1, keepdims=True)
        car_mask = np.abs(a - row_bg).mean(axis=2) > 12.0

    # Search only where the body colour actually is.
    #
    # Masking to "the car" is not enough. At the `photomatch` pose — dead-on
    # front — there is no vertical fender face in frame at all, so a search for
    # "a near-neutral mid-value patch on the car" lands on the grille, and the
    # gate then asks the grille to be the colour of a fender. That is exactly
    # what happened: twelve patch positions were frozen into this file as an
    # ungameable second metric, and four of the ten that qualified sat dead
    # centre on the grille aperture. The photograph's grille measures 41
    # white-balanced; the metric was asking for 149, and it scored 13.5 on a
    # grille that was rendering silver — i.e. it scored well ON the defect, and
    # jumped to 57.5 the moment the grille was fixed. Frozen positions are gone
    # and the app marks the paint itself.
    search_mask = paint_mask if paint_mask is not None else car_mask
    candidates = []
    for fy in np.arange(0.28, 0.72, 0.02):
        for fx in np.arange(0.10, 0.92, 0.02):
            y0, y1 = int(hgt * fy), int(hgt * (fy + 0.05))
            x0, x1 = int(wid * fx), int(wid * (fx + 0.03))
            if search_mask[y0:y1, x0:x1].mean() < 0.92:
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
        # Report the MEDIAN of the qualifying patches, not the best one.
        #
        # Taking the minimum cherry-picks whichever patch happens to sit
        # closest, which is both flattering and unstable — on repeat runs of an
        # identical build it swung 11.1 to 15.9 and picked patches ranging from
        # saturation 0.050 to 0.128. A gate you cannot reproduce cannot be
        # regressed against.
        # Median of the ten closest, not the single closest and not the median
        # of everything. The single closest cherry-picks and swung 11.1-15.9
        # across repeat runs of an identical build; the median of all
        # qualifying patches drags in glass, trim and highlights that are
        # legitimately a different colour. The ten closest are the surface
        # family the target was measured from, and their median is stable.
        top = candidates[: min(10, len(candidates))]
        dist = float(np.median([c[0] for c in top]))
        med = np.median(np.array([c[1] for c in top]), axis=0)
        best = candidates[0]
        sat = float(np.median([c[2] for c in top]))
        where = (f"median of {len(top)} closest of {len(candidates)}, "
                 f"best {best[0]:.1f} at x {best[3]:.2f} y {best[4]:.2f}")
    else:
        med = np.array([0.0, 0.0, 0.0])
        dist = float("nan")
        where = "NO PAINT FOUND ON THE CAR — gate did not run"

    # Tone: the whole distribution, not one number.
    #
    # "Car median 131, crush 3.2 %" were both invented. They were fitted
    # through the row-median mask above, which at the time was selecting more
    # than half the frame, so they described the scene and not the car — and
    # the lighting was calibrated to them for several rounds. Measured through
    # the traced polygon, the photograph's car is median 95 with 11.5 % of it
    # below 40.
    #
    # A median alone hides the failure this render actually has, which is that
    # it is compressed towards the middle: it is short of BOTH deep shadow and
    # clipped highlight, in the same frame, and a median moves for neither. So
    # compare the whole histogram and report the total-variation distance —
    # half the sum of the absolute differences, i.e. the percentage of the
    # car's pixels that would have to move bucket to match the photograph.
    car_px = a[car_mask]
    car_median = float(np.median(car_px)) if car_px.size else float("nan")
    crushed = float((car_px.mean(axis=1) < 40).mean() * 100) if car_px.size else float("nan")
    ref_px = photo_car_pixels()
    ref_median = float(np.median(ref_px))
    ref_crush = float((ref_px.mean(axis=1) < 40).mean() * 100)
    ref_clip = float((ref_px.mean(axis=1) > 224).mean() * 100)
    clipped = float((car_px.mean(axis=1) > 224).mean() * 100) if car_px.size else float("nan")
    tone_tv = float(np.abs(tone_profile(car_px) - tone_profile(ref_px)).sum() * 0.5)

    note = (
        f"paint target (white-balanced fender)  #{PAINT_TARGET[0]:02x}{PAINT_TARGET[1]:02x}{PAINT_TARGET[2]:02x}"
        f"     render centre patch  #{int(med[0]):02x}{int(med[1]):02x}{int(med[2]):02x}"
        f"     RGB distance {dist:.1f}   ({where})"
    )
    d.text((gap, h + 74), note, fill=(150, 155, 162), font=fs)
    d.text(
        (gap, h + 98),
        "check: nose height · grille-to-lamp width ratio 1.81:1 · lamp aspect · bumper depth · "
        "plate position · roof rails present · glass flushness · amber corner lens runs to the "
        "silhouette with no chrome outboard of it",
        fill=(120, 125, 132),
        font=fs,
    )

    out_path = render_path.parent / f"_compare_{render_path.stem}.png"
    out.save(out_path)
    print(f"✓ {out_path}")
    print(f"  nearest paint patch to the fender target #92939b: {best[0]:.1f} "
          f"at x {best[3]:.2f} y {best[4]:.2f}, {len(candidates)} qualified"
          if candidates else "  NO PAINT FOUND")
    print(f"      (a diagnostic, not a gate, at this pose — #92939b is a vertical "
          f"fender face and there is no vertical fender face in a dead-on front view)")
    print(f"  paint mask: {'exact' if paint_mask is not None else 'NOT SHOT — search fell back to the whole car'}"
          f"  ({100 * search_mask.mean():.1f}% of frame)")
    if paint_mask is not None and paint_mask.any():
        pm = np.median(a[paint_mask], axis=0)
        rp = np.median(photo_pixels(PHOTO_PAINT_POLY), axis=0)
        de = float(np.sqrt(((pm - rp) ** 2).sum()))
        print(f"  body colour, over the paint only:  render "
              f"({int(pm[0])},{int(pm[1])},{int(pm[2])})  vs photo "
              f"({int(rp[0])},{int(rp[1])},{int(rp[2])})   dRGB {de:.1f} (aim < 12)")
        print(f"      B-R {pm[2] - pm[0]:+.0f} vs {rp[2] - rp[0]:+.0f}"
              f"   — the paint in this frame is nearly all bonnet, and a bonnet"
              f" mirrors the sky")
    print(f"  car mask: {'exact silhouette' if exact else 'ROW-MEDIAN GUESS — shoot with --mask'}"
          f"  ({100 * car_mask.mean():.1f}% of frame)")
    print(f"  tone profile {tone_tv:.1f}% apart from the photograph (aim < 8)")
    print(f"      median   {car_median:6.1f}  vs {ref_median:6.1f}")
    print(f"      below 40 {crushed:5.1f}%  vs {ref_crush:5.1f}%   (shadow)")
    print(f"      above 224{clipped:5.1f}%  vs {ref_clip:5.1f}%   (highlight)")
    bins = np.linspace(0, 256, 17)
    rp, pp = tone_profile(car_px), tone_profile(ref_px)
    for i in range(16):
        bar = "#" * int(round(rp[i])) or "."
        ref_bar = "#" * int(round(pp[i])) or "."
        print(f"      {int(bins[i]):3d}-{int(bins[i+1]):3d}  render {rp[i]:5.1f}% {bar:<22s}"
              f" photo {pp[i]:5.1f}% {ref_bar}")
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
