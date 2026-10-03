/**
 * Text handling for PDF output. pdf-lib's built-in fonts only cover the
 * WinAnsi (Latin-1-ish) character set; asking one to draw anything else throws.
 * Since a project title is user-typed -- and Cyrillic is a realistic one --
 * text is made safe up front: the diameter sign becomes "Ø", Ukrainian/Russian
 * Cyrillic is transliterated to Latin, and whatever is still unencodable
 * becomes "?", so exporting can never fail because of what a title says.
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  // Russian-only letters
  ё: "e", ъ: "", ы: "y", э: "e",
};

/** Transliterates Cyrillic to Latin, preserving capitalization ("Ж" -> "Zh"). */
export function transliterateCyrillic(text: string): string {
  return Array.from(text, (ch) => {
    const lower = ch.toLowerCase();
    const latin = CYRILLIC_TO_LATIN[lower];
    if (latin === undefined) return ch;
    return lower === ch ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
  }).join("");
}

/**
 * Makes `text` safe to draw with a font that supports only `supportedCodePoints`.
 * Control characters (including line breaks) become spaces.
 */
export function toPdfSafeText(text: string, supportedCodePoints: ReadonlySet<number>): string {
  return Array.from(transliterateCyrillic(text.replace(/⌀/g, "Ø")), (ch) => {
    const code = ch.codePointAt(0)!;
    if (code < 0x20) return " ";
    return supportedCodePoints.has(code) ? ch : "?";
  }).join("");
}
