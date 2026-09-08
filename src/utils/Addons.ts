function DeepFreeze<T extends Record<string, any>>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") {
    // Base case: Return primitives as they are
    return obj as any;
  }

  // Create a copy of the object or array
  const clone: Record<string, any> = Array.isArray(obj) ? [] : {};

  // Recursively copy and freeze properties
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    clone[key] = DeepFreeze(value); // Deep copy and freeze the value
  });

  // Freeze the cloned object
  return Object.freeze(clone) as Readonly<T>;
}

function IsPlaying() {
  const state = Spicetify?.Player?.isPlaying?.();
  return state;
}

export const ArabicPersianRegex = /[\u0600-\u06FF]/;

export { DeepFreeze, IsPlaying };
