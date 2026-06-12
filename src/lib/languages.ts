import ISO6391 from "iso-639-1";
import { config } from "../config";

// Display names come from the ISO 639-1 set so any language code resolves —
// not just the few `config.languages` features for ordering. Native name first
// (what Wikipedia shows in its interlanguage list), with the configured label
// and then the bare code as fallbacks for codes outside ISO 639-1.
export function languageName(code: string): string {
  return (
    ISO6391.getNativeName(code) ||
    config.languages.find((l) => l.code === code)?.name ||
    code
  );
}

export interface LanguageChoice {
  code: string;
  name: string;
}

// Every selectable language, configured ones first (in their listed order), then
// the rest of ISO 639-1 alphabetically by native name. Powers the "new language"
// picker so a contributor can start a page in any language.
export function allLanguages(): LanguageChoice[] {
  const featured = config.languages.map((l) => l.code);
  const rest = ISO6391.getAllCodes()
    .filter((c) => !featured.includes(c))
    .map((c) => ({ code: c, name: languageName(c) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...featured.map((c) => ({ code: c, name: languageName(c) })), ...rest];
}
