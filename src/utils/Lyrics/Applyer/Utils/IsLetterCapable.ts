import { $simpleLyricsMode } from "../../../../utils/stores.ts";

const Simple = (totalDuration: number) => {
  const minDuration = 1000;

  return totalDuration >= minDuration;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SimpleLyricsModeCapable = (letterLength: number, totalDuration: number) => {
  if (letterLength > 12) {
    return false;
  }

  const minDuration = 1050;
  //const maxDuration = 8550;

  return totalDuration >= minDuration; // && totalDuration <= maxDuration;
};

export function IsLetterCapable(letterLength: number, totalDuration: number) {
  return $simpleLyricsMode.get()
    ? SimpleLyricsModeCapable(letterLength, totalDuration)
    : Simple(totalDuration);
}
