const FONT_SIZE_SCALE = 0.8;
const LINE_HEIGHT_SCALE = 0.86;

export function scaleTypography<T extends Record<string, any>>(definitions: T): T {
  const scaled: Record<string, any> = {};
  Object.entries(definitions).forEach(([key, style]) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      scaled[key] = style;
      return;
    }
    scaled[key] = {
      ...style,
      ...(typeof style.fontSize === 'number' ? { fontSize: Math.round(style.fontSize * FONT_SIZE_SCALE) } : {}),
      ...(typeof style.lineHeight === 'number' ? { lineHeight: Math.round(style.lineHeight * LINE_HEIGHT_SCALE) } : {}),
    };
  });
  return scaled as T;
}
