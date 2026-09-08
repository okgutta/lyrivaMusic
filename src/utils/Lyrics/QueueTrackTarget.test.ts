import { findNextTrackTarget, targetFromQueueEntry } from "./QueueTrackTarget.ts";

const playerTrack = targetFromQueueEntry({
  uri: "spotify:track:next-player",
  name: "Player Song",
  artists: [{ name: "First Artist" }, { name: "Second Artist" }],
  album: { name: "Player Album" },
  duration: { milliseconds: 203_500 },
  external_ids: { isrc: "TEST123" },
});

if (
  playerTrack?.title !== "Player Song" ||
  playerTrack.artists.join("|") !== "First Artist|Second Artist" ||
  playerTrack.durationMs !== 203_500 ||
  playerTrack.isrc !== "TEST123"
) {
  throw new Error("PlayerTrack metadata was not parsed correctly");
}

const contextTrack = targetFromQueueEntry({
  contextTrack: {
    uri: "spotify:track:next-context",
    metadata: {
      title: "Context Song",
      artist_name: "Lead Artist",
      "artist_name:1": "Guest Artist",
      album_title: "Context Album",
      duration: "184000",
    },
  },
});

if (
  contextTrack?.album !== "Context Album" ||
  contextTrack.artists.join("|") !== "Lead Artist|Guest Artist" ||
  contextTrack.durationMs !== 184_000
) {
  throw new Error("Queue context metadata was not parsed correctly");
}

const next = findNextTrackTarget(
  "spotify:track:current",
  [
    { uri: "spotify:episode:not-a-track", name: "Episode", artists: [{ name: "Host" }] },
    { uri: "spotify:track:current", name: "Current", artists: [{ name: "Artist" }] },
  ],
  [
    {
      contextTrack: {
        uri: "spotify:track:queue-fallback",
        metadata: { title: "Queued", artist_name: "Queue Artist" },
      },
    },
  ]
);

if (next?.uri !== "spotify:track:queue-fallback") {
  throw new Error("the first valid non-current queue track should be selected");
}

console.log("QueueTrackTarget tests passed");
