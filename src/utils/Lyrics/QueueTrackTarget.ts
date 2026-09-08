import type { TargetTrack } from "./matcher.ts";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDurationMs(track: UnknownRecord, metadata: UnknownRecord): number | undefined {
  const duration = asRecord(track.duration);
  const raw =
    duration.milliseconds ??
    track.durationMs ??
    track.duration_ms ??
    metadata.duration_ms ??
    metadata.duration;
  const numeric = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 1_000 ? Math.round(numeric * 1_000) : Math.round(numeric);
}

function readArtists(track: UnknownRecord, metadata: UnknownRecord): string[] {
  const trackArtists = Array.isArray(track.artists)
    ? track.artists
        .map((artist) => nonEmptyString(asRecord(artist).name))
        .filter((artist): artist is string => Boolean(artist))
    : [];
  if (trackArtists.length) return [...new Set(trackArtists)];

  return [
    ...new Set(
      Object.entries(metadata)
        .filter(([key]) => key === "artist_name" || /^artist_name:\d+$/.test(key))
        .sort(([left], [right]) => {
          if (left === "artist_name") return -1;
          if (right === "artist_name") return 1;
          return Number(left.split(":")[1]) - Number(right.split(":")[1]);
        })
        .map(([, value]) => nonEmptyString(value))
        .filter((artist): artist is string => Boolean(artist))
    ),
  ];
}

/** Convert either a PlayerTrack or a Queue context-track wrapper into a fetch target. */
export function targetFromQueueEntry(entry: unknown): TargetTrack | null {
  const wrapper = asRecord(entry);
  const track = asRecord(wrapper.contextTrack ?? wrapper.track ?? wrapper.item ?? wrapper);
  const metadata = asRecord(track.metadata ?? wrapper.metadata);
  const uri = nonEmptyString(track.uri ?? metadata.uri ?? metadata.entity_uri);
  if (!uri || !/^spotify:track:[^:]+$/.test(uri)) return null;

  const title = nonEmptyString(track.name ?? metadata.title ?? metadata.name);
  const artists = readArtists(track, metadata);
  if (!title || !artists.length) return null;

  const album = asRecord(track.album);
  const externalIds = asRecord(track.external_ids ?? metadata.external_ids);

  return {
    uri,
    title,
    artists,
    album: nonEmptyString(album.name ?? metadata.album_title),
    durationMs: readDurationMs(track, metadata),
    isrc: nonEmptyString(externalIds.isrc ?? metadata.isrc),
  };
}

/** Return only the first playable track after the current item. */
export function findNextTrackTarget(
  currentUri: string | undefined,
  playerNextItems: readonly unknown[] | undefined,
  queueNextTracks: readonly unknown[] | undefined
): TargetTrack | null {
  for (const entry of [...(playerNextItems ?? []), ...(queueNextTracks ?? [])]) {
    const target = targetFromQueueEntry(entry);
    if (target && target.uri !== currentUri) return target;
  }
  return null;
}
