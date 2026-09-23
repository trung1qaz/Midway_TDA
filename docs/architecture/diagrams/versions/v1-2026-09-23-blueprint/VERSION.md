# v1, 2026-09-23: blueprint

| | |
| --- | --- |
| Depicts | The planned Midway web app, from the group entering their details to a ranked, explained list of meeting places. Built and designed parts are marked on the picture by border colour. |
| Stance | A **plan**, not a deployment. Green solid borders are code that exists; amber dashed borders are designed. |
| Commit it describes | `b7b2cde` (refactor: switch geocoding test from Google Maps to OSM Nominatim) |
| Stable commit to revert to | `b7b2cde` |
| Deployed by | Nothing. No deploy runs this design. |
| Sources | `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/ETHICS.md`, and the code under `app/`, `components/`, `lib/`, `types/` |

## Files

| File | What it is |
| --- | --- |
| `midway-architecture.png` / `.svg` | the primary render (top down) |
| `midway-architecture-td.*` | top down, aspect 1.49 |
| `midway-architecture-lr.*` | left to right, aspect 4.19 |
| `build_spec.py` | the source. Edit this, never the JSON |
| `midway-architecture-layout.json` | the spec the builder wrote and the renderer read |
| `ARCHITECTURE.md` | the prose behind the picture |

## Rebuild

```
python build_spec.py midway-architecture-layout.json
python ../../render_layout.py midway-architecture-layout.json --out-dir .
```

## Render report

| | Top down | Left to right |
| --- | --- | --- |
| Size (SVG px) | 1999 x 2982 | 4849 x 1156 |
| overlap / label / isolated / headless | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| crossings | 0 | 0 |
| grammar (rules 7b, 16 to 18) | 0 | (checked once) |

32 nodes, 33 edges. Re-rendering produces byte-identical SVG and PNG output.
