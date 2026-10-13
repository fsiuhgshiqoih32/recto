// Types for the `hyphen` package (it ships none).
declare module 'hyphen' {
  interface HyphenatorOptions {
    hyphenChar?: string;
    minWordLength?: number;
    html?: boolean;
    async?: boolean;
  }
  export default function createHyphenator(patterns: unknown, options?: HyphenatorOptions): (text: string) => string;
}

declare module 'hyphen/patterns/*.js' {
  const patterns: unknown;
  export default patterns;
}
