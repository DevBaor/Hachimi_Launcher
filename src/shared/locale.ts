const DEFAULT_LANGUAGE = "en";

const STEAM_LANGUAGE_BY_BASE_LANGUAGE: Record<string, string> = {
  pt: "brazilian",
  es: "spanish",
  fr: "french",
  ru: "russian",
  be: "russian",
  it: "italian",
  hu: "hungarian",
  pl: "polish",
  zh: "schinese",
  da: "danish",
  vi: "vietnamese",
};

const BASE_LANGUAGE_BY_STEAM_LANGUAGE: Record<string, string> = {
  english: "en",
  brazilian: "pt",
  spanish: "es",
  french: "fr",
  russian: "ru",
  italian: "it",
  hungarian: "hu",
  polish: "pl",
  schinese: "zh",
  danish: "da",
  vietnamese: "vi",
};

export const getBaseLanguage = (language?: string | null): string => {
  const normalizedLanguage = language?.trim().toLowerCase() ?? "";
  if (!normalizedLanguage) return DEFAULT_LANGUAGE;

  if (BASE_LANGUAGE_BY_STEAM_LANGUAGE[normalizedLanguage]) {
    return BASE_LANGUAGE_BY_STEAM_LANGUAGE[normalizedLanguage];
  }

  return normalizedLanguage.split("-")[0] || DEFAULT_LANGUAGE;
};

export const isSameBaseLanguage = (
  firstLanguage?: string | null,
  secondLanguage?: string | null
) => getBaseLanguage(firstLanguage) === getBaseLanguage(secondLanguage);

export const getSteamLanguage = (language?: string | null): string =>
  STEAM_LANGUAGE_BY_BASE_LANGUAGE[getBaseLanguage(language)] ?? "english";

export const buildLocaleCacheKey = (
  language: string | null | undefined,
  ...parts: Array<string | number | null | undefined>
) =>
  [getBaseLanguage(language), ...parts]
    .filter(
      (part): part is string | number => part !== null && part !== undefined
    )
    .map((part) => String(part))
    .join(":");
