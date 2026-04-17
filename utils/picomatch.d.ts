declare module 'picomatch' {
  export type Matcher = (input: string) => boolean;

  export default function picomatch(
    pattern: string | readonly string[],
  ): Matcher;
}
