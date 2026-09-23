# Architecture diagrams

Each architecture change gets a new version folder. Folders that have been reviewed are read-only: to change the design, copy the newest builder into a new folder.

| Version | What it depicts | Commit described | Revert to | Deployed |
| --- | --- | --- | --- | --- |
| [v1-2026-09-23-blueprint](versions/v1-2026-09-23-blueprint/VERSION.md) | Planned full system, with built parts marked | `b7b2cde` | `b7b2cde` | no |

## Shared files

| File | What it is |
| --- | --- |
| `render_layout.py` | renderer and audit (18 rules). It writes SVG and PNG in both orientations and exits non-zero on any finding |
| `grammar.py` | kind tags, fills, panel colours and legend wording, shared by every version |

The renderer needs Python 3 (standard library only) and Chrome for the PNGs.
