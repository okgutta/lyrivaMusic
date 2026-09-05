declare module "kuroshiro" {
  interface KuroshiroConverter {
    init(analyzer: unknown): Promise<unknown>;
    convert(text: string, options: { to: string; mode: string }): Promise<string>;
  }

  const Kuroshiro: new () => KuroshiroConverter;
  export default Kuroshiro;
}

declare module "langs" {
  const langs: {
    where(type: string, value: string): Record<string, string> | undefined;
  };
  export default langs;
}
