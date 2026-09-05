// Dev-mode flag. `__SLdev__m` is injected by spicetify-creator in dev builds
// (see `devModeVarName` in spice.config.ts); it is undefined in production
// builds, so this evaluates to false there.
export const isDev = (globalThis as any).__SLdev__m === true;
