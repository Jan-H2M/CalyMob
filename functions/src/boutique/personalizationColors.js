// MOB-052: resolve only catalogue-authorized thread labels, without price changes.
function resolvePersonalizationColor(option, requested, invalid) {
  const fail = () => { throw invalid(); };
  const validLabel = value => typeof value === 'string' && value.trim().length > 0
    && value.trim().length <= 40 && !/[\u0000-\u001f\u007f<>]/.test(value.trim());
  const rawColors = option.allowedColors;
  if (rawColors !== undefined && (!Array.isArray(rawColors) || rawColors.length > 16
    || !rawColors.every(validLabel))) fail();
  const colors = [...new Map((rawColors || []).map(value => [value.trim().toLowerCase(), value.trim()])).values()];
  const fixed = typeof option.color === 'string' ? option.color.trim() : '';
  if (fixed && !validLabel(fixed)) fail();
  const fallback = colors.find(value => value.toLowerCase() === fixed.toLowerCase()) || colors[0] || fixed;
  if (requested === undefined || requested === null || requested === '') return fallback || null;
  if (!validLabel(requested)) fail();
  const selected = requested.trim();
  const canonical = colors.length
    ? colors.find(value => value.toLowerCase() === selected.toLowerCase())
    : fixed && fixed.toLowerCase() === selected.toLowerCase() ? fixed : null;
  if (!canonical) fail();
  return canonical;
}

module.exports = { resolvePersonalizationColor };
