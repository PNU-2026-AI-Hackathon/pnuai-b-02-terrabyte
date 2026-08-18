const FONT_SIZE_SCALE = 0.84;
const LINE_HEIGHT_SCALE = 0.86;

type TypographyScaleOptions = {
  fontSizeScale?: number;
  lineHeightScale?: number;
};

export function scaleTypography<T extends Record<string, any>>(definitions: T, options: TypographyScaleOptions = {}): T {
  const fontSizeScale = options.fontSizeScale ?? FONT_SIZE_SCALE;
  const lineHeightScale = options.lineHeightScale ?? LINE_HEIGHT_SCALE;
  const scaled: Record<string, any> = {};
  Object.entries(definitions).forEach(([key, style]) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      scaled[key] = style;
      return;
    }
    scaled[key] = {
      ...style,
      ...(typeof style.fontSize === 'number' ? { fontSize: Math.round(style.fontSize * fontSizeScale) } : {}),
      ...(typeof style.lineHeight === 'number' ? { lineHeight: Math.round(style.lineHeight * lineHeightScale) } : {}),
    };
  });
  return scaled as T;
}
