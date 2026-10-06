import type { LatLng, ParsedMember, ResolvedAnchor, ResolvedMember } from "@/types/parsed";
import { sphericalCentroid } from "./geometry";
import type { Geocoder } from "./types";

// Geocodes each member's anchors and computes their effective location:
// the anchor itself for "point"/"area", the geographic midpoint of the
// anchors for "between". Sequential on purpose; the geocoder is throttled.

export function effectivePoint(kind: ParsedMember["location"]["kind"], anchors: LatLng[]): LatLng | null {
  if (anchors.length === 0) return null;
  if (kind === "between") return sphericalCentroid(anchors);
  return anchors[0];
}

export async function resolveMember(member: ParsedMember, geocoder: Geocoder): Promise<ResolvedMember> {
  const anchors: ResolvedAnchor[] = [];
  const unresolved: string[] = [];
  let lookupFailed = false;

  for (const query of member.location.anchors) {
    try {
      const place = await geocoder.geocode(query);
      if (place) {
        anchors.push({
          query,
          displayName: place.displayName,
          point: place.point,
          osmType: place.osmType,
          osmId: place.osmId,
        });
      } else {
        unresolved.push(query);
      }
    } catch (error) {
      lookupFailed = true;
      unresolved.push(query);
      console.error("[geocode] lookup failed:", error instanceof Error ? error.message : error);
    }
  }

  const warnings = [...member.warnings];
  let confidence = member.confidence;
  if (unresolved.length > 0) {
    confidence = "low";
    warnings.push(
      lookupFailed
        ? "The place lookup service didn't respond for part of this location. Try re-checking it."
        : `Couldn't find ${unresolved.map((q) => `"${q}"`).join(", ")} on the map. Try a more specific place name.`
    );
    if (member.location.kind === "between" && anchors.length === 1) {
      warnings.push(`Only "${anchors[0].query}" was found, so it is used on its own instead of a midpoint.`);
    }
  }

  return {
    ...member,
    confidence,
    warnings,
    resolution: {
      anchors,
      unresolved,
      point: effectivePoint(member.location.kind, anchors.map((a) => a.point)),
    },
  };
}

export async function resolveMembers(members: ParsedMember[], geocoder: Geocoder): Promise<ResolvedMember[]> {
  const resolved: ResolvedMember[] = [];
  for (const member of members) resolved.push(await resolveMember(member, geocoder));
  return resolved;
}
