"""v1 blueprint of Midway, from docs/ARCHITECTURE.md, ROADMAP.md and ETHICS.md.

    python build_spec.py midway-architecture-layout.json
    python ../../render_layout.py midway-architecture-layout.json --out-dir .

The builder is the source; the JSON is a build artifact.
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from grammar import (EDGE, FILL, GOAL_PANEL, HOST_PANEL, STATUS,  # noqa: E402
                     legend)

OUT = pathlib.Path(sys.argv[1])


def N(i, cls, status, col, row, name, qual="", badge="", panel=None,
      asks=False, fr="", kind=None, host=None):
    """A node. For a component, `kind` writes the tag into the name and picks
    the fill, so a box cannot carry one kind's tag and another's colour."""
    if cls == "component":
        name = f"[{kind}] {name}"
        fill = kind
    else:
        fill = cls
    return {"id": i, "cls": cls, "kind": kind, "fill": fill, "status": status,
            "col": col, "row": row, "badge": badge, "icon": "", "name": name,
            "qualifier": qual, "panel": panel, "asks": asks, "fr": fr,
            "host": host}


def C(i, kind, status, col, row, name, qual, panel, host=None):
    return N(i, "component", status, col, row, name, qual, panel=panel,
             kind=kind, host=host)


NODES = [
    N("USER", "user", "built", 1, 0, "Group member",
      "enters details, then picks a place"),

    # ---- 1. Multi-person input
    N("A1", "action", "built", 1, 1, "Enter each member's details",
      "name, location, availability, budget", badge="[1]", panel="P1",
      asks=True, fr="F1"),
    C("FORM", "ui", "built", 2, 1, "/ member form",
      "MemberForm: add or remove members", "B1"),
    C("SS1", "store", "built", 3, 1, "sessionStorage",
      "key midway.members, written on submit, tab memory", "B1"),

    # ---- 2. Parse and geocode
    N("A2", "action", "design", 1, 2, "Parse free text into fields",
      "coordinates, time ranges, price limits", badge="[2]", panel="P2"),
    C("EPPARSE", "endpoint", "design", 2, 2, "POST /api/parse",
      "Next.js route, members in, fields out", "N2", host="nextjs"),
    C("PARSE", "code", "design", 3, 2, "parseMemberInput",
      "builds the prompt, validates the reply", "N2"),
    C("GEM1", "endpoint", "design", 4, 2, "Gemini generateContent",
      "Google's LLM API", "G2", host="gemini"),
    N("A3", "action", "design", 1, 3, "Confirm how input was read",
      "each member checks their own fields", badge="[3]", panel="P2",
      asks=True),
    N("D1", "decision", "design", 1, 4, "Correct?", panel="P2"),
    N("A4", "action", "design", 1, 5, "Geocode member locations",
      "place text to latitude and longitude", badge="[4]", panel="P2"),
    C("EPGEO", "endpoint", "design", 2, 5, "POST /api/geocode",
      "Next.js route, one call per member", "N3", host="nextjs"),
    C("GEO", "code", "design", 3, 5, "geocodeLocation",
      "at most 1 request a second, named User-Agent", "N3"),
    C("EPTEST", "endpoint", "built", 2, 6, "GET /api/test-geocode",
      "smoke test, one fixed address", "N3", host="nextjs"),
    C("NOM", "endpoint", "design", 4, 6, "Nominatim /search",
      "free geocoder, no API key", "O3", host="nominatim"),

    # ---- 3. Midpoint generation
    N("A5", "action", "design", 1, 7, "Generate candidate meeting points",
      "real destinations, not a raw centre", badge="[5]", panel="P3",
      fr="F2"),
    C("EPCAND", "endpoint", "design", 2, 7, "POST /candidates",
      "FastAPI route, coordinates in", "F3", host="fastapi"),
    C("CAND", "code", "design", 3, 7, "generate_candidates",
      "skips lakes, rivers and mountains", "F3"),

    # ---- 4. Scoring
    N("A6", "action", "design", 1, 8, "Score each place per member",
      "travel time, cost, weather, custom", badge="[6]", panel="P4",
      fr="F3"),
    C("EPSCORE", "endpoint", "design", 2, 8, "POST /scores",
      "FastAPI route, candidates in", "F4", host="fastapi"),
    C("SCORE", "code", "design", 3, 8, "score_candidates",
      "per-member scores, then the group average", "F4"),
    C("DM", "endpoint", "design", 4, 8, "Distance Matrix API",
      "travel time for each member", "GM4", host="gmaps"),
    N("A7", "action", "design", 1, 9, "Rank places by group score",
      "the average of each member's score", badge="[7]", panel="P4"),
    C("METEO", "endpoint", "design", 3, 9, "Open-Meteo /v1/forecast",
      "weather, free tier, no key", "OM4", host="openmeteo"),

    # ---- 5. Map, results, explanation
    C("SS2", "store", "built", 2, 10, "sessionStorage",
      "the same key, read on load", "B5"),
    N("A8", "action", "design", 1, 11, "Show top places as map pins",
      "click a pin to see its score", badge="[8]", panel="P5",
      asks=True, fr="F4"),
    C("RESULTS", "ui", "design", 2, 11, "/results page",
      "map, ranked list, raw data view", "B5"),
    C("MAPS", "endpoint", "design", 3, 11, "Maps JavaScript API",
      "draws the interactive map", "GM5", host="gmaps"),
    N("A9", "action", "design", 1, 12, "Explain trade-offs, suggest venues",
      "plain words for each top place", badge="[9]", panel="P5",
      fr="F5"),
    C("EPEXPL", "endpoint", "design", 2, 12, "POST /api/explain",
      "Next.js route, scores in, text out", "N5", host="nextjs"),
    C("EXPL", "code", "design", 3, 12, "explainTradeoffs",
      "writes the explanation and venue ideas", "N5"),
    C("GEM2", "endpoint", "design", 4, 12, "Gemini generateContent",
      "the same LLM API as step 2", "G5", host="gemini"),
]


def P(i, title, parent=None, host=None):
    return {"id": i, "title": title, "parent": parent, "host": host}


PANELS = [
    P("P1", "1. Multi-person input (step 1)"),
    P("B1", "Browser tab", "P1", "browser"),
    P("P2", "2. Parse and geocode (steps 2 to 4)"),
    P("N2", "Next.js server", "P2", "nextjs"),
    P("G2", "Google Gemini", "P2", "gemini"),
    P("N3", "Next.js server", "P2", "nextjs"),
    P("O3", "OpenStreetMap", "P2", "nominatim"),
    P("P3", "3. Midpoint generation (step 5)"),
    P("F3", "FastAPI backend", "P3", "fastapi"),
    P("P4", "4. Scoring (steps 6, 7)"),
    P("F4", "FastAPI backend", "P4", "fastapi"),
    P("GM4", "Google Maps Platform", "P4", "gmaps"),
    P("OM4", "Open-Meteo", "P4", "openmeteo"),
    P("P5", "5. Map, results, explanation (steps 8, 9)"),
    P("B5", "Browser tab", "P5", "browser"),
    P("GM5", "Google Maps Platform", "P5", "gmaps"),
    P("N5", "Next.js server", "P5", "nextjs"),
    P("G5", "Google Gemini", "P5", "gemini"),
]

HOST_STYLE = {"browser": "browser", "nextjs": "nextjs", "fastapi": "fastapi",
              "gemini": "external", "nominatim": "external",
              "gmaps": "external", "openmeteo": "external"}
PANEL_PAL = {p["id"]: (HOST_PANEL[HOST_STYLE[p["host"]]] if p["host"]
                       else GOAL_PANEL) for p in PANELS}


def E(a, b, t, label, route, d="one", nudge=(0, 0), nudge_lr=None,
      route_lr=None):
    e = {"from": a, "to": b, "type": t, "label": label, "route": route,
         "dir": d, "lnudge": list(nudge),
         "lnudge_lr": list(nudge_lr) if nudge_lr else None}
    if route_lr:
        e["route_lr"] = route_lr
    return e


EDGES = [
    E("USER", "A1", "control", "fills in", "flow", "both"),
    # 1
    E("A1", "FORM", "control", "step 1", "auto"),
    E("FORM", "SS1", "data", "saveMembers", "auto"),
    E("A1", "A2", "control", "submit", "flow"),
    # 2 to 4
    E("A2", "EPPARSE", "control", "step 2", "auto"),
    E("EPPARSE", "PARSE", "control", "runs", "auto"),
    E("PARSE", "GEM1", "data", "text, fields", "auto", "both"),
    E("A2", "A3", "control", "then", "flow"),
    E("A3", "D1", "control", "check", "flow"),
    E("D1", "A4", "control", "yes", "flow"),
    E("D1", "A1", "control", "no, edit input", "user:1"),
    E("A4", "EPGEO", "control", "step 4", "auto"),
    E("EPGEO", "GEO", "control", "runs", "auto"),
    E("GEO", "NOM", "data", "place, lat lng", "auto", "both"),
    E("EPTEST", "NOM", "data", "fixed address", "auto:0:16:16", "both"),
    E("EPTEST", "EPGEO", "control", "replaced by", "auto"),
    E("A4", "A5", "control", "then", "flow"),
    # 5
    E("A5", "EPCAND", "control", "step 5", "auto"),
    E("EPCAND", "CAND", "control", "runs", "auto"),
    E("A5", "A6", "control", "then", "flow"),
    # 6, 7
    E("A6", "EPSCORE", "control", "steps 6, 7", "auto"),
    E("EPSCORE", "SCORE", "control", "runs", "auto"),
    E("SCORE", "DM", "data", "travel times", "auto", "both"),
    E("SCORE", "METEO", "data", "forecast", "auto", "both"),
    E("A6", "A7", "control", "then", "flow"),
    E("A7", "A8", "control", "then", "flow"),
    # 8, 9
    E("A8", "RESULTS", "control", "step 8", "auto"),
    E("SS2", "RESULTS", "data", "loadMembers", "auto"),
    E("RESULTS", "MAPS", "data", "pins, map", "auto", "both"),
    E("A8", "A9", "control", "pick a pin", "flow"),
    E("A9", "EPEXPL", "control", "step 9", "auto"),
    E("EPEXPL", "EXPL", "control", "runs", "auto"),
    E("EXPL", "GEM2", "data", "scores, text", "auto", "both"),
]

KINDS = sorted({n["kind"] for n in NODES if n["cls"] == "component"})

SPEC = {
    "title": "Midway architecture, v1 blueprint",
    "output": {"stem": "midway-architecture", "primary": "td"},
    "scope": ("Midway's web app, from the group entering their details to a "
              "ranked, explained list of meeting places. Hosting, deployment "
              "and accounts are left out."),
    "classes": {
        "action": {"w": 264, "h": 92},
        "component": {"w": 236, "h": 94},
        "decision": {"w": 168, "h": 86},
        "user": {"w": 186, "h": 104},
    },
    "palette": {"panel": PANEL_PAL, "fill": FILL, "status": STATUS,
                "edge": EDGE},
    "grid": {"cell_pad": 34, "cell_pad_cross": 20, "gap_cross": 150,
             "gap": 100, "panel_pad": 14, "margin": 56},
    "nodes": NODES,
    "panels": PANELS,
    "legend": legend(KINDS, "Fn = roadmap feature n"),
    "edges": EDGES,
}
SPEC["footnote"] = (
    "Scope: " + SPEC["scope"] + "\n"
    "This is the design, not today's code: green solid is built, amber dashed "
    "is designed. The form, sessionStorage, a placeholder /results page and "
    "a smoke-test geocode route exist today. "
    "Hosts are drawn beside every stage they serve, so Next.js, FastAPI, the "
    "browser tab and the Google APIs each appear more than once. "
    "Which host runs the parser and the explainer, and the route and function "
    "names, are proposed here; the docs do not fix them yet. "
    "F1 to F5 are the five core features in docs/ROADMAP.md, once each."
)

OUT.write_text(json.dumps(SPEC, indent=2), encoding="utf-8")
print(f"wrote {OUT}  nodes {len(NODES)}  edges {len(EDGES)}  kinds {KINDS}")
