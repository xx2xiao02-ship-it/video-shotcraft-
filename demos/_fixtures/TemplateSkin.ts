export type TemplateSkin = {
  bg: string;
  text: string;
  muted: string;
  accent: string;
  surface: string;
  fontFamily: string;
  transparentBackground?: boolean;
};

export const skinBackground = (skin: TemplateSkin | undefined, fallback: string) =>
  skin?.transparentBackground ? 'transparent' : skin?.bg || fallback;
