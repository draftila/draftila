export function parseLength(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  return isNaN(num) ? fallback : num;
}

export function parseCssInlineStyle(styleStr: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!styleStr) return result;

  const parts = styleStr.split(';');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = part.slice(0, colonIdx).trim();
    const val = part.slice(colonIdx + 1).trim();
    if (prop && val) result[prop] = val;
  }
  return result;
}

export function parseCssStyleSheet(cssText: string): Map<string, Record<string, string>> {
  const rules = new Map<string, Record<string, string>>();
  const ruleRegex = /([^{]+)\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = ruleRegex.exec(cssText)) !== null) {
    const selector = match[1]!.trim();
    const declarations = parseCssInlineStyle(match[2]!);
    rules.set(selector, declarations);
  }

  return rules;
}

export function getEffectiveAttribute(
  el: Element,
  attr: string,
  cssProperty: string,
  inlineStyle: Record<string, string>,
  classStyles: Record<string, string>,
): string | null {
  if (inlineStyle[cssProperty]) return inlineStyle[cssProperty]!;
  const ownAttr = el.getAttribute(attr);
  if (ownAttr !== null) return ownAttr;
  if (classStyles[cssProperty]) return classStyles[cssProperty]!;
  return null;
}
