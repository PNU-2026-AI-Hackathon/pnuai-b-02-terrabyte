export function scaleTypography<T extends Record<string, any>>(definitions: T): T {
  const scaled: Record<string, any> = {};
  Object.entries(definitions).forEach(([key, style]) => {
    if (!style || typeof style !== 'object' || Array.isArray(style)) {
      scaled[key] = style;
      return;
    }
    scaled[key] = {
      ...style,
      ...(typeof style.fontSize === 'number' ? { fontSize: Math.round(style.fontSize * 0.84) } : {}),
      ...(typeof style.lineHeight === 'number' ? { lineHeight: Math.round(style.lineHeight * 0.9) } : {}),
    };
  });
  return scaled as T;
}
