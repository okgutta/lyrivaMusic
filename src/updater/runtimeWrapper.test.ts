/// <reference types="node" />
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { wrapRuntime } from "../../scripts/runtime-wrapper.mjs";

const compiled = `/* stock event wrapper */
/* --- START --- */(async function() {
  const styleId = "slstyles";
  window.started = (window.started || 0) + 1;
  window.styleId = styleId;
})();/* --- END --- */`;
const wrapped = wrapRuntime(compiled);
const spotify = {
  React: {},
  ReactJSX: {},
  ReactDOM: {},
  Platform: {},
  Player: {},
  CosmosAsync: {},
  Events: {
    platformLoaded: {
      on() {
        throw new Error("Cannot subscribe after a one-time ready event");
      },
    },
    webpackLoaded: {
      on() {
        throw new Error("Cannot subscribe after a one-time ready event");
      },
    },
  },
};
const window: any = { Spicetify: spotify };
await runInNewContext(wrapped, { window, console, Date, setTimeout });
assert.equal(window.started, 1, "runtime starts when Spotify is already ready");
assert.equal(window.styleId, "slstyles");
await runInNewContext(wrapped, { window, console, Date, setTimeout });
assert.equal(window.started, 1, "a second loader cannot initialize a second runtime");

const lateWindow: any = {};
await runInNewContext(wrapped, {
  window: lateWindow,
  console,
  Date,
  setTimeout(callback: () => void) {
    lateWindow.Spicetify = spotify;
    callback();
  },
});
assert.equal(lateWindow.started, 1, "runtime waits for dependencies that arrive later");
assert.throws(() => wrapRuntime("unexpected creator output"));
assert.throws(() => wrapRuntime(compiled + compiled));
assert.throws(() => wrapRuntime(compiled.replace('"slstyles"', '"other"')));
console.log("Runtime wrapper readiness and duplicate-load tests passed");
