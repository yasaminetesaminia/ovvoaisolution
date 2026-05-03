/**
 * Language detection helpers used by the receptionist prompts and tools.
 *
 * Goal: keep the existing Persian-script blocking and Arabic-vs-English
 * routing rules from the legacy bot, in one tested place.
 */

const PERSIAN_ONLY = new Set("پچژگی‌");
const ARABIC_RANGE = /[؀-ۿ]/;

export function looksPersian(text: string): boolean {
  if (!text) return false;
  for (const ch of text) {
    if (PERSIAN_ONLY.has(ch)) return true;
  }
  return false;
}

export function isArabic(text: string): boolean {
  return ARABIC_RANGE.test(text);
}

/**
 * Pick a reply language from a caller's free-text input.
 *  - Persian script → "ar" (we never reply in Persian)
 *  - Arabic script → "ar"
 *  - everything else → "en"
 */
export function detectLanguage(text: string): "ar" | "en" {
  if (!text) return "en";
  if (looksPersian(text)) return "ar";
  if (isArabic(text)) return "ar";
  return "en";
}
