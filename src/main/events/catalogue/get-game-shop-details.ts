import { getSteamAppDetails, logger } from "@main/services";
import { getSteamLanguage } from "@shared";

import type { ShopDetails, GameShop, ShopDetailsWithAssets } from "@types";

import { registerEvent } from "../register-event";
import {
  gamesShopAssetsSublevel,
  gamesShopCacheSublevel,
  levelKeys,
} from "@main/level";

const readCachedValue = async <T>(promise: Promise<T>): Promise<T | null> => {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      return null;
    }

    throw error;
  }
};

const hasMeaningfulText = (value?: string | null) =>
  Boolean(
    value
      ?.replaceAll(/<[^>]+>/g, " ")
      ?.replaceAll("&nbsp;", " ")
      ?.replaceAll(/\s+/g, " ")
      ?.trim()
  );

const hasRequirements = (details: ShopDetails | null | undefined) =>
  [
    details?.pc_requirements?.minimum,
    details?.pc_requirements?.recommended,
    details?.linux_requirements?.minimum,
    details?.linux_requirements?.recommended,
    details?.mac_requirements?.minimum,
    details?.mac_requirements?.recommended,
  ].some((value) => hasMeaningfulText(value));

const hasDescriptions = (details: ShopDetails | null | undefined) =>
  hasMeaningfulText(details?.short_description) ||
  hasMeaningfulText(details?.about_the_game);

const hasMedia = (details: ShopDetails | null | undefined) =>
  Boolean(details?.screenshots?.length || details?.movies?.length);

const mergeTextField = (
  localizedValue?: string | null,
  fallbackValue?: string | null
): string =>
  hasMeaningfulText(localizedValue)
    ? (localizedValue ?? "")
    : (fallbackValue ?? localizedValue ?? "");

const mergeRequirements = (
  localizedRequirements?: { minimum: string; recommended: string } | null,
  fallbackRequirements?: { minimum: string; recommended: string } | null
): { minimum: string; recommended: string } => ({
  minimum: mergeTextField(
    localizedRequirements?.minimum,
    fallbackRequirements?.minimum
  ),
  recommended: mergeTextField(
    localizedRequirements?.recommended,
    fallbackRequirements?.recommended
  ),
});

const mergeShopDetails = (
  localizedDetails: ShopDetails | null | undefined,
  fallbackDetails: ShopDetails | null | undefined
): ShopDetails | null => {
  if (!localizedDetails && !fallbackDetails) {
    return null;
  }

  if (!localizedDetails) {
    return fallbackDetails ?? null;
  }

  if (!fallbackDetails) {
    return localizedDetails;
  }

  return {
    ...fallbackDetails,
    ...localizedDetails,
    name: localizedDetails.name || fallbackDetails.name,
    detailed_description: mergeTextField(
      localizedDetails.detailed_description,
      fallbackDetails.detailed_description
    ),
    about_the_game: mergeTextField(
      localizedDetails.about_the_game,
      fallbackDetails.about_the_game
    ),
    short_description: mergeTextField(
      localizedDetails.short_description,
      fallbackDetails.short_description
    ),
    supported_languages: mergeTextField(
      localizedDetails.supported_languages,
      fallbackDetails.supported_languages
    ),
    publishers: localizedDetails.publishers?.length
      ? localizedDetails.publishers
      : (fallbackDetails.publishers ?? []),
    genres: localizedDetails.genres?.length
      ? localizedDetails.genres
      : (fallbackDetails.genres ?? []),
    screenshots: localizedDetails.screenshots?.length
      ? localizedDetails.screenshots
      : fallbackDetails.screenshots,
    movies: localizedDetails.movies?.length
      ? localizedDetails.movies
      : fallbackDetails.movies,
    pc_requirements: mergeRequirements(
      localizedDetails.pc_requirements,
      fallbackDetails.pc_requirements
    ),
    mac_requirements: mergeRequirements(
      localizedDetails.mac_requirements,
      fallbackDetails.mac_requirements
    ),
    linux_requirements: mergeRequirements(
      localizedDetails.linux_requirements,
      fallbackDetails.linux_requirements
    ),
    release_date:
      localizedDetails.release_date?.date ||
      localizedDetails.release_date?.coming_soon
        ? localizedDetails.release_date
        : fallbackDetails.release_date,
    content_descriptors: localizedDetails.content_descriptors?.ids?.length
      ? localizedDetails.content_descriptors
      : fallbackDetails.content_descriptors,
  };
};

const isCacheUsable = (
  details: ShopDetails | null | undefined
): details is ShopDetails =>
  Boolean(details) &&
  hasDescriptions(details) &&
  hasRequirements(details) &&
  hasMedia(details);

const getLocalizedSteamAppDetails = async (
  objectId: string,
  language: string
): Promise<ShopDetails | null> => {
  return getSteamAppDetails(objectId, language);
};

const getGameShopDetails = async (
  _event: Electron.IpcMainInvokeEvent,
  objectId: string,
  shop: GameShop,
  language: string
): Promise<ShopDetailsWithAssets | null> => {
  if (shop === "custom") return null;
  const baseLanguage = language.trim().toLowerCase() || "en";
  const normalizedLanguage = getSteamLanguage(baseLanguage);

  if (shop === "steam") {
    const [cachedDataRaw, cachedEnglishDataRaw, cachedAssets] =
      await Promise.all([
        readCachedValue(
          gamesShopCacheSublevel.get(
            levelKeys.gameShopCacheItem(shop, objectId, normalizedLanguage)
          )
        ),
        normalizedLanguage === "english"
          ? Promise.resolve(null)
          : readCachedValue(
              gamesShopCacheSublevel.get(
                levelKeys.gameShopCacheItem(shop, objectId, "english")
              )
            ),
        readCachedValue(
          gamesShopAssetsSublevel.get(levelKeys.game(shop, objectId))
        ),
      ]);
    const cachedData = (cachedDataRaw ?? null) as ShopDetails | null;
    const cachedEnglishData = (cachedEnglishDataRaw ??
      null) as ShopDetails | null;
    const mergedCachedData =
      normalizedLanguage === "english"
        ? cachedData
        : mergeShopDetails(cachedData, cachedEnglishData);

    const appDetailsPromise = getLocalizedSteamAppDetails(
      objectId,
      normalizedLanguage
    ).then(async (localizedDetails) => {
      const shouldFetchEnglishFallback =
        normalizedLanguage !== "english" &&
        (!localizedDetails || !isCacheUsable(localizedDetails));
      const englishDetails =
        normalizedLanguage === "english"
          ? localizedDetails
          : shouldFetchEnglishFallback
            ? await getSteamAppDetails(objectId, "english")
            : cachedEnglishData;
      const details =
        normalizedLanguage === "english"
          ? localizedDetails
          : mergeShopDetails(localizedDetails, englishDetails);

      if (details) {
        details.name = cachedAssets?.title ?? details.name;

        gamesShopCacheSublevel
          .put(
            levelKeys.gameShopCacheItem(shop, objectId, normalizedLanguage),
            details
          )
          .catch((err) => {
            logger.error("Could not cache game details", err);
          });

        if (normalizedLanguage !== "english" && englishDetails) {
          gamesShopCacheSublevel
            .put(
              levelKeys.gameShopCacheItem(shop, objectId, "english"),
              englishDetails
            )
            .catch((err) => {
              logger.error("Could not cache english game details", err);
            });
        }

        return {
          ...details,
          assets: cachedAssets ?? null,
        };
      }

      return null;
    });

    if (isCacheUsable(mergedCachedData)) {
      return Object.assign({}, mergedCachedData, {
        assets: cachedAssets ?? null,
      }) as ShopDetailsWithAssets;
    }

    const liveDetails = await appDetailsPromise;
    if (liveDetails) {
      return liveDetails;
    }

    if (mergedCachedData) {
      return Object.assign({}, mergedCachedData, {
        assets: cachedAssets ?? null,
      }) as ShopDetailsWithAssets;
    }

    return null;
  }

  throw new Error("Not implemented");
};

registerEvent("getGameShopDetails", getGameShopDetails);
