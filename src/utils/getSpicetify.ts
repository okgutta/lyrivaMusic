/** Access the `Spicetify` global without tripping type checks. */
export function getSpicetify(): any {
  return (globalThis as any).Spicetify;
}
