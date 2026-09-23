"""Shared visual grammar for every version of the Midway architecture diagram.

The kind map, the fills and the legend wording live here, once, so two versions
of the picture cannot drift apart. A builder imports this and never types a
colour of its own.
"""

# What each kind tag means, for the legend. Keep each to a few words; the full
# sentence belongs in the version's ARCHITECTURE.md.
KIND_TEXT = {
    "ui": "[ui] page",
    "code": "[code] plain code",
    "endpoint": "[endpoint] HTTP route",
    "store": "[store] saved data",
    "agent": "[agent] model, own prompt",
    "tool": "[tool] model calls it",
}

FILL = {
    # classes
    "action": "#BBDEFB", "decision": "#FFF9C4", "user": "#FFE0B2",
    # one fill per component kind
    "ui": "#F8BBD0", "code": "#CFD8DC", "endpoint": "#D1C4E9",
    "store": "#FFE082", "agent": "#C5CAE9", "tool": "#B2EBF2",
    "legend": "#FFFFFF",
}

# The border says whether a box exists; the fill says what it is.
STATUS = {"built": "#2E7D32", "design": "#F9A825", "future": "#9E9E9E"}

EDGE = {"control": "#37474F", "data": "#546E7A",
        "design": "#F9A825", "future": "#9E9E9E"}

# Goal panels (the numbered flow) and host panels (the machine a box runs on).
GOAL_PANEL = ["#F5F7FA", "#37474F"]
HOST_PANEL = {
    "browser": ["#FCE4EC", "#AD1457"],
    "nextjs": ["#EDE7F6", "#4527A0"],
    "fastapi": ["#E0F2F1", "#00695C"],
    "external": ["#FFF3E0", "#E65100"],
}


def legend(kinds_drawn, fr_text, statuses=("built", "design"),
           edges=("control", "data")):
    """One flat strip: the classes, one sample per kind DRAWN, the border states
    and the edge types. Nothing the canvas does not use."""
    items = [
        {"kind": "action", "text": "[n] STEP, person = group decides"},
        {"kind": "decision", "text": "DECISION"},
        {"kind": "requirement", "text": fr_text},
    ]
    order = ["ui", "endpoint", "code", "store", "agent", "tool"]
    items += [{"kind": f"kind:{k}", "text": KIND_TEXT[k]}
              for k in order if k in kinds_drawn]
    if tuple(statuses) == ("built", "design"):
        items.append({"kind": "status_bd", "text": "built / designed"})
    labels = {"control": "solid control", "data": "dotted data",
              "design": "amber dashed = design", "future": "grey dashed = later"}
    items += [{"kind": e, "text": labels[e]} for e in edges]
    return items
