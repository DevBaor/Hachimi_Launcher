import { net } from "electron";
import { logger } from "@main/services";
import { registerEvent } from "../register-event";

type GoogleTranslateResponse = Array<
  Array<[string, string, unknown, unknown]> | unknown
>;

type MyMemoryTranslateResponse = {
  responseData?: {
    translatedText?: string;
  };
};

const normalizeText = (value: string) =>
  value
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll(/\s+/g, " ")
    .trim();

const isSameText = (source: string, translated: string) =>
  source.localeCompare(translated, undefined, { sensitivity: "accent" }) === 0;

const translateWithGoogle = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
) => {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", sourceLanguage || "auto");
  url.searchParams.set("tl", targetLanguage);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await net.fetch(url.toString());
  if (!response.ok) return "";

  const payload = (await response.json()) as GoogleTranslateResponse;
  const chunks = Array.isArray(payload?.[0]) ? payload[0] : [];

  return chunks
    .map((chunk) =>
      Array.isArray(chunk) && typeof chunk[0] === "string" ? chunk[0] : ""
    )
    .join("")
    .trim();
};

const translateWithMyMemory = async (
  text: string,
  sourceLanguage: string,
  targetLanguage: string
) => {
  const source =
    sourceLanguage && sourceLanguage !== "auto" ? sourceLanguage : "en";

  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", `${source}|${targetLanguage}`);

  const response = await net.fetch(url.toString());
  if (!response.ok) return "";

  const payload = (await response.json()) as MyMemoryTranslateResponse;
  return payload?.responseData?.translatedText?.trim() ?? "";
};

const translateText = async (
  _event: Electron.IpcMainInvokeEvent,
  text: string,
  targetLanguage: string,
  sourceLanguage: string = "auto"
): Promise<string | null> => {
  try {
    const normalizedText = normalizeText(text ?? "");
    if (!normalizedText) return null;

    const providers = [
      () => translateWithGoogle(normalizedText, sourceLanguage, targetLanguage),
      () =>
        translateWithMyMemory(normalizedText, sourceLanguage, targetLanguage),
    ];

    for (const provider of providers) {
      try {
        const translated = normalizeText(await provider());

        if (!translated) continue;
        if (isSameText(normalizedText, translated)) continue;

        return translated;
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    logger.warn("Failed to translate text for hero description", {
      targetLanguage,
      sourceLanguage,
      error,
    });
    return null;
  }
};

registerEvent("translateText", translateText);
