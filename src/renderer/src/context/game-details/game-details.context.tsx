import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { setHeaderTitle } from "@renderer/features";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import { getBaseLanguage, getSteamLanguage } from "@renderer/helpers";
import {
  useAppDispatch,
  useAppSelector,
  useDownload,
  useUserDetails,
} from "@renderer/hooks";

import type {
  DownloadSource,
  GameRepack,
  GameShop,
  GameStats,
  LibraryGame,
  ShopAssets,
  ShopDetails,
  ShopDetailsWithAssets,
  UserAchievement,
} from "@types";

import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import {
  GameDetailsContext,
  GameOptionsCategoryId,
} from "./game-details.context.types";
import { SteamContentDescriptor } from "@shared";

export const gameDetailsContext = createContext<GameDetailsContext>({
  game: null,
  gameAssets: null,
  shopDetails: null,
  repacks: [],
  shop: "steam",
  gameTitle: "",
  isGameRunning: false,
  isLoading: false,
  objectId: undefined,
  showRepacksModal: false,
  showGameOptionsModal: false,
  gameOptionsInitialCategory: "general",
  stats: null,
  achievements: null,
  hasNSFWContentBlocked: false,
  lastDownloadedOption: null,
  selectGameExecutable: async () => null,
  updateGame: async () => {},
  setShowGameOptionsModal: () => {},
  setGameOptionsInitialCategory: () => {},
  setShowRepacksModal: () => {},
  setHasNSFWContentBlocked: () => {},
});

const hasMeaningfulText = (value?: string | null) =>
  Boolean(
    value
      ?.replaceAll(/<[^>]+>/g, " ")
      ?.replaceAll("&nbsp;", " ")
      ?.replaceAll(/\s+/g, " ")
      ?.trim()
  );

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

const mergeShopDetailsForRenderer = (
  localizedDetails: ShopDetailsWithAssets | null,
  fallbackDetails: ShopDetailsWithAssets | null
): ShopDetailsWithAssets | null => {
  if (!localizedDetails && !fallbackDetails) return null;
  if (!localizedDetails) return fallbackDetails;
  if (!fallbackDetails) return localizedDetails;

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
    publishers:
      localizedDetails.publishers?.length > 0
        ? localizedDetails.publishers
        : (fallbackDetails.publishers ?? []),
    genres:
      localizedDetails.genres?.length > 0
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
    content_descriptors:
      localizedDetails.content_descriptors?.ids?.length > 0
        ? localizedDetails.content_descriptors
        : fallbackDetails.content_descriptors,
    assets: localizedDetails.assets ?? fallbackDetails.assets ?? null,
  };
};

type TranslatedRequirements = {
  minimum?: string;
  recommended?: string;
};

type AutoTranslatedDetails = Partial<
  Pick<
    ShopDetails,
    "short_description" | "about_the_game" | "detailed_description"
  >
> & {
  pc_requirements?: TranslatedRequirements;
  mac_requirements?: TranslatedRequirements;
  linux_requirements?: TranslatedRequirements;
};

const normalizeTextForCompare = (value?: string | null) =>
  value
    ?.replaceAll(/<[^>]+>/g, " ")
    ?.replaceAll("&nbsp;", " ")
    ?.replaceAll(/\s+/g, " ")
    ?.trim()
    ?.toLocaleLowerCase() ?? "";

const shouldTranslateField = (
  localizedValue?: string | null,
  englishValue?: string | null
) =>
  hasMeaningfulText(englishValue) &&
  (!hasMeaningfulText(localizedValue) ||
    normalizeTextForCompare(localizedValue) ===
      normalizeTextForCompare(englishValue));

const splitTextIntoChunks = (value: string, maxLength: number) => {
  const normalized = normalizeTextForCompare(value);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);

  return chunks.length ? chunks : [normalized.slice(0, maxLength)];
};

const formatTranslatedHtml = (value: string) =>
  value.replace(/\n+/g, "<br />").trim();

const { Provider } = gameDetailsContext;
export const { Consumer: GameDetailsContextConsumer } = gameDetailsContext;

export interface GameDetailsContextProps {
  children: React.ReactNode;
  objectId: string;
  gameTitle: string;
  shop: GameShop;
}

export function GameDetailsContextProvider({
  children,
  objectId,
  gameTitle,
  shop,
}: Readonly<GameDetailsContextProps>) {
  const [shopDetails, setShopDetails] = useState<ShopDetailsWithAssets | null>(
    null
  );
  const [englishShopDetails, setEnglishShopDetails] =
    useState<ShopDetailsWithAssets | null>(null);
  const [gameAssets, setGameAssets] = useState<ShopAssets | null>(null);
  const [achievements, setAchievements] = useState<UserAchievement[] | null>(
    null
  );
  const [game, setGame] = useState<LibraryGame | null>(null);
  const [hasNSFWContentBlocked, setHasNSFWContentBlocked] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [stats, setStats] = useState<GameStats | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [showRepacksModal, setShowRepacksModal] = useState(false);
  const [showGameOptionsModal, setShowGameOptionsModal] = useState(false);
  const [gameOptionsInitialCategory, setGameOptionsInitialCategory] =
    useState<GameOptionsCategoryId>("general");
  const [repacks, setRepacks] = useState<GameRepack[]>([]);
  const [autoTranslatedDetails, setAutoTranslatedDetails] =
    useState<AutoTranslatedDetails | null>(null);
  const translationCacheRef = useRef<Map<string, AutoTranslatedDetails>>(
    new Map()
  );

  const { i18n } = useTranslation("game_details");
  const location = useLocation();

  const dispatch = useAppDispatch();

  const { lastPacket } = useDownload();
  const { userDetails } = useUserDetails();

  const userPreferences = useAppSelector(
    (state) => state.userPreferences.value
  );
  const baseLanguage = getBaseLanguage(i18n.resolvedLanguage ?? i18n.language);
  const steamLanguage =
    baseLanguage === "vi" ? "english" : getSteamLanguage(baseLanguage);
  const shouldFetchEnglishFallback =
    shop === "steam" && steamLanguage !== "english";

  const updateGame = useCallback(async () => {
    return window.electron
      .getGameByObjectId(shop, objectId)
      .then((result) => setGame(result));
  }, [shop, objectId]);

  const isGameDownloading =
    lastPacket?.gameId === game?.id && game?.download?.status === "active";

  const resolvedShopDetails = useMemo(
    () =>
      shouldFetchEnglishFallback
        ? mergeShopDetailsForRenderer(shopDetails, englishShopDetails)
        : shopDetails,
    [englishShopDetails, shopDetails, shouldFetchEnglishFallback]
  );

  const resolvedShopDetailsWithAutoTranslation = useMemo(() => {
    if (!resolvedShopDetails || !autoTranslatedDetails) {
      return resolvedShopDetails;
    }

    const mergeRequirements = (
      original?: { minimum?: string; recommended?: string } | null,
      translated?: TranslatedRequirements
    ) => ({
      minimum: translated?.minimum ?? original?.minimum ?? "",
      recommended: translated?.recommended ?? original?.recommended ?? "",
    });

    return {
      ...resolvedShopDetails,
      ...autoTranslatedDetails,
      pc_requirements: mergeRequirements(
        resolvedShopDetails.pc_requirements,
        autoTranslatedDetails.pc_requirements
      ),
      mac_requirements: mergeRequirements(
        resolvedShopDetails.mac_requirements,
        autoTranslatedDetails.mac_requirements
      ),
      linux_requirements: mergeRequirements(
        resolvedShopDetails.linux_requirements,
        autoTranslatedDetails.linux_requirements
      ),
    };
  }, [autoTranslatedDetails, resolvedShopDetails]);

  useEffect(() => {
    updateGame();
  }, [updateGame, isGameDownloading, lastPacket?.gameId]);

  useEffect(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const shopDetailsPromise = window.electron
      .getGameShopDetails(objectId, shop, steamLanguage)
      .then((result) => {
        if (abortController.signal.aborted) return;

        setShopDetails(result);

        if (
          result?.content_descriptors?.ids?.includes(
            SteamContentDescriptor.AdultOnlySexualContent
          ) &&
          !userPreferences?.disableNsfwAlert
        ) {
          setHasNSFWContentBlocked(true);
        }

        if (result?.assets) {
          setIsLoading(false);
        }
      });

    const englishShopDetailsPromise = shouldFetchEnglishFallback
      ? window.electron
          .getGameShopDetails(objectId, shop, "english")
          .then((result) => {
            if (abortController.signal.aborted) return;
            setEnglishShopDetails(result);
          })
          .catch(() => {
            if (!abortController.signal.aborted) {
              setEnglishShopDetails(null);
            }
          })
      : Promise.resolve();

    if (shop !== "custom") {
      window.electron.getGameStats(objectId, shop).then((result) => {
        if (abortController.signal.aborted) return;
        setStats(result);
      });
    }

    const assetsPromise = window.electron.getGameAssets(objectId, shop);

    Promise.all([shopDetailsPromise, assetsPromise, englishShopDetailsPromise])
      .then(([_, assets]) => {
        if (!abortController.signal.aborted) {
          setGameAssets(assets);
        }

        if (assets) {
          if (abortController.signal.aborted) return;
          setShopDetails((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              assets,
            };
          });
          setEnglishShopDetails((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              assets,
            };
          });
        }
      })
      .finally(() => {
        if (abortController.signal.aborted) return;
        setIsLoading(false);
      });

    if (userDetails && shop !== "custom") {
      window.electron
        .getUnlockedAchievements(objectId, shop)
        .then((achievements) => {
          if (abortController.signal.aborted) return;
          setAchievements(achievements);
        })
        .catch(() => void 0);
    }
  }, [
    updateGame,
    dispatch,
    objectId,
    shop,
    baseLanguage,
    userDetails,
    userPreferences,
  ]);

  useEffect(() => {
    setAutoTranslatedDetails(null);
  }, [baseLanguage, objectId, shop]);

  useEffect(() => {
    if (baseLanguage !== "vi") {
      setAutoTranslatedDetails(null);
      return;
    }

    const sourceDetails = englishShopDetails ?? resolvedShopDetails;
    const localizedDetails = shopDetails ?? resolvedShopDetails;

    if (!sourceDetails) {
      setAutoTranslatedDetails(null);
      return;
    }

    const cacheKey = `${shop}:${objectId}:${baseLanguage}`;
    const cached = translationCacheRef.current.get(cacheKey);
    if (cached) {
      setAutoTranslatedDetails(cached);
      return;
    }

    let cancelled = false;

    const translateField = async (value?: string | null) => {
      if (!value) return "";
      const chunks = splitTextIntoChunks(value, 1800);
      if (!chunks.length) return "";

      const translatedChunks: string[] = [];
      for (const chunk of chunks) {
        const translated = await window.electron
          .translateText(chunk, baseLanguage, "en")
          .then((result) => result ?? "")
          .catch(() => "");
        if (!translated) return "";
        translatedChunks.push(translated);
      }

      return formatTranslatedHtml(translatedChunks.join(" "));
    };

    const translateRequirements = async (
      localized?: { minimum?: string; recommended?: string } | null,
      english?: { minimum?: string; recommended?: string } | null
    ): Promise<TranslatedRequirements | undefined> => {
      if (!english) return undefined;
      const result: TranslatedRequirements = {};

      if (shouldTranslateField(localized?.minimum, english.minimum)) {
        result.minimum = await translateField(english.minimum);
      }

      if (shouldTranslateField(localized?.recommended, english.recommended)) {
        result.recommended = await translateField(english.recommended);
      }

      return result;
    };

    const run = async () => {
      const translated: AutoTranslatedDetails = {};

      if (
        shouldTranslateField(
          localizedDetails?.short_description,
          sourceDetails.short_description
        )
      ) {
        translated.short_description = await translateField(
          sourceDetails.short_description
        );
      }

      if (
        shouldTranslateField(
          localizedDetails?.about_the_game,
          sourceDetails.about_the_game
        )
      ) {
        translated.about_the_game = await translateField(
          sourceDetails.about_the_game
        );
      }

      if (
        shouldTranslateField(
          localizedDetails?.detailed_description,
          sourceDetails.detailed_description
        )
      ) {
        translated.detailed_description = await translateField(
          sourceDetails.detailed_description
        );
      }

      translated.pc_requirements = await translateRequirements(
        localizedDetails?.pc_requirements,
        sourceDetails.pc_requirements
      );
      translated.mac_requirements = await translateRequirements(
        localizedDetails?.mac_requirements,
        sourceDetails.mac_requirements
      );
      translated.linux_requirements = await translateRequirements(
        localizedDetails?.linux_requirements,
        sourceDetails.linux_requirements
      );

      if (cancelled) return;

      const hasTranslations = Object.values(translated).some((value) => {
        if (!value) return false;
        if (typeof value === "string") return Boolean(value);
        return Boolean(value.minimum || value.recommended);
      });

      if (!hasTranslations) {
        setAutoTranslatedDetails(null);
        return;
      }

      translationCacheRef.current.set(cacheKey, translated);
      setAutoTranslatedDetails(translated);
    };

    run().catch(() => {
      if (!cancelled) {
        setAutoTranslatedDetails(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    baseLanguage,
    englishShopDetails,
    objectId,
    resolvedShopDetails,
    shop,
    shopDetails,
  ]);

  useEffect(() => {
    setGameAssets(null);
    setShopDetails(null);
    setEnglishShopDetails(null);
    setGame(null);
    setIsLoading(true);
    setIsGameRunning(false);
    setAchievements(null);
    setGameOptionsInitialCategory("general");
    dispatch(setHeaderTitle(gameTitle));
  }, [objectId, gameTitle, dispatch]);

  useEffect(() => {
    const state =
      (location && (location.state as Record<string, unknown>)) || {};
    if (state.openRepacks) {
      setShowRepacksModal(true);
      try {
        window.history.replaceState({}, document.title, location.pathname);
      } catch (e) {
        console.error(e);
      }
    }
  }, [location]);

  useEffect(() => {
    if (game?.title) {
      dispatch(setHeaderTitle(game.title));
    }
  }, [game?.title, dispatch]);

  useEffect(() => {
    const unsubscribe = window.electron.onGamesRunning((gamesIds) => {
      const updatedIsGameRunning =
        !!game?.id &&
        !!gamesIds.find((gameRunning) => gameRunning.id == game.id);

      if (isGameRunning != updatedIsGameRunning) {
        updateGame();
      }

      setIsGameRunning(updatedIsGameRunning);
    });

    return () => {
      unsubscribe();
    };
  }, [game?.id, isGameRunning, updateGame]);

  useEffect(() => {
    const unsubscribe = window.electron.onLibraryBatchComplete(() => {
      updateGame();
    });

    return () => {
      unsubscribe();
    };
  }, [updateGame]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        if (detail.objectId && detail.objectId === objectId) {
          setShowRepacksModal(true);
        }
      } catch (e) {
        void e;
      }
    };

    window.addEventListener("hydra:openRepacks", handler as EventListener);

    return () => {
      window.removeEventListener("hydra:openRepacks", handler as EventListener);
    };
  }, [objectId]);

  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail || {};
        if (detail.objectId && detail.objectId === objectId) {
          setGameOptionsInitialCategory("general");
          setShowGameOptionsModal(true);
        }
      } catch (e) {
        void e;
      }
    };

    window.addEventListener("hydra:openGameOptions", handler as EventListener);

    return () => {
      window.removeEventListener(
        "hydra:openGameOptions",
        handler as EventListener
      );
    };
  }, [objectId]);

  useEffect(() => {
    const state =
      (location && (location.state as Record<string, unknown>)) || {};
    if (state.openGameOptions) {
      setGameOptionsInitialCategory("general");
      setShowGameOptionsModal(true);

      try {
        window.history.replaceState({}, document.title, location.pathname);
      } catch (_e) {
        void _e;
      }
    }
  }, [location]);

  useEffect(() => {
    const unsubscribe = window.electron.onUpdateAchievements(
      objectId,
      shop,
      (achievements) => {
        if (!userDetails) return;
        setAchievements(achievements);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [objectId, shop, userDetails]);

  useEffect(() => {
    if (shop === "custom") return;

    const fetchDownloadSources = async () => {
      try {
        const sourcesRaw = (await levelDBService.values(
          "downloadSources"
        )) as DownloadSource[];
        const sources = orderBy(sourcesRaw, "createdAt", "desc");

        const params = {
          take: 100,
          skip: 0,
          downloadSourceIds: sources.map((source) => source.id),
        };

        const downloads = await window.electron.hydraApi.get<GameRepack[]>(
          `/games/${shop}/${objectId}/download-sources`,
          {
            params,
            needsAuth: false,
          }
        );

        setRepacks(downloads);
      } catch (error) {
        console.error("Failed to fetch download sources:", error);
      }
    };

    fetchDownloadSources();
  }, [shop, objectId]);

  const getDownloadsPath = async () => {
    if (userPreferences?.downloadsPath) return userPreferences.downloadsPath;
    return window.electron.getDefaultDownloadsPath();
  };

  const selectGameExecutable = async () => {
    const downloadsPath = await getDownloadsPath();

    return window.electron
      .showOpenDialog({
        properties: ["openFile"],
        defaultPath: downloadsPath,
        filters: [
          {
            name: "Game executable",
            extensions: ["exe", "lnk"],
          },
        ],
      })
      .then(({ filePaths }) => {
        if (filePaths && filePaths.length > 0) {
          return filePaths[0];
        }

        return null;
      });
  };

  return (
    <Provider
      value={{
        game,
        gameAssets,
        shopDetails: resolvedShopDetailsWithAutoTranslation,
        shop,
        repacks,
        gameTitle,
        isGameRunning,
        isLoading,
        objectId,
        showGameOptionsModal,
        gameOptionsInitialCategory,
        showRepacksModal,
        stats,
        achievements,
        hasNSFWContentBlocked,
        lastDownloadedOption: null,
        setHasNSFWContentBlocked,
        selectGameExecutable,
        updateGame,
        setShowRepacksModal,
        setShowGameOptionsModal,
        setGameOptionsInitialCategory,
      }}
    >
      {children}
    </Provider>
  );
}
