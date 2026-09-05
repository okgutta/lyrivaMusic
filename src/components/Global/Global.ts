import Event from "../../utils/EventManager.ts";

// Note: the old `window._spicy_lyrics` scope + SetScope/GetScope bridge was
// removed with the Spicy API in v2-full — nothing read it anymore.
const Global = {
  Event,
  Saves: {} as any,
};

export default Global;
