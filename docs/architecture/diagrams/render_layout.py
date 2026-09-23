"""Render an architecture diagram from a hand-placed layout spec.

    python render_layout.py versions/<vN-date-name>/<stem>-layout.json --out-dir versions/<vN-date-name>

Copied from the audited-architecture-diagram skill. Local changes: rules 16 to 18
and the [code] inbound-label check (grammar_check), the decision-vertex check now
actually receives node kinds, kind:<tag> and status_bd legend samples, a wrapped
footnote, and a fourth route number that moves the arrival on auto routes.

Reads the spec, lays the grid out for both orientations, writes SVG, runs the audit,
and rasterises to PNG with headless Chrome. Deterministic: the same spec produces the
same pixels.

Grid coordinates live in the spec in top-down terms (col across, row down). The LR
orientation is the transpose, computed here, so both pictures come from one set of
numbers and cannot drift apart. Both specs share node ids, so the lean picture and the
detailed picture name the same things.

The audit prints four counts per orientation and exits non-zero if any is non-zero:

    overlap        boxes, panels or a node escaping its panel
    label          any text box touching another text box, a shape, a panel title
                   band, a step badge chip or the human-decision glyph
    isolated       nodes with degree 0 (a floating box is a defect)
    headless       drawn edge paths with no arrow marker (every edge is an arrow)

Stdlib only. Chrome is used for rasterising; without it the SVG is still written.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
from xml.sax.saxutils import escape

FONT = "Trebuchet MS, Verdana, Arial, sans-serif"

# Character widths used to bound a text run. Deliberately generous: the audit must
# not pass a label that in fact touches its neighbour.
CW_BOLD13 = 6.7
CW_SMALL = 5.3
ASCENT = 0.80           # ink above the baseline, as a fraction of the font size
DESCENT = 0.25          # ink below it

BADGE_W = 30            # the step-number chip
GLYPH_SLOT = 20         # the reserved slot for the human-decision glyph
TEXT_PAD_L = 14         # gap between the badge/glyph block and the first character
FR_FILL = "#00695C"     # the requirement chip: teal pill, right-hand end
FR_PAD = 12             # gap between the caption and the requirement chip
GLYPH_H = 30            # the engineer glyph, drawn as one block with its caption
CLEAR = 9               # clear pixels every text run must keep from anything else


# --------------------------------------------------------------- geometry
class Grid:
    """Maps (col, row) cells to pixels, transposing for the LR orientation."""

    def __init__(self, spec, orientation):
        g = spec["grid"]
        self.o = orientation
        self.gap = g["gap"]
        self.margin = g["margin"]
        self.pad = g["panel_pad"]
        cell_pad = g.get("cell_pad", 34)
        cell_pad_x = g.get("cell_pad_cross", cell_pad)
        gap_x = g.get("gap_cross", g["gap"])
        cols = sorted({n["col"] for n in spec["nodes"]})
        rows = sorted({n["row"] for n in spec["nodes"]})
        cls = spec["classes"]
        wide = {}
        tall = {}
        for n in spec["nodes"]:
            sz = cls[n["cls"]]
            wide[n["col"]] = max(wide.get(n["col"], 0), sz["w"])
            tall[n["row"]] = max(tall.get(n["row"], 0), sz["h"])
            if orientation == "lr":
                wide.setdefault(n["col"], 0)
        if orientation == "td":
            cw = [wide[c] + cell_pad_x for c in cols]
            rh = [tall[r] + cell_pad for r in rows]
        else:
            # x is indexed by row, y by column: size each from the boxes in it
            byrow_w, bycol_h = {}, {}
            for n in spec["nodes"]:
                sz = cls[n["cls"]]
                byrow_w[n["row"]] = max(byrow_w.get(n["row"], 0), sz["w"])
                bycol_h[n["col"]] = max(bycol_h.get(n["col"], 0), sz["h"])
            cw = [bycol_h[c] + cell_pad_x for c in cols]
            rh = [byrow_w[r] + cell_pad for r in rows]
        if orientation == "td":
            self.xs, self.ws = self._axis(cw, gap_x), cw
            self.ys, self.hs = self._axis(rh, self.gap), rh
        else:
            self.xs, self.ws = self._axis(rh, self.gap), rh
            self.ys, self.hs = self._axis(cw, gap_x), cw
        self.cindex = {c: i for i, c in enumerate(cols)}
        self.rindex = {r: i for i, r in enumerate(rows)}
        self.cols, self.rows = cols, rows

    def _axis(self, sizes, gap=None):
        gap = self.gap if gap is None else gap
        out, acc = [], self.margin
        for s in sizes:
            out.append(acc)
            acc += s + gap
        return out

    def cell(self, col, row):
        """Cell rectangle (x, y, w, h) in pixels."""
        ci, ri = self.cindex[col], self.rindex[row]
        if self.o == "td":
            return self.xs[ci], self.ys[ri], self.ws[ci], self.hs[ri]
        return self.xs[ri], self.ys[ci], self.ws[ri], self.hs[ci]

    def extent(self):
        w = self.xs[-1] + self.ws[-1] + self.margin
        h = self.ys[-1] + self.hs[-1] + self.margin
        return w, h


def place(spec, grid):
    """Absolute boxes for every node, centred in its cell."""
    boxes = {}
    for n in spec["nodes"]:
        cx, cy, cw, ch = grid.cell(n["col"], n["row"])
        size = spec["classes"][n["cls"]]
        w, h = size["w"], size["h"]
        boxes[n["id"]] = (cx + (cw - w) / 2, cy + (ch - h) / 2, w, h)
    return boxes


def panel_boxes(spec, boxes):
    out = {}
    pad = spec["grid"]["panel_pad"]
    order = ([p for p in spec["panels"] if not p.get("parent")]
             + [p for p in spec["panels"] if p.get("parent")])
    order = list(reversed(order))          # children first, parents after
    for p in order:
        kids = [boxes[n["id"]] for n in spec["nodes"] if n.get("panel") == p["id"]]
        kids += [out[c["id"]] for c in spec["panels"]
                 if c.get("parent") == p["id"] and c["id"] in out]
        if not kids:
            continue
        x0 = min(k[0] for k in kids) - pad
        y0 = min(k[1] for k in kids) - pad - 18        # room for the title
        x1 = max(k[0] + k[2] for k in kids) + pad
        y1 = max(k[1] + k[3] for k in kids) + pad
        out[p["id"]] = (x0, y0, x1 - x0, y1 - y0)
    return out


# --------------------------------------------------------------- drawing
def esc(s):
    return escape(s or "")


def shape_svg(n, box, spec):
    x, y, w, h = box
    fill = spec["palette"]["fill"][n["fill"]]
    stroke = spec["palette"]["status"][n["status"]]
    dash = ' stroke-dasharray="7 5"' if n["status"] in ("design", "future") else ""
    sw = 2.5
    if n["cls"] == "action":
        out = (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="{h/2}" '
               f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>')
        if n.get("asks"):
            out += (f'<rect x="{x+5:.1f}" y="{y+5:.1f}" width="{w-10}" height="{h-10}" '
                    f'rx="{(h-10)/2}" fill="none" stroke="{stroke}" stroke-width="1.4"/>')
        return out
    if n["cls"] == "decision":
        cx, cy = x + w / 2, y + h / 2
        pts = f"{cx},{y} {x+w},{cy} {cx},{y+h} {x},{cy}"
        return (f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" '
                f'stroke-width="{sw}"{dash}/>')
    if n["cls"] == "user":
        # Just the frame; label_svg draws the glyph and the caption as one block so
        # the pair is centred together and cannot drift apart.
        return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="8" '
                f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')
    return (f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="4" '
            f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{dash}/>')


def wrap(text, per_line):
    words, lines, cur = text.split(), [], ""
    for word in words:
        trial = (cur + " " + word).strip()
        if len(trial) > per_line and cur:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    if cur:
        lines.append(cur)
    return lines


def text_inset(n):
    """Pixels reserved on the left of an action for its badge chip and glyph."""
    if not n["badge"]:
        return 0
    return 10 + BADGE_W + (GLYPH_SLOT if n.get("asks") else 0) + TEXT_PAD_L


def caption_lines(n, per):
    """The caption's lines at a given characters-per-line budget."""
    lines = []
    if n["icon"]:
        lines.append((esc(n["icon"]), 10, "#546E7A", "normal", CW_SMALL))
    for ln in wrap(n["name"], per):
        lines.append((esc(ln), 13, "#1A2327", "bold", CW_BOLD13))
    if n["qualifier"]:
        for ln in wrap(n["qualifier"], int(per * CW_BOLD13 / CW_SMALL)):
            lines.append((esc(ln), 10, "#455A64", "normal", CW_SMALL))
    return lines


def fr_width(n):
    """Width the requirement chip needs, or 0 when the node claims none."""
    fr = (n.get("fr") or "").strip()
    return 0 if not fr else 16 + 6.6 * len(fr)


def side_pads(n):
    """Left inset (chips) and right pad (stroke, a stadium's rounded end, and the
    requirement chip when the node carries one)."""
    inset = text_inset(n)
    right = CLEAR + (12 if n["cls"] == "action" else 0)
    w = fr_width(n)
    return (inset if inset else CLEAR), right + (w + FR_PAD if w else 0)


def caption_ink(lines):
    """Height of the drawn text, from the top of the first line's ink to the
    bottom of the last line's, matching what label_svg actually paints."""
    if not lines:
        return 0.0
    return (ASCENT * lines[0][1]
            + sum(sz + 3 for _, sz, _, _, _ in lines[:-1])
            + DESCENT * lines[-1][1])


def fit_classes(spec, caps):
    """Shrink every class to the smallest box its own content needs.

    The spec's size is a CAP, not a fixture. Each class is wrapped at that cap,
    the widest line and the tallest caption in the class are measured, and the
    class is set to exactly that. Same size within a class, as the grammar wants,
    but the size is the content's, so a short caption no longer inherits the
    padding of the longest one. Returns what bound each class, to report.
    """
    bound = {}
    for cname, cap in caps.items():
        members = [n for n in spec["nodes"] if n["cls"] == cname]
        if not members:
            continue
        cap_w, cap_h = cap["w"], cap["h"]
        need_w, need_h = 0.0, 0.0
        by_w, by_h = "", ""
        for n in members:
            lpad, rpad = side_pads(n)
            per = max(11, int((cap_w - lpad - rpad) / CW_BOLD13))
            lines = caption_lines(n, per)
            widest = max((len(t) * cw for t, _, _, _, cw in lines), default=0.0)
            ink = caption_ink(lines)
            if cname == "decision":
                # a diamond only offers half its width at the text's own height,
                # so it has to be about twice the caption in both directions
                w = 2 * widest + 2 * CLEAR + 4
                h = max(2 * ink + 2 * CLEAR, 0.5 * w)
            else:
                # +4 so rounding the width to a whole pixel can never leave the
                # wrapper one character short and break a line that had fitted
                w = lpad + widest + rpad + 4
                h = ink + 2 * CLEAR + 8
                if cname == "user":
                    h += GLYPH_H + 10
                if n["badge"]:
                    h = max(h, 26 + 2 * CLEAR)      # the step chip must fit too
                if fr_width(n):
                    h = max(h, 22 + 2 * CLEAR)
                    w = max(w, lpad + 40)
            if w > need_w:
                need_w, by_w = w, n["id"]
            if h > need_h:
                need_h, by_h = h, n["id"]
        spec["classes"][cname] = {"w": int(min(cap_w, need_w) + 0.5),
                                  "h": int(min(cap_h, need_h) + 0.5)}
        bound[cname] = (spec["classes"][cname]["w"], by_w,
                        spec["classes"][cname]["h"], by_h)
    return bound


def label_svg(n, box):
    """The node caption, plus the bounding box the audit checks."""
    x, y, w, h = box
    inset = text_inset(n)
    is_user = n["cls"] == "user"
    # The usable text band: after the badge and glyph slot on the left, and clear
    # of the stroke (and of a stadium's rounded end) on the right. Wrapping and
    # centring both work off this band, so a caption cannot run to the edge.
    lpad, end_pad = side_pads(n)
    left = x + lpad
    right = x + w - end_pad
    cx = (left + right) / 2
    per = max(11, int((right - left) / CW_BOLD13))
    # A pill already has a badge (and maybe a person) at its left, so its caption
    # reads from just after them; centring it there leaves a hole between the two.
    align_left = bool(n["badge"])
    lines = caption_lines(n, per)
    # Centre what is actually PAINTED, not the line-advance sum: the two differ
    # by the leading, and the difference is what used to push a caption past the
    # bottom of a box sized from the ink.
    ink = caption_ink(lines)
    out = []
    if is_user:
        # glyph, a gap, then the caption: the whole block centred in the box
        block = GLYPH_H + 10 + ink
        top = y + (h - block) / 2
        gx, gy = x + w / 2, top
        out.append(f'<circle cx="{gx:.1f}" cy="{gy + 8:.1f}" r="8" '
                   f'fill="#2E7D32"/>')
        out.append(f'<path d="M{gx - 13:.1f},{gy + GLYPH_H:.1f} a13,17 0 0,1 26,0 z" '
                   f'fill="#2E7D32"/>')
        ty = top + GLYPH_H + 10 + lines[0][1] * ASCENT
    else:
        ty = y + (h - ink) / 2 + lines[0][1] * ASCENT
    widest = 0.0
    top = ty - ASCENT * lines[0][1] if lines else ty
    bottom = ty
    for txt, size, colour, weight, cwid in lines:
        widest = max(widest, len(txt) * cwid)
        tx = left if align_left else cx
        anchor = "start" if align_left else "middle"
        out.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-family="{FONT}" '
                   f'font-size="{size}" fill="{colour}" font-weight="{weight}" '
                   f'text-anchor="{anchor}">{txt}</text>')
        bottom = ty + DESCENT * size
        ty += size + 3
    lx = left if align_left else cx - widest / 2
    lbox = (lx, top, widest, bottom - top)
    return "".join(out), lbox


def badge_svg(n, box):
    """The step number as its own chip, and the human-decision glyph in its own slot.

    Returns the svg and the boxes the audit treats as obstacles.
    """
    x, y, w, h = box
    if not n["badge"]:
        if not fr_width(n):
            return "", []
        out, obstacles = "", []
        fw = fr_width(n)
        fr = n["fr"].strip()
        fx = x + w - CLEAR - fw
        fy = y + h / 2 - 11
        out = (f'<rect x="{fx:.1f}" y="{fy:.1f}" width="{fw:.1f}" height="22" '
               f'rx="11" fill="{FR_FILL}"/>'
               f'<text x="{fx + fw / 2:.1f}" y="{fy + 15.5:.1f}" font-family="{FONT}" '
               f'font-size="11" font-weight="bold" fill="#FFFFFF" '
               f'text-anchor="middle">{esc(fr)}</text>')
        return out, [(f"fr {n['id']}", (fx, fy, fw, 22))]
    bx, by = x + 10, y + h / 2 - 13
    out = (f'<rect x="{bx:.1f}" y="{by:.1f}" width="{BADGE_W}" height="26" rx="5" '
           f'fill="#1A2327"/>'
           f'<text x="{bx + BADGE_W/2:.1f}" y="{by + 18:.1f}" font-family="{FONT}" '
           f'font-size="15" font-weight="bold" fill="#FFFFFF" '
           f'text-anchor="middle">{esc(n["badge"].strip("[]"))}</text>')
    obstacles = [(f"badge {n['id']}", (bx, by, BADGE_W, 26))]
    fw = fr_width(n)
    if fw:
        fr = n["fr"].strip()
        fx = x + w - (CLEAR + (12 if n["cls"] == "action" else 0)) - fw
        fy = y + h / 2 - 11
        out += (f'<rect x="{fx:.1f}" y="{fy:.1f}" width="{fw:.1f}" height="22" '
                f'rx="11" fill="{FR_FILL}"/>'
                f'<text x="{fx + fw / 2:.1f}" y="{fy + 15.5:.1f}" font-family="{FONT}" '
                f'font-size="11" font-weight="bold" fill="#FFFFFF" '
                f'text-anchor="middle">{esc(fr)}</text>')
        obstacles.append((f"fr {n['id']}", (fx, fy, fw, 22)))
    if n.get("asks"):
        gx = bx + BADGE_W + 6
        gcx = gx + 9
        out += (f'<circle cx="{gcx:.1f}" cy="{by + 7:.1f}" r="5" fill="#E65100"/>'
                f'<path d="M{gcx - 8:.1f},{by + 24:.1f} a8,11 0 0,1 16,0 z" '
                f'fill="#E65100"/>')
        obstacles.append((f"glyph {n['id']}", (gx, by, 18, 26)))
    return out, obstacles


# --------------------------------------------------------------- routing
def side_point(box, side):
    x, y, w, h = box
    return {"n": (x + w / 2, y), "s": (x + w / 2, y + h),
            "w": (x, y + h / 2), "e": (x + w, y + h / 2)}[side]


def route(edge, boxes, grid, lanes, cells=None, kinds=None):
    """An orthogonal polyline for one edge, chosen by its routing hint."""
    a, b = boxes[edge["from"]], boxes[edge["to"]]
    # A face offset that keeps two departures apart top down can put them the wrong
    # way round left to right, because the face turns through 90 degrees. An edge
    # may therefore carry its own left-to-right hint, exactly as labels do.
    hint = edge["route"]
    if grid.o == "lr" and edge.get("route_lr"):
        hint = edge["route_lr"]
    parts = hint.split(":")
    kind = parts[0]
    arg = int(parts[1]) if len(parts) > 1 else 0
    # a second number slides the departure point along the source's face, so two
    # edges leaving the same box do not start on top of each other
    exit_off = int(parts[2]) if len(parts) > 2 else 0
    # a fourth number moves the ARRIVAL alone: two edges landing on one face cross
    # each other whenever they arrive in the opposite order to the one they left in
    land_off = int(parts[3]) if len(parts) > 3 else exit_off
    td = grid.o == "td"
    # A diamond touches the world at four vertices only, so an attachment on one
    # cannot be slid along the face the way a rectangle's can: sliding it leaves
    # the arrow starting in empty space beside the shape.
    kinds = kinds or {}
    off_from = 0 if kinds.get(edge["from"]) == "decision" else exit_off
    off_to = 0 if kinds.get(edge["to"]) == "decision" else land_off
    if kind == "flow":
        s, t = ("s", "n") if td else ("e", "w")
        p, q = side_point(a, s), side_point(b, t)
        if abs(p[0] - q[0]) < 1 or abs(p[1] - q[1]) < 1:
            return [p, q]
        mid = ((p[1] + q[1]) / 2) if td else ((p[0] + q[0]) / 2)
        return [p, (p[0], mid), (q[0], mid), q] if td else \
               [p, (mid, p[1]), (mid, q[1]), q]
    if kind == "over":
        n = arg
        if td:
            p, q = side_point(a, "n"), side_point(b, "n")
            lane = min(p[1], q[1]) - 26 - n * 20
            return [p, (p[0], lane), (q[0], lane), q]
        p, q = side_point(a, "w"), side_point(b, "w")
        lane = min(p[0], q[0]) - 26 - n * 20
        return [p, (lane, p[1]), (lane, q[1]), q]
    if kind in ("cross", "auto"):
        # Geometry decides the sides, not the orientation: two boxes whose bands
        # overlap horizontally are joined east to west, two that overlap
        # vertically north to south. Anything else gets one L. `arg` nudges the
        # turning line so a fan out of one agent does not collapse onto a trunk.
        # the ARRIVAL moves only when a fourth number is written, so every older
        # three-number hint lands exactly where it always did
        arrive = off_to if len(parts) > 3 else 0
        ax0, ay0, aw, ah = a
        bx0, by0, bw, bh = b
        ax1, ay1, bx1, by1 = ax0 + aw, ay0 + ah, bx0 + bw, by0 + bh
        y_overlap = min(ay1, by1) - max(ay0, by0)
        x_overlap = min(ax1, bx1) - max(ax0, bx0)
        if y_overlap > 8:                               # side by side
            s, t = ("e", "w") if ax0 <= bx0 else ("w", "e")
            p, q = side_point(a, s), side_point(b, t)
            p = (p[0], p[1] + off_from)
            q = (q[0], q[1] + arrive)
            if abs(p[1] - q[1]) < 1:
                return [p, q]
            mid = (p[0] + q[0]) / 2 + arg
            return [p, (mid, p[1]), (mid, q[1]), q]
        if x_overlap > 8:                               # stacked
            s, t = ("s", "n") if ay0 <= by0 else ("n", "s")
            p, q = side_point(a, s), side_point(b, t)
            p = (p[0] + off_from, p[1])
            q = (q[0] + arrive, q[1])
            if abs(p[0] - q[0]) < 1:
                return [p, q]
            mid = (p[1] + q[1]) / 2 + arg
            return [p, (p[0], mid), (q[0], mid), q]
        # diagonal: leave through the face that points at the target's band, run
        # along the empty channel between the two bands, then into the target's
        # near face. `arg` shifts the channel so two fans do not share a line.
        # Leave along the axis that SEPARATES THE TWO GRID COLUMNS (or rows, when
        # the columns match), because the strip between two bands is empty by
        # construction; guessing from raw pixel distance sends the line through
        # whatever box happens to sit between the two ends.
        cells = cells or {}
        ca = cells.get(edge["from"], (None, None))[0]
        cb = cells.get(edge["to"], (None, None))[0]
        cross_bands = ca != cb
        use_y = cross_bands if grid.o == "lr" else not cross_bands
        if use_y:
            s, t = ("s", "n") if ay0 <= by0 else ("n", "s")
            p, q = side_point(a, s), side_point(b, t)
            p = (p[0] + off_from, p[1])
            q = (q[0] + arrive, q[1])
            trunk = (p[1] + q[1]) / 2 + arg
            return [p, (p[0], trunk), (q[0], trunk), q]
        s, t = ("e", "w") if ax0 <= bx0 else ("w", "e")
        p, q = side_point(a, s), side_point(b, t)
        p = (p[0], p[1] + off_from)
        q = (q[0], q[1] + arrive)
        trunk = (p[0] + q[0]) / 2 + arg
        return [p, (trunk, p[1]), (trunk, q[1]), q]
    if kind == "skip":
        # `arg` gives this bypass its own lane, so two of them never share a line
        off = arg or lanes["skip"]
        s, t = ("e", "e") if td else ("s", "s")
        p, q = side_point(a, s), side_point(b, t)
        # exit_off slides BOTH ends along their face, clear of whatever else
        # attaches at the same point
        if td:
            p, q = (p[0], p[1] + off_from), (q[0], q[1] + off_to)
        else:
            p, q = (p[0] + off_from, p[1]), (q[0] + off_to, q[1])
        # The lane must clear every box the bypass passes, not only its own
        # two ends: a narrow diamond bypassing a wide pill would cut it.
        lo, hi = sorted([p[1], q[1]] if td else [p[0], q[0]])
        reach = max(p[0], q[0]) if td else max(p[1], q[1])
        own_col = (cells or {}).get(edge["from"], (None, None))[0]
        for nid, nb in boxes.items():
            if nid not in kinds:
                continue
            if (cells or {}).get(nid, (None, None))[0] != own_col:
                continue          # only the band the bypass runs along
            mid = nb[1] + nb[3] / 2 if td else nb[0] + nb[2] / 2
            if lo - 2 <= mid <= hi + 2:
                reach = max(reach, nb[0] + nb[2] if td else nb[1] + nb[3])
        lane = reach + off
        return [p, (lane, p[1]), (lane, q[1]), q] if td else \
               [p, (p[0], lane), (q[0], lane), q]
    if kind == "user":
        lane = lanes["user"] + arg * lanes["user_step"]
        s, t = ("w", "w") if td else ("n", "n")
        p, q = side_point(a, s), side_point(b, t)
        # Every return attaches to the SAME face, so they all leave one point and cross
        # each other on the way to their lanes. Attach in lane order instead: the edge
        # running furthest out attaches furthest along the face.
        # The return LEAVES heading back down the flow and ARRIVES from up the flow, so
        # the two ends move opposite ways along their faces: the departure steps back
        # towards where it is going, the arrival steps forward towards where it came
        # from, and the inbound verticals stop landing on the outbound run.
        step = 15 * arg
        # A diamond meets the world at its four VERTICES and nowhere else, so the
        # lane-ordering offset is suppressed at a decision end exactly as every other
        # face offset is. Sliding it leaves the arrow starting in mid air beside the
        # shape, which is what happened when this offset was first added.
        sp = 0 if kinds.get(edge["from"]) == "decision" else step
        sq = 0 if kinds.get(edge["to"]) == "decision" else step
        if td:
            p, q = (p[0], p[1] - sp), (q[0], q[1] + sq)
        else:
            p, q = (p[0] - sp, p[1]), (q[0] + sq, q[1])
        return [p, (lane, p[1]), (lane, q[1]), q] if td else                [p, (p[0], lane), (q[0], lane), q]
    lane = lanes["far"] + arg * lanes["far_step"]
    s, t = ("e", "e") if td else ("s", "s")
    p, q = side_point(a, s), side_point(b, t)
    return [p, (lane, p[1]), (lane, q[1]), q] if td else \
           [p, (p[0], lane), (q[0], lane), q]


HOP_R = 5.0             # radius of the little bridge drawn where two lines cross


def path_d(pts, verticals=(), own=-1, r=HOP_R):
    """The path for one connector, bridging every line it crosses.

    Only HORIZONTAL runs hop, over the vertical runs of other connectors, so a
    crossing is bridged once and the reader can tell which line is on top.
    """
    out = [f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if abs(y0 - y1) > 0.5 or abs(x0 - x1) <= 0.5:
            out.append(f"L{x1:.1f},{y1:.1f}")
            continue
        lo, hi = min(x0, x1), max(x0, x1)
        cuts = []
        for j, vx, vylo, vyhi in verticals:
            if j == own:
                continue
            if vylo + 0.5 < y0 < vyhi - 0.5 and lo + r + 3 < vx < hi - r - 3:
                cuts.append(vx)
        step = 1 if x1 > x0 else -1
        for cx in sorted(set(cuts), reverse=step < 0):
            # bulge towards smaller y whichever way the run travels
            sweep = 1 if step > 0 else 0
            out.append(f"L{cx - r * step:.1f},{y0:.1f}")
            out.append(f"A{r},{r} 0 0,{sweep} {cx + r * step:.1f},{y0:.1f}")
        out.append(f"L{x1:.1f},{y1:.1f}")
    return " ".join(out)


def _slide_offsets(room, step=13.0):
    """Offsets to try, nearest the midpoint first, alternating either way."""
    out = [0.0]
    d = step
    while d <= room:
        out += [d, -d]
        d += step
    if room > 0:                 # the far ends of the run count as candidates too
        out += [room, -room]
    return out


def _seg_hits_rect(seg, rect, pad=None):
    pad = CLEAR + HOP_R if pad is None else pad
    horizontal, fixed, lo, hi = seg
    x0, y0 = rect[0] - pad, rect[1] - pad
    x1, y1 = x0 + rect[2] + 2 * pad, y0 + rect[3] + 2 * pad
    if horizontal:
        return y0 <= fixed <= y1 and lo <= x1 and hi >= x0
    return x0 <= fixed <= x1 and lo <= y1 and hi >= y0


def _plate_clear(rect, other_segs, obstacles):
    if any(_seg_hits_rect(sg, rect) for sg in other_segs):
        return False
    gx, gy = rect[0] - CLEAR, rect[1] - CLEAR
    gw, gh = rect[2] + 2 * CLEAR, rect[3] + 2 * CLEAR
    for ob in obstacles:
        if (min(gx + gw, ob[0] + ob[2]) - max(gx, ob[0]) > 0
                and min(gy + gh, ob[1] + ob[3]) - max(gy, ob[1]) > 0):
            return False
    return True


def edge_svg(edge, pts, spec, orient="td", verticals=(), own=-1,
             other_segs=(), obstacles=()):
    lbox = None
    span = None
    colour = spec["palette"]["edge"][edge["type"]]
    style = {"control": "", "data": ' stroke-dasharray="2 4"',
             "design": ' stroke-dasharray="9 5"',
             "future": ' stroke-dasharray="9 5"'}[edge["type"]]
    width = 2.6 if edge["type"] in ("design", "future") else 2.0
    d = path_d(pts, verticals, own)
    head = f'marker-end="url(#arrow-{edge["type"]})"'
    if edge.get("dir") == "both":
        head += f' marker-start="url(#arrow-{edge["type"]})"'
    out = [f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{width}"'
           f'{style} {head}/>']
    if edge["label"]:
        # The label sits on the MIDDLE of the longest segment, on an opaque plate
        # that masks the line, so it lands in the gap between boxes instead of on
        # top of the target's caption.
        runs = sorted(zip(pts, pts[1:]),
                      key=lambda pr: -(abs(pr[0][0] - pr[1][0])
                                       + abs(pr[0][1] - pr[1][1])))
        best = runs[0] if runs else (pts[0], pts[-1])
        mx = (best[0][0] + best[1][0]) / 2
        my = (best[0][1] + best[1][1]) / 2
        rows = edge["label"].split("\n")
        w = 6.4 * max(len(r) for r in rows) + 10
        h = 17 * len(rows)
        # A plate wider than the segment it sits on would spill onto the boxes at
        # either end, so step it off the line instead of centring on it.
        dx = abs(best[1][0] - best[0][0])
        dy = abs(best[1][1] - best[0][1])
        if dx >= dy:
            if w > dx - 12:
                my -= h / 2 + 9
        elif h > dy - 12:
            mx += w / 2 + 9
        key = "lnudge_lr" if orient == "lr" else "lnudge"
        nx, ny = edge.get(key) or edge.get("lnudge") or [0, 0]
        mx += nx
        my += ny
        # A plate the midpoint happens to put under ANOTHER connector reads as
        # struck through, so slide it along its own segment to the nearest clear
        # spot before settling. Sliding, not nudging: the label stays on its arrow.
        # A hand nudge is honoured first and then CHECKED: a nudge written when the
        # lanes were tighter must not silently outrank the geometry it no longer
        # matches.
        if not _plate_clear((mx - w / 2, my - h / 2 - 3, w, h),
                            other_segs, obstacles):
            along = dx >= dy
            room = (max(dx, dy) - (w if along else h)) / 2 - CLEAR
            placed = False
            # The longest run is the first choice, but a crowded run is no place
            # for a plate: fall back through the shorter runs, longest first, and
            # take the first that can hold the label clear of everything.
            for cand in runs:
                cdx = abs(cand[1][0] - cand[0][0])
                cdy = abs(cand[1][1] - cand[0][1])
                calong = cdx >= cdy
                croom = (max(cdx, cdy) - (w if calong else h)) / 2 - CLEAR
                if croom < 6:
                    continue
                bx = (cand[0][0] + cand[1][0]) / 2
                by = (cand[0][1] + cand[1][1]) / 2
                for off in _slide_offsets(croom):
                    cx = bx + off if calong else bx
                    cy = by if calong else by + off
                    if _plate_clear((cx - w / 2, cy - h / 2 - 3, w, h),
                                    other_segs, obstacles):
                        mx, my, placed = cx, cy, True
                        dx, dy, along = cdx, cdy, calong
                        break
                if placed:
                    break
            if not placed and room > 6:
                for off in _slide_offsets(room):
                    cx = mx + off if along else mx
                    cy = my if along else my + off
                    if _plate_clear((cx - w / 2, cy - h / 2 - 3, w, h),
                                    other_segs, obstacles):
                        mx, my, placed = cx, cy, True
                        break
            if not placed:
                # too short to slide: step the plate off its own line instead and
                # let the leader gap speak, rather than let another arrow cross it
                for off in _slide_offsets(3 * (h if along else w), step=11.0)[1:]:
                    cx = mx if along else mx + off
                    cy = my + off if along else my
                    if _plate_clear((cx - w / 2, cy - h / 2 - 3, w, h),
                                    other_segs, obstacles):
                        mx, my = cx, cy
                        break
        lbox = (mx - w / 2, my - h / 2 - 3, w, h)
        span = (dx >= dy, max(dx, dy))
        out.append(f'<rect x="{mx - w/2:.1f}" y="{my - h/2 - 3:.1f}" width="{w:.0f}" '
                   f'height="{h}" rx="3" fill="#FFFFFF"/>')
        ty = my - h / 2 + 9
        for r in rows:
            out.append(f'<text x="{mx:.1f}" y="{ty:.1f}" font-family="{FONT}" '
                       f'font-size="11" fill="{colour}" text-anchor="middle">'
                       f'{esc(r)}</text>')
            ty += 15
    return "".join(out), lbox, span


# --------------------------------------------------------------- legend
def legend_svg(spec, x, y):
    """One compact flat strip of six samples. Never a column, never a grid, and
    never stretched to the canvas width."""
    items = spec["legend"]
    # the requirement sample shows a chip as this canvas writes it, not a fixed FR1
    sample_fr = next((n["fr"] for n in spec["nodes"] if n.get("fr")), "FR1")
    sample_w = 46
    pitch = []
    for it in items:
        pitch.append(sample_w + 14 + len(it["text"]) * 6.1 + 30)
    total = sum(pitch)
    out = [f'<rect x="{x:.0f}" y="{y:.0f}" width="{total:.0f}" height="56" rx="4" '
           f'fill="#FFFFFF" stroke="#B0BEC5" stroke-width="1"/>']
    cur = x
    for it, pw in zip(items, pitch):
        sx, sy = cur + 12, y + 15
        k = it["kind"]
        if k == "action":
            out.append(f'<rect x="{sx}" y="{sy}" width="{sample_w}" height="26" rx="13" '
                       f'fill="#BBDEFB" stroke="#2E7D32" stroke-width="2"/>')
            out.append(f'<rect x="{sx+4}" y="{sy+5}" width="15" height="16" rx="3" '
                       f'fill="#1A2327"/>')
            out.append(f'<circle cx="{sx+29}" cy="{sy+9}" r="4" fill="#E65100"/>')
            out.append(f'<path d="M{sx+23},{sy+23} a6,8 0 0,1 12,0 z" fill="#E65100"/>')
        elif k == "component":
            out.append(f'<rect x="{sx}" y="{sy}" width="{sample_w}" height="26" rx="3" '
                       f'fill="#CFD8DC" stroke="#2E7D32" stroke-width="2"/>')
        elif k == "decision":
            out.append(f'<polygon points="{sx+23},{sy} {sx+46},{sy+13} '
                       f'{sx+23},{sy+26} {sx},{sy+13}" fill="#FFF9C4" '
                       f'stroke="#2E7D32" stroke-width="2"/>')
        elif k == "requirement":
            out.append(f'<rect x="{sx + 6}" y="{sy + 2}" width="34" height="22" rx="11" '
                       f'fill="{FR_FILL}"/>')
            out.append(f'<text x="{sx + 23}" y="{sy + 17}" font-family="{FONT}" '
                       f'font-size="11" font-weight="bold" fill="#FFFFFF" '
                       f'text-anchor="middle">{esc(sample_fr)}</text>')
        elif k == "status2":
            for j, (col, dash) in enumerate(((("#2E7D32"), ""),
                                             ("#9E9E9E", ' stroke-dasharray="5 4"'))):
                out.append(f'<rect x="{sx + j*20}" y="{sy+4}" width="16" height="18" '
                           f'fill="#FFFFFF" stroke="{col}" stroke-width="2"{dash}/>')
        elif k.startswith("kind:"):
            # one sample per component kind drawn, in that kind's own fill
            fill = spec["palette"]["fill"][k.split(":", 1)[1]]
            out.append(f'<rect x="{sx}" y="{sy}" width="{sample_w}" height="26" rx="3" '
                       f'fill="{fill}" stroke="#78909C" stroke-width="1.5"/>')
        elif k == "status_bd":
            for j, (col, dash) in enumerate((("#2E7D32", ""),
                                             ("#F9A825", ' stroke-dasharray="5 4"'))):
                out.append(f'<rect x="{sx + j*20}" y="{sy+4}" width="16" height="18" '
                           f'fill="#FFFFFF" stroke="{col}" stroke-width="2"{dash}/>')
        elif k == "status":
            for j, col in enumerate(("#2E7D32", "#F9A825", "#9E9E9E")):
                dash = "" if j == 0 else ' stroke-dasharray="5 4"'
                out.append(f'<rect x="{sx + j*16}" y="{sy+4}" width="13" height="18" '
                           f'fill="#FFFFFF" stroke="{col}" stroke-width="2"{dash}/>')
        else:
            style = {"control": "", "data": ' stroke-dasharray="2 4"',
                     "design": ' stroke-dasharray="9 5"',
                     "future": ' stroke-dasharray="9 5"'}[k]
            col = spec["palette"]["edge"][k]
            out.append(f'<path d="M{sx},{sy+13} L{sx+sample_w-8},{sy+13}" stroke="{col}" '
                       f'stroke-width="{2.6 if k in ("design", "future") else 2}"{style} '
                       f'marker-end="url(#arrow-{k})"/>')
        tx = sx + sample_w + 12
        out.append(f'<text x="{tx:.0f}" y="{sy + 17}" font-family="{FONT}" '
                   f'font-size="11" fill="#37474F">{esc(it["text"])}</text>')
        cur += pw
    return "".join(out), (total, 56)


# --------------------------------------------------------------- edge geometry
def segments(pts):
    """The axis-aligned pieces of one polyline, as (horizontal, fixed, lo, hi)."""
    out = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if abs(y0 - y1) <= 0.5 and abs(x0 - x1) > 0.5:
            out.append((True, (y0 + y1) / 2, min(x0, x1), max(x0, x1)))
        elif abs(x0 - x1) <= 0.5 and abs(y0 - y1) > 0.5:
            out.append((False, (x0 + x1) / 2, min(y0, y1), max(y0, y1)))
    return out


def path_length(segs):
    return sum(hi - lo for _, _, lo, hi in segs) or 1.0


def shared_run(a_segs, b_segs, tol=3.0):
    """How far two polylines run along the same line."""
    total = 0.0
    for ah, af, alo, ahi in a_segs:
        for bh, bf, blo, bhi in b_segs:
            if ah != bh or abs(af - bf) > tol:
                continue
            total += max(0.0, min(ahi, bhi) - max(alo, blo))
    return total


def hugs_border(seg, box, tol=22.0, min_run=40.0):
    """True when a segment runs ALONG one of a box's four edges, close enough to
    read as sitting on it. Crossing a border at right angles is fine; running
    beside it is not."""
    horizontal, fixed, lo, hi = seg
    bx, by, bw, bh = box
    if horizontal:
        edges, span = (by, by + bh), (bx, bx + bw)
    else:
        edges, span = (bx, bx + bw), (by, by + bh)
    run = min(hi, span[1]) - max(lo, span[0])
    if run < min_run:
        return False
    return any(abs(fixed - e) <= tol for e in edges)


def crosses_box(seg, box, inset=3.0):
    """True when an axis-aligned segment passes through a box's interior."""
    horizontal, fixed, lo, hi = seg
    bx, by, bw, bh = box
    x0, y0, x1, y1 = bx + inset, by + inset, bx + bw - inset, by + bh - inset
    if x1 <= x0 or y1 <= y0:
        return False
    if horizontal:
        return y0 < fixed < y1 and max(lo, x0) < min(hi, x1)
    return x0 < fixed < x1 and max(lo, y0) < min(hi, y1)


# --------------------------------------------------------------- checks
def overlaps(a, b, tol=0.5):
    return (min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]) > tol and
            min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]) > tol)


def _crossings(a_segs, b_segs):
    """Points where a horizontal run of one path meets a vertical run of the other."""
    out = []
    for ah, af, alo, ahi in a_segs:
        for bh, bf, blo, bhi in b_segs:
            if ah == bh:
                continue
            h, v = ((ah, af, alo, ahi), (bh, bf, blo, bhi)) if ah else                    ((bh, bf, blo, bhi), (ah, af, alo, ahi))
            if h[2] <= v[1] <= h[3] and v[2] <= h[1] <= v[3]:
                out.append((v[1], h[1]))
    return out


def title_ink(spec, pid, pb):
    """The ink box of a panel's title: text starts 12px in, baseline 16px down,
    13px bold. Only the letters count, never the whole width of the panel."""
    title = next((q["title"] for q in spec["panels"] if q["id"] == pid), "")
    return (pb[0] + 12, pb[1] + 16 - ASCENT * 13,
            CW_BOLD13 * len(title), (ASCENT + DESCENT) * 13)


def check(spec, boxes, panels, edge_labels, node_labels, chips,
          edge_spans=(), edge_paths=(), kinds_of=None):
    kinds_of = kinds_of or {}
    """Returns (overlap problems, label problems, isolated node ids)."""
    over, lab = [], []

    # ---- boxes, panels, containment
    ids = list(boxes)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if overlaps(boxes[a], boxes[b]):
                over.append(f"node {a} overlaps node {b}")
    parent = {p["id"]: p.get("parent") for p in spec["panels"]}
    pids = list(panels)
    for i, a in enumerate(pids):
        for b in pids[i + 1:]:
            if parent.get(a) == b or parent.get(b) == a:
                continue
            if overlaps(panels[a], panels[b]):
                over.append(f"panel {a} overlaps panel {b}")
    by_panel = {n["id"]: n.get("panel") for n in spec["nodes"]}
    for nid, nb in boxes.items():
        for pid, pb in panels.items():
            if by_panel.get(nid) == pid:
                if not (nb[0] >= pb[0] and nb[1] >= pb[1]
                        and nb[0] + nb[2] <= pb[0] + pb[2]
                        and nb[1] + nb[3] <= pb[1] + pb[3]):
                    over.append(f"node {nid} escapes its panel {pid}")
            elif parent.get(by_panel.get(nid)) == pid:
                continue
            elif overlaps(nb, pb):
                over.append(f"node {nid} sits inside foreign panel {pid}")

    # ---- text: every caption and every edge label against every obstacle
    def grown(b, pad=CLEAR):
        return (b[0] - pad, b[1] - pad, b[2] + 2 * pad, b[3] + 2 * pad)

    obstacles = [(k, v) for k, v in boxes.items()]
    obstacles += [(f"title {k}", (v[0], v[1], v[2], 22)) for k, v in panels.items()]
    obstacles += chips
    # Every text run is grown by CLEAR px before the test, so "touching" fails and
    # so does "close enough to read as one block".
    for i, (an, ab, own) in enumerate(edge_labels):
        for bn, bb, _ in edge_labels[i + 1:]:
            if overlaps(grown(ab), bb):
                lab.append(f"edge label {an} too close to edge label {bn}")
        for on, ob in obstacles:
            if overlaps(grown(ab), ob):
                lab.append(f"edge label {an} too close to {on}")
    for nid, nb in node_labels:
        # a caption must sit CLEAR pixels inside its own shape; a stadium's rounded
        # end eats h/2 of the width, so the ends are charged for that too
        own = boxes.get(nid)
        if own:
            cls = next((n["cls"] for n in spec["nodes"] if n["id"] == nid), "")
            # a stadium's rounded end costs about 12px of usable width beside the
            # text band, not the full h/2 of the corner radius
            end = CLEAR + 12 if cls == "action" else CLEAR
            if nb[0] < own[0] + CLEAR or nb[0] + nb[2] > own[0] + own[2] - end:
                lab.append(f"caption {nid} runs to the edge of its own box")
            if nb[1] < own[1] + CLEAR or nb[1] + nb[3] > own[1] + own[3] - CLEAR:
                lab.append(f"caption {nid} runs past the top or bottom of its box")
        for on, ob in obstacles:
            if on == nid:                       # a caption sits inside its own shape
                continue
            if overlaps(grown(nb), ob):
                lab.append(f"caption {nid} too close to {on}")
        for en, eb, _ in edge_labels:
            if overlaps(grown(nb), eb):
                lab.append(f"caption {nid} too close to edge label {en}")

    # ---- floating boxes
    deg = {n["id"]: 0 for n in spec["nodes"]}
    for e in spec["edges"]:
        for end in (e["from"], e["to"]):
            if end in deg:
                deg[end] += 1
    isolated = sorted(k for k, v in deg.items() if v == 0)

    # ---- arrows that run along each other, and arrows that cut through a box
    prepared = [(n, segments(pts), ends) for n, pts, ends in edge_paths]
    for i, (an, asegs, _) in enumerate(prepared):
        alen = path_length(asegs)
        for bn, bsegs, _ in prepared[i + 1:]:
            run = shared_run(asegs, bsegs)
            shortest = min(alen, path_length(bsegs))
            if run > 0.35 * shortest:
                over.append(f"arrow {an} runs along arrow {bn} for "
                            f"{100 * run / shortest:.0f} per cent of the shorter one")
    for an, asegs, ends in prepared:
        for seg in asegs:
            for nid, nb in boxes.items():
                if crosses_box(seg, nb):
                    over.append(f"arrow {an} cuts through box {nid}")
                # a run parallel to a box's own edge reads as sitting on it,
                # exactly as it does against a panel's edge
                if nid not in ends and hugs_border(seg, nb, tol=16, min_run=30):
                    over.append(f"arrow {an} runs along the edge of box {nid}")
            for pid, pb in panels.items():
                if hugs_border(seg, pb):
                    over.append(f"arrow {an} runs along the border of panel {pid}")


    # ---- a label plate that another connector runs through
    # The plate masks its OWN line, but any other edge drawn later paints straight
    # over the text and the label reads as struck through.
    for an, ab, _own in edge_labels:
        for bn, bsegs, _ends in prepared:
            if bn == an:
                continue
            if any(_seg_hits_rect(seg, ab) for seg in bsegs):
                lab.append(f"edge label {an} is crossed or crowded by arrow {bn}")
                break

    # ---- attachments on a decision
    # Every offset in the router is suppressed at a decision end, but each one has to
    # remember to do it. Check the RESULT instead: an endpoint on a diamond must sit on
    # one of its four vertices, or the arrow starts beside the shape rather than on it.
    for e, (an, pts, _ends) in zip(spec["edges"], edge_paths):
        for nid, pt in ((e["from"], pts[0]), (e["to"], pts[-1])):
            if kinds_of.get(nid) != "decision" or nid not in boxes:
                continue
            bx, by, bw, bh = boxes[nid]
            verts = ((bx + bw / 2, by), (bx + bw / 2, by + bh),
                     (bx, by + bh / 2), (bx + bw, by + bh / 2))
            if min(abs(pt[0] - vx) + abs(pt[1] - vy) for vx, vy in verts) > 2.0:
                over.append(f"arrow {an} attaches to decision {nid} away from a vertex")

    # ---- crossings
    # Every crossing is counted so the total can be reported and driven down. A crossing
    # between two edges that SHARE an endpoint is a fault, not a trade-off: they meet at
    # the same box, so swapping where they attach always removes it.
    crossings = 0
    for i, (an, asegs, aends) in enumerate(prepared):
        for bn, bsegs, bends in prepared[i + 1:]:
            hits = _crossings(asegs, bsegs)
            crossings += len(hits)
            if hits and (aends & bends):
                shared = ", ".join(sorted(aends & bends))
                over.append(f"arrow {an} crosses arrow {bn}, and they meet at {shared}: "
                            f"land them the other way round")

    # A panel's name is painted on an opaque plate, so a shaft may run behind it,
    # but an arrowHEAD hidden under the name leaves an edge that looks headless.
    for an, pts, _ends in edge_paths:
        head = pts[-1]
        for pid, pb in panels.items():
            ink = title_ink(spec, pid, pb)
            if (ink[0] - 8 <= head[0] <= ink[0] + ink[2] + 8
                    and ink[1] - 6 <= head[1] <= ink[1] + ink[3] + 6):
                over.append(f"arrow {an} lands under the title of panel {pid}")

    # A label that is as long as its own arrow reads as a caption floating in
    # space, so measure the plate along the arrow and refuse it.
    for an, ab, _, seg in edge_spans:
        if seg is None:
            continue
        along = ab[2] if seg[0] else ab[3]
        if along > seg[1] - 2 * CLEAR:
            lab.append(f"edge label {an} is as long as its arrow "
                       f"({along:.0f}px of a {seg[1]:.0f}px segment)")
    return over, lab, isolated, crossings


def headless_edges(svg):
    """Drawn connector paths with no arrow marker. Must be zero."""
    bad = 0
    for m in re.finditer(r'<path [^>]*fill="none"[^>]*>', svg):
        if "marker-end" not in m.group(0):
            bad += 1
    return bad


# --------------------------------------------------------------- assembly
def render(spec, orientation, caps=None):
    fit = fit_classes(spec, caps or spec["classes"])
    grid = Grid(spec, orientation)
    boxes = place(spec, grid)
    panels = panel_boxes(spec, boxes)

    w, h = grid.extent()
    top = 0
    total_h = h + 20

    lanes = {
        "user": boxes["USER"][0] + boxes["USER"][2] / 2 if orientation == "lr"
                else spec["grid"]["margin"] + 26,
        "user_step": -26,          # replaced below in td: see the pitch note
        "skip": 30,
        "far": max(b[0] + b[2] for b in boxes.values()) + 26 if orientation == "td"
               else max(b[1] + b[3] for b in boxes.values()) + 26,
        "far_step": 26,
    }
    # The two bounded returns run in a clear lane just outside the panels, never
    # across a box or a panel title band.
    if panels:
        if orientation == "lr":
            lanes["user"] = min(pb[1] for pb in panels.values()) - 24
        else:
            lanes["user"] = min(pb[0] for pb in panels.values()) - 24
    if orientation == "lr":
        lanes["far"] = max(b[1] + b[3] for b in boxes.values()) + 26
    else:
        # Top down the loop lanes run vertically and their labels lie ACROSS them,
        # so a 26 px pitch would put every plate over its neighbours. Give each
        # lane a corridor as wide as the widest label it has to carry.
        widest = 0.0
        for e in spec["edges"]:
            if not str(e.get("route", "")).startswith("user") or not e["label"]:
                continue
            rows = e["label"].split("\n")
            widest = max(widest, 6.4 * max(len(r) for r in rows) + 10)
        lanes["user_step"] = -max(26.0, widest + 2 * CLEAR + 4)
        # and stand the whole group off the panels by half a plate, so the first
        # lane's label clears the boxes it runs beside instead of touching them
        lanes["user"] -= widest / 2 + CLEAR
    total_w = max(w, lanes["far"] + 9 * lanes["far_step"] + spec["grid"]["margin"])

    body = []
    parent_of = {q["id"]: q.get("parent") for q in spec["panels"]}
    titles = []
    draw_order = sorted(panels.items(), key=lambda kv: bool(parent_of.get(kv[0])))
    for pid, pb in draw_order:
        fill, stroke = spec["palette"]["panel"][pid]
        title = next(p["title"] for p in spec["panels"] if p["id"] == pid)
        dash = ' stroke-dasharray="8 5"' if pid in spec.get("dashed_panels", []) else ""
        body.append(f'<rect x="{pb[0]:.1f}" y="{pb[1] + top:.1f}" width="{pb[2]:.1f}" '
                    f'height="{pb[3]:.1f}" rx="6" fill="{fill}" stroke="{stroke}" '
                    f'stroke-width="2"{dash}/>')
        # The name is chrome, like a tab on the panel: it is painted LAST on an
        # opaque plate, so a connector entering the panel near its corner runs
        # behind the name instead of striking it out.
        ink = title_ink(spec, pid, (pb[0], pb[1] + top, pb[2], pb[3]))
        titles.append(
            f'<rect x="{ink[0] - 5:.1f}" y="{ink[1] - 3:.1f}" '
            f'width="{ink[2] + 10:.1f}" height="{ink[3] + 6:.1f}" rx="3" '
            f'fill="{fill}"/>'
            f'<text x="{pb[0] + 12:.1f}" y="{pb[1] + top + 16:.1f}" '
            f'font-family="{FONT}" font-size="13" font-weight="bold" '
            f'fill="{stroke}">{esc(title)}</text>')

    shifted = {k: (v[0], v[1] + top, v[2], v[3]) for k, v in boxes.items()}
    endpoints = dict(shifted)
    for pid, pb in panels.items():
        endpoints[pid] = (pb[0], pb[1] + top, pb[2], pb[3])
    cells = {n["id"]: (n["col"], n["row"]) for n in spec["nodes"]}
    kinds = {n["id"]: n["cls"] for n in spec["nodes"]}
    edge_labels = []
    edge_spans = []
    edge_paths = []
    routed = [(e, route(e, endpoints, grid, lanes, cells, kinds))
              for e in spec["edges"]]
    # every vertical run in the drawing, so a horizontal run can bridge them
    verticals = []
    for i, (_e, pts) in enumerate(routed):
        for horizontal, fixed, lo, hi in segments(pts):
            if not horizontal:
                verticals.append((i, fixed, lo, hi))
    # every routed segment, indexed by edge, so a label can be slid off a
    # connector that is not its own before it is ever drawn
    all_segs = [(i, sg) for i, (_e, pts) in enumerate(routed)
                for sg in segments(pts)]
    plate_obstacles = ([(b[0], b[1] + top, b[2], b[3]) for b in boxes.values()]
                       + [(pb[0], pb[1] + top, pb[2], 22)
                          for pb in panels.values()])
    for i, (e, pts) in enumerate(routed):
        others = [sg for j, sg in all_segs if j != i]
        svg_e, lbox, span = edge_svg(e, pts, spec, orientation, verticals, i,
                                     others, plate_obstacles)
        body.append(svg_e)
        edge_paths.append((f'{e["from"]}->{e["to"]}', pts, {e['from'], e['to']}))
        if lbox:
            name = f'{e["from"]}->{e["to"]}'
            edge_labels.append((name, lbox, {e['from'], e['to']}))
            edge_spans.append((name, lbox, {e['from'], e['to']}, span))
    node_labels, chips = [], []
    for n in spec["nodes"]:
        b = shifted[n["id"]]
        body.append(shape_svg(n, b, spec))
        lsvg, lbox = label_svg(n, b)
        body.append(lsvg)
        node_labels.append((n["id"], lbox))
        bsvg, obs = badge_svg(n, b)
        body.append(bsvg)
        chips += obs

    body += titles
    over, lab, isolated, crossings = check(spec, boxes, panels, edge_labels,
                                [(i, (x, y - top, w2, h2))
                                 for i, (x, y, w2, h2) in node_labels],
                                [(k, (x, y - top, w2, h2)) for k, (x, y, w2, h2) in chips],
                                edge_spans, edge_paths, kinds_of=kinds)

    xs0 = [b[0] for b in list(panels.values()) + list(shifted.values())]
    ys0 = [b[1] for b in list(panels.values()) + list(shifted.values())]
    xs1 = [b[0] + b[2] for b in list(panels.values()) + list(shifted.values())]
    ys1 = [b[1] + b[3] for b in list(panels.values()) + list(shifted.values())]
    for _, lb, _ in edge_labels:
        xs0.append(lb[0]); ys0.append(lb[1])
        xs1.append(lb[0] + lb[2]); ys1.append(lb[1] + lb[3])
    cx0, cy0, cx1, cy1 = min(xs0), min(ys0), max(xs1), max(ys1)
    ly = cy1 + 20
    leg, legend_size = legend_svg(spec, cx0, ly)
    body.append(leg)
    lh = legend_size[1]
    # the frame must hold the legend too, or a strip wider than the content is clipped
    cx1 = max(cx1, cx0 + legend_size[0])
    if spec.get("footnote"):
        # wrapped to the content width, and the canvas grows to hold it, so a long
        # footnote can never run off the right edge or below the frame
        per = max(40, int((max(cx1 - cx0, legend_size[0]) - 8) / 5.6))
        foot = []
        for para in spec["footnote"].split("\n"):
            foot += wrap(para, per) or [""]
        spans = "".join(f'<tspan x="{cx0 + 4:.0f}" dy="{0 if i == 0 else 15}">'
                        f'{esc(t)}</tspan>' for i, t in enumerate(foot))
        body.append(f'<text x="{cx0 + 4:.0f}" y="{ly + lh + 18:.0f}" '
                    f'font-family="{FONT}" font-size="11" fill="#607D8B">'
                    f'{spans}</text>')
        lh += 15 * len(foot) + 6

    defs = "".join(
        f'<marker id="arrow-{k}" viewBox="0 0 10 10" refX="9" refY="5" '
        f'markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>'
        for k, c in spec["palette"]["edge"].items())

    # how much of the frame carries content
    filled = [(b[0], b[1], b[2], b[3]) for b in panels.values()]
    filled += [shifted[n["id"]] for n in spec["nodes"] if not n.get("panel")]
    filled.append((cx0, ly, legend_size[0], lh))
    step = 20
    cells = empty = 0
    for gy in range(0, int(total_h), step):
        for gx in range(0, int(total_w), step):
            cells += 1
            cx, cy = gx + step / 2, gy + step / 2
            if not any(f[0] <= cx <= f[0] + f[2] and f[1] <= cy <= f[1] + f[3]
                       for f in filled):
                empty += 1
    metrics = {"empty_pct": 100.0 * empty / max(cells, 1)}

    m = 40
    vx = cx0 - m
    vy = min(cy0, 20) - m
    vw = (cx1 - cx0) + 2 * m
    vh = (ly + lh + 26) - vy + m
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw:.0f}" '
           f'height="{vh:.0f}" viewBox="{vx:.0f} {vy:.0f} {vw:.0f} {vh:.0f}">'
           f'<defs>{defs}</defs>'
           f'<rect x="{vx:.0f}" y="{vy:.0f}" width="{vw:.0f}" height="{vh:.0f}" '
           f'fill="#FFFFFF"/>'
           f'{"".join(body)}</svg>')
    audit = {"overlap": over, "label": lab, "isolated": isolated,
             "headless": headless_edges(svg), "crossings": crossings}
    metrics["fit"] = fit
    return svg, (vw, vh), audit, legend_size, metrics


def rasterise(svg_path, png_path, w, h, scale=2):
    chrome = None
    for c in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              shutil.which("chrome"), shutil.which("google-chrome")):
        if c and pathlib.Path(c).exists():
            chrome = c
            break
    if not chrome:
        print("chrome not found, SVG only")
        return False
    cmd = [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
           f"--force-device-scale-factor={scale}",
           f"--screenshot={pathlib.Path(png_path).resolve()}",
           f"--window-size={int(w)},{int(h)}",
           svg_path.resolve().as_uri()]
    subprocess.run(cmd, capture_output=True, timeout=180)
    return pathlib.Path(png_path).exists()


KIND_TAGS = ("agent", "tool", "code", "endpoint", "store", "ui")


def grammar_check(spec):
    """Rules read from the spec, not the geometry, so run once per render.

    7b  every [code] box has a LABELLED inbound edge naming who runs it
    16  every component box's name begins with its kind tag
    17  the legend's kind samples are exactly the kinds drawn
    18  every [endpoint] sits in the panel of the host that serves it
    """
    out = []
    comps = [n for n in spec["nodes"] if n["cls"] == "component"]
    for n in comps:
        k = n.get("kind")
        if k not in KIND_TAGS:
            out.append(f"component {n['id']} has no valid kind (got {k!r})")
        elif not n["name"].startswith(f"[{k}] "):
            out.append(f"component {n['id']} name does not begin with [{k}]")
    for n in comps:
        if n.get("kind") != "code":
            continue
        if not any(e["to"] == n["id"] and e.get("label", "").strip()
                   for e in spec["edges"]):
            out.append(f"code box {n['id']} has no labelled inbound edge")
    drawn = {n.get("kind") for n in comps}
    keyed = {it["kind"].split(":", 1)[1] for it in spec["legend"]
             if it["kind"].startswith("kind:")}
    for k in sorted(drawn - keyed):
        out.append(f"kind {k} is drawn but has no legend sample")
    for k in sorted(keyed - drawn):
        out.append(f"legend promises kind {k}, which nothing on the canvas uses")
    host_of = {p["id"]: p.get("host") for p in spec["panels"]}
    for n in comps:
        if n.get("kind") != "endpoint":
            continue
        ph = host_of.get(n.get("panel"))
        if not n.get("host") or ph != n["host"]:
            out.append(f"endpoint {n['id']} is served by {n.get('host')!r} but sits in "
                       f"panel {n.get('panel')} of host {ph!r}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--scale", type=int, default=2)
    a = ap.parse_args()
    spec = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    caps = {k: dict(v) for k, v in spec["classes"].items()}
    out = pathlib.Path(a.out_dir)
    stem = spec.get("output", {}).get("stem", "diagram")
    primary = spec.get("output", {}).get("primary", "lr")
    rc = 0
    grammar = grammar_check(spec)
    print(f"GRAMMAR {len(grammar)}")
    for p in grammar:
        print(f"    grammar: {p}")
    if grammar:
        rc = 1
    for orientation in ("td", "lr"):
        svg, (w, h), audit, legend, metrics = render(spec, orientation, caps)
        sp = out / f"{stem}-{orientation}.svg"
        sp.write_text(svg, encoding="utf-8")
        ok = rasterise(sp, out / f"{stem}-{orientation}.png", w, h, a.scale)
        ratio = (h / w) if orientation == "td" else (w / h)
        counts = (len(audit["overlap"]), len(audit["label"]),
                  len(audit["isolated"]), audit["headless"])
        print(f"{orientation}: svg {w:.0f} x {h:.0f}, png {2*w:.0f} x {2*h:.0f}, "
              f"aspect {ratio:.2f}, edges {len(spec['edges'])}, "
              f"legend {legend[0]:.0f} x {legend[1]:.0f}, "
              f"empty {metrics['empty_pct']:.1f}%, png {'yes' if ok else 'NO'}")
        for cname, (fw, bw, fh, bh) in sorted(metrics.get("fit", {}).items()):
            print(f"  class {cname}: {fw} x {fh}  (width set by {bw}, height by {bh})")
        print(f"  AUDIT overlap {counts[0]}  label {counts[1]}  "
              f"isolated {counts[2]}  headless {counts[3]}  "
              f"crossings {audit.get('crossings', 0)}")
        for kind in ("overlap", "label"):
            for p in audit[kind][:14]:
                print(f"    {kind}: {p}")
        for p in audit["isolated"]:
            print(f"    isolated: {p}")
        if any(counts):
            rc = 1
        if orientation == primary:
            (out / f"{stem}.svg").write_text(svg, encoding="utf-8")
            src = out / f"{stem}-{orientation}.png"
            if src.exists():
                shutil.copyfile(src, out / f"{stem}.png")
    return rc


if __name__ == "__main__":
    sys.exit(main())
