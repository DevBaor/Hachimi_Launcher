import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import { useNavigate } from "react-router-dom";
import {
  DownloadIcon,
  PeopleIcon,
  StarIcon,
  FileDirectoryIcon,
} from "@primer/octicons-react";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";

import { Button, GameCard, Hero } from "@renderer/components";
import type {
  CatalogueSearchResult,
  DownloadSource,
  GameStats,
  ShopAssets,
  ShopDetails,
  Steam250Game,
} from "@types";

import flameIconAnimated from "@renderer/assets/icons/flame-animated.gif";
import starsIconAnimated from "@renderer/assets/icons/stars-animated.gif";

import {
  buildGameDetailsPath,
  buildLocaleCacheKey,
  getBaseLanguage,
  getSteamLanguage,
} from "@renderer/helpers";
import { CatalogueCategory } from "@shared";
import "./home.scss";
import { useAppDispatch, useAppSelector, useFormat } from "@renderer/hooks";
import { useCatalogue } from "@renderer/hooks/use-catalogue";
import { setFilters } from "@renderer/features";

const homeCatalogueCache = new Map<string, ShopAssets[]>();
const communityDetailsCache = new Map<string, ShopDetails | null>();
const communityStatsCache = new Map<string, GameStats | null>();
const communityStorageCache = new Map<string, string | null>();
const FEATURE_ROTATE_MS = 12000;

const parsePlainDescription = (value?: string | null) =>
  value
    ?.replaceAll(/<[^>]+>/g, " ")
    ?.replaceAll("&nbsp;", " ")
    ?.replaceAll(/\s+/g, " ")
    ?.trim() ?? "";

const VIETNAMESE_DIACRITICS =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const looksVietnamese = (value?: string | null) =>
  VIETNAMESE_DIACRITICS.test(parsePlainDescription(value));

const extractStorageRequirement = (details?: ShopDetails | null) => {
  if (!details) return null;

  const sources = [
    details.pc_requirements?.recommended,
    details.pc_requirements?.minimum,
    details.linux_requirements?.recommended,
    details.linux_requirements?.minimum,
    details.mac_requirements?.recommended,
    details.mac_requirements?.minimum,
  ]
    .filter(Boolean)
    .map((value) => parsePlainDescription(value ?? ""))
    .join(" ");

  const match =
    sources.match(
      /(Storage|Hard\s*Drive|Disk\s*Space|SSD|HDD|Required\s*Space|Dung\s*lượng|Ổ\s*cứng)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?\s*(?:GB|TB|MB))/i
    ) ??
    sources.match(
      /([0-9]+(?:\.[0-9]+)?\s*(?:GB|TB|MB)).{0,24}(storage|disk|space)/i
    );

  if (match) {
    const value = match[2] ?? match[1];
    return value?.toUpperCase() ?? null;
  }

  return null;
};

const parseSizeToBytes = (value: string) => {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*(TB|GB|MB)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toUpperCase();
  const multiplier =
    unit === "TB" ? 1024 ** 4 : unit === "GB" ? 1024 ** 3 : 1024 ** 2;
  return amount * multiplier;
};

const pickLargestFileSize = (sizes: string[]): string | null => {
  let bestValue: string | null = null;
  let bestBytes = 0;

  sizes.forEach((size) => {
    const bytes = parseSizeToBytes(size);
    if (bytes === null) return;
    if (!bestValue || bytes > bestBytes) {
      bestValue = size;
      bestBytes = bytes;
    }
  });

  return bestValue;
};

export default function Home() {
  const { t, i18n } = useTranslation("home");
  const navigate = useNavigate();
  const baseLanguage = getBaseLanguage(i18n.resolvedLanguage ?? i18n.language);
  const steamLanguage =
    baseLanguage === "vi" ? "english" : getSteamLanguage(baseLanguage);
  const todayLabel = useMemo(() => {
    const locale = baseLanguage === "vi" ? "vi-VN" : "en-US";
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date());
  }, [baseLanguage]);

  const { downloadSources } = useCatalogue();
  const { steamGenres, steamUserTags } = useAppSelector(
    (state) => state.catalogueSearch
  );
  const { numberFormatter } = useFormat();
  const dispatch = useAppDispatch();

  const [isLoading, setIsLoading] = useState(false);
  const [randomGame, setRandomGame] = useState<Steam250Game | null>(null);
  const [communityFeatured, setCommunityFeatured] = useState<{
    game: ShopAssets;
    description: string;
    genres: string[];
    releaseYear: string | null;
    releaseDate: string | null;
    hasTrailer: boolean;
    storage: string | null;
  } | null>(null);
  const [communityStats, setCommunityStats] = useState<GameStats | null>(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [communityGenreCards, setCommunityGenreCards] = useState<
    {
      name: string;
      value: string;
      count: number | null;
      imageUrl: string | null;
    }[]
  >([]);
  const [topDownloads, setTopDownloads] = useState<
    { game: ShopAssets; downloads: number | null }[]
  >([]);
  const lastGenreCountKeyRef = useRef<string | null>(null);

  const [catalogue, setCatalogue] = useState<
    Record<CatalogueCategory, ShopAssets[]>
  >({
    [CatalogueCategory.Hot]: [],
    [CatalogueCategory.Weekly]: [],
    [CatalogueCategory.Achievements]: [],
  });

  const fetchCatalogueForCategory = useCallback(
    async (category: CatalogueCategory, downloadSourceIds: string[]) => {
      const cacheKey = buildLocaleCacheKey(baseLanguage, category);
      const cachedCatalogue = homeCatalogueCache.get(cacheKey);

      if (cachedCatalogue) {
        return cachedCatalogue;
      }

      const params = {
        take: 12,
        skip: 0,
        language: baseLanguage,
        downloadSourceIds,
      };

      const categoryCatalogue = await window.electron.hydraApi.get<
        ShopAssets[]
      >(`/catalogue/${category}`, {
        params,
        needsAuth: false,
      });

      homeCatalogueCache.set(cacheKey, categoryCatalogue);
      return categoryCatalogue;
    },
    [baseLanguage]
  );

  const loadCatalogue = useCallback(async () => {
    try {
      setIsLoading(true);

      const sources = (await levelDBService.values(
        "downloadSources"
      )) as DownloadSource[];
      const downloadSources = orderBy(sources, "createdAt", "desc");
      const downloadSourceIds = downloadSources.map((source) => source.id);

      const [hot, weekly, achievements] = await Promise.all([
        fetchCatalogueForCategory(CatalogueCategory.Hot, downloadSourceIds),
        fetchCatalogueForCategory(CatalogueCategory.Weekly, downloadSourceIds),
        fetchCatalogueForCategory(
          CatalogueCategory.Achievements,
          downloadSourceIds
        ),
      ]);

      const hotKeys = new Set(
        (hot ?? []).map((game) => `${game.shop}:${game.objectId}`)
      );
      const communityPool = new Map<string, ShopAssets>();
      [...(weekly ?? []), ...(achievements ?? [])].forEach((game) => {
        const key = `${game.shop}:${game.objectId}`;
        if (!hotKeys.has(key) && !communityPool.has(key)) {
          communityPool.set(key, game);
        }
      });

      let communityFavorites = orderBy(
        Array.from(communityPool.values()),
        (game) => game.downloadSources?.length ?? 0,
        "desc"
      ).slice(0, 12);

      if (communityFavorites.length < 12) {
        const fallbackPool = new Map<string, ShopAssets>();
        [...(weekly ?? []), ...(hot ?? []), ...(achievements ?? [])].forEach(
          (game) => {
            const key = `${game.shop}:${game.objectId}`;
            if (
              !communityFavorites.some(
                (item) => `${item.shop}:${item.objectId}` === key
              ) &&
              !fallbackPool.has(key)
            ) {
              fallbackPool.set(key, game);
            }
          }
        );

        communityFavorites = communityFavorites.concat(
          Array.from(fallbackPool.values()).slice(
            0,
            12 - communityFavorites.length
          )
        );
      }

      setCatalogue({
        [CatalogueCategory.Hot]: hot ?? [],
        [CatalogueCategory.Weekly]: weekly ?? [],
        [CatalogueCategory.Achievements]: communityFavorites,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchCatalogueForCategory]);

  const genreNameMap = useMemo(() => {
    if (!steamGenres["en"] || !steamGenres[baseLanguage]) return null;

    const mapped = new Map<string, string>();
    steamGenres["en"].forEach((english, index) => {
      mapped.set(english, steamGenres[baseLanguage]?.[index] || english);
    });
    return mapped;
  }, [steamGenres, baseLanguage]);

  const genreValueMap = useMemo(() => {
    if (!steamGenres["en"] || !steamGenres[baseLanguage]) return null;

    const mapped = new Map<string, string>();
    steamGenres[baseLanguage].forEach((localized, index) => {
      const english = steamGenres["en"]?.[index];
      if (english) {
        mapped.set(localized, english);
      }
    });
    return mapped;
  }, [steamGenres, baseLanguage]);

  const localizeGenreName = useCallback(
    (name: string) => genreNameMap?.get(name) || name,
    [genreNameMap]
  );

  const getGenreCount = useCallback(
    (localizedName: string, englishName: string) => {
      const localizedTags = steamUserTags[baseLanguage];
      if (localizedTags && localizedTags[localizedName] !== undefined) {
        return localizedTags[localizedName] ?? null;
      }

      const englishTags = steamUserTags["en"];
      if (englishTags && englishTags[englishName] !== undefined) {
        return englishTags[englishName] ?? null;
      }

      return null;
    },
    [steamUserTags, baseLanguage]
  );

  const getCommunityDetails = useCallback(
    async (game: ShopAssets) => {
      const cacheKey = `${game.shop}:${game.objectId}:${steamLanguage}`;
      if (communityDetailsCache.has(cacheKey)) {
        return communityDetailsCache.get(cacheKey) ?? null;
      }

      const details = await window.electron
        .getGameShopDetails(game.objectId, game.shop, steamLanguage)
        .catch(() => null);
      communityDetailsCache.set(cacheKey, details ?? null);
      return details ?? null;
    },
    [steamLanguage]
  );

  const getCommunityStats = useCallback(async (game: ShopAssets) => {
    const cacheKey = `${game.shop}:${game.objectId}`;
    if (communityStatsCache.has(cacheKey)) {
      return communityStatsCache.get(cacheKey) ?? null;
    }

    const stats = await window.electron
      .getGameStats(game.objectId, game.shop)
      .catch(() => null);
    communityStatsCache.set(cacheKey, stats ?? null);
    return stats ?? null;
  }, []);

  const getRandomGame = useCallback(() => {
    window.electron.getRandomGame().then((game) => {
      if (game) setRandomGame(game);
    });
  }, []);

  const handleRandomizerClick = () => {
    if (randomGame) {
      navigate(
        buildGameDetailsPath(
          { ...randomGame, shop: "steam" },
          {
            fromRandomizer: "1",
          }
        )
      );
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadCatalogue();
    getRandomGame();
  }, [loadCatalogue, getRandomGame, baseLanguage]);

  const hotPicks = catalogue[CatalogueCategory.Hot].slice(0, 5);
  const communityGames = catalogue[CatalogueCategory.Achievements];
  const topDownloadItems =
    topDownloads.length > 0
      ? topDownloads
      : hotPicks.map((game) => ({ game, downloads: null }));

  useEffect(() => {
    if (!hotPicks.length) {
      setTopDownloads([]);
      return;
    }

    let cancelled = false;
    const loadTopDownloads = async () => {
      const statsList = await Promise.all(
        hotPicks.map(async (game) => {
          const stats = await getCommunityStats(game);
          return {
            game,
            downloads: stats?.downloadCount ?? null,
          };
        })
      );

      const sorted = statsList
        .slice()
        .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));

      if (!cancelled) {
        setTopDownloads(sorted);
      }
    };

    loadTopDownloads();

    return () => {
      cancelled = true;
    };
  }, [hotPicks, getCommunityStats]);

  useEffect(() => {
    if (!communityGames.length) {
      setFeaturedIndex(0);
      return;
    }

    setFeaturedIndex((current) =>
      current >= communityGames.length ? 0 : current
    );

    const interval = window.setInterval(() => {
      setFeaturedIndex((current) =>
        communityGames.length ? (current + 1) % communityGames.length : 0
      );
    }, FEATURE_ROTATE_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [communityGames.length]);

  useEffect(() => {
    if (!communityGames.length) {
      setCommunityFeatured(null);
      setCommunityStats(null);
      setCommunityGenreCards([]);
      return;
    }

    let cancelled = false;
    const featuredGame = communityGames[featuredIndex] ?? communityGames[0];

    const loadFeatured = async () => {
      const details = await getCommunityDetails(featuredGame);
      let description = parsePlainDescription(
        details?.short_description ||
          details?.about_the_game ||
          details?.detailed_description
      );

      if (
        baseLanguage === "vi" &&
        description &&
        !looksVietnamese(description)
      ) {
        const translate = window.electron?.translateText;
        if (typeof translate === "function") {
          const translated = await translate(description, "vi", "en").catch(
            () => ""
          );
          if (translated) {
            description = parsePlainDescription(translated);
          }
        }
      }

      const genres = (details?.genres || [])
        .map((genre) => localizeGenreName(genre.name))
        .filter(Boolean)
        .slice(0, 3);
      const releaseDate = details?.release_date?.date ?? null;
      const releaseYear = releaseDate?.match(/(19|20)\d{2}/)?.[0] ?? null;
      const hasTrailer = Boolean(details?.movies?.length);
      const stats = await getCommunityStats(featuredGame);
      const storageKey = `${featuredGame.shop}:${featuredGame.objectId}`;
      let storage = communityStorageCache.get(storageKey) ?? null;

      if (!storage) {
        storage = extractStorageRequirement(details);
      }

      if (!storage) {
        try {
          const downloadSourceIds = orderBy(
            downloadSources,
            "createdAt",
            "desc"
          ).map((source) => source.id);

          const repacks = await window.electron.hydraApi.get<
            { fileSize: string | null }[]
          >(
            `/games/${featuredGame.shop}/${featuredGame.objectId}/download-sources`,
            {
              params: {
                take: 25,
                skip: 0,
                ...(downloadSourceIds.length ? { downloadSourceIds } : {}),
              },
              needsAuth: false,
            }
          );

          const sizes = (repacks ?? [])
            .map((repack) => repack.fileSize)
            .filter((size): size is string => Boolean(size));
          storage = pickLargestFileSize(sizes);
        } catch {
          storage = null;
        }
      }

      communityStorageCache.set(storageKey, storage);

      if (!cancelled) {
        setCommunityFeatured({
          game: featuredGame,
          description,
          genres,
          releaseYear,
          releaseDate,
          hasTrailer,
          storage,
        });
        setCommunityStats(stats);
      }
    };

    const loadGenres = async () => {
      const steamSamples = communityGames.filter(
        (game) => game.shop === "steam"
      );
      const samples = (
        steamSamples.length ? steamSamples : communityGames
      ).slice(0, 12);
      const detailsList = await Promise.all(
        samples.map(async (game) => ({
          game,
          details: await getCommunityDetails(game),
        }))
      );
      const genreCounts = new Map<string, number>();
      detailsList.forEach(({ game, details }) => {
        const fallbackGenres = (game as { genres?: string[] }).genres ?? [];
        const rawGenres =
          details?.genres?.map((genre) => genre.name) ?? fallbackGenres;
        rawGenres.forEach((name) => {
          if (!name) return;
          const englishName = genreValueMap?.get(name) ?? name;
          genreCounts.set(englishName, (genreCounts.get(englishName) || 0) + 1);
        });
      });

      const ranked = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name]) => {
          const localizedName = localizeGenreName(name);
          const resolvedCount = getGenreCount(localizedName, name);
          const imageCandidate = detailsList.find(
            ({ game, details }) =>
              details?.genres?.some(
                (g) => g.name === name || genreValueMap?.get(g.name) === name
              ) || ((game as { genres?: string[] }).genres ?? []).includes(name)
          )?.game;
          const imageUrl =
            imageCandidate?.libraryImageUrl ??
            imageCandidate?.coverImageUrl ??
            imageCandidate?.libraryHeroImageUrl ??
            null;

          return {
            name: localizedName,
            value: name,
            count: resolvedCount,
            imageUrl,
          };
        });

      if (!cancelled) {
        if (ranked.length) {
          setCommunityGenreCards(ranked);
        } else {
          const englishGenres = steamGenres["en"] ?? [
            "Action",
            "Adventure",
            "Open World",
            "Horror",
            "RPG",
            "Indie",
          ];
          const localizedGenres = steamGenres[baseLanguage] ?? englishGenres;

          const fallback = englishGenres.slice(0, 6).map((name, index) => {
            const imageCandidate = communityGames[index];
            const imageUrl =
              imageCandidate?.libraryImageUrl ??
              imageCandidate?.coverImageUrl ??
              imageCandidate?.libraryHeroImageUrl ??
              null;
            const localizedName = localizedGenres[index] ?? name;
            return {
              name: localizedName,
              value: name,
              count: getGenreCount(localizedName, name),
              imageUrl,
            };
          });
          setCommunityGenreCards(fallback);
        }
      }
    };

    loadFeatured();
    loadGenres();

    return () => {
      cancelled = true;
    };
  }, [
    communityGames,
    featuredIndex,
    baseLanguage,
    getCommunityDetails,
    getCommunityStats,
    localizeGenreName,
    getGenreCount,
    genreValueMap,
    steamGenres,
    downloadSources,
  ]);

  const genreCountKey = useMemo(() => {
    const sourceKey = orderBy(downloadSources, "createdAt", "desc")
      .map((source) => source.id)
      .sort()
      .join("|");
    const genreKey = communityGenreCards.map((card) => card.value).join("|");
    return `${baseLanguage}::${sourceKey}::${genreKey}`;
  }, [baseLanguage, downloadSources, communityGenreCards]);

  useEffect(() => {
    if (!communityGenreCards.length) return;
    const shouldRefresh = lastGenreCountKeyRef.current !== genreCountKey;
    if (
      !shouldRefresh &&
      !communityGenreCards.some((card) => card.count === null)
    ) {
      return;
    }

    lastGenreCountKeyRef.current = genreCountKey;

    let cancelled = false;
    const loadGenreCounts = async () => {
      try {
        const baseFilters = {
          title: "",
          downloadSourceFingerprints: [],
          tags: [],
          publishers: [],
          genres: [],
          developers: [],
          protondbSupportBadges: [],
          deckCompatibility: [],
        };

        const downloadSourceIds = orderBy(
          downloadSources,
          "createdAt",
          "desc"
        ).map((source) => source.id);

        const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
          new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(() => {
              reject(new Error("timeout"));
            }, ms);

            promise.then(
              (value) => {
                window.clearTimeout(timer);
                resolve(value);
              },
              (error) => {
                window.clearTimeout(timer);
                reject(error);
              }
            );
          });

        const fetchPreview = async (
          genreValue: string,
          ids: string[]
        ): Promise<{ count: number; imageUrl: string | null }> => {
          const response = await withTimeout(
            window.electron.hydraApi.post<{
              edges: CatalogueSearchResult[];
              count: number;
            }>("/catalogue/search", {
              data: {
                ...baseFilters,
                genres: [genreValue],
                language: "en",
                take: 1,
                skip: 0,
                ...(ids.length ? { downloadSourceIds: ids } : {}),
              },
              needsAuth: false,
            }),
            7000
          );
          const firstEdge = response?.edges?.[0];
          return {
            count: response?.count ?? 0,
            imageUrl: firstEdge?.libraryImageUrl ?? null,
          };
        };

        const results = await Promise.all(
          communityGenreCards.map(async (card) => {
            let count: number | null = card.count ?? null;
            let imageUrl = card.imageUrl ?? null;

            try {
              const preview = await fetchPreview(card.value, downloadSourceIds);
              if (count === null) {
                count = preview.count ?? 0;
              }
              if (preview.imageUrl) {
                imageUrl = preview.imageUrl;
              }

              if (
                (!preview.imageUrl || preview.count === 0) &&
                downloadSourceIds.length
              ) {
                const fallbackPreview = await fetchPreview(card.value, []);
                if (count === null) {
                  count = fallbackPreview.count ?? count ?? 0;
                }
                if (fallbackPreview.imageUrl) {
                  imageUrl = fallbackPreview.imageUrl;
                }
              }
            } catch (error) {
              console.error("Failed to fetch genre count", error);
            }

            return {
              ...card,
              count: count ?? 0,
              imageUrl,
            };
          })
        );

        if (!cancelled) {
          setCommunityGenreCards(results);
        }
      } catch {
        // Ignore count errors and keep placeholders
      }
    };

    loadGenreCounts();

    return () => {
      cancelled = true;
    };
  }, [communityGenreCards, baseLanguage, downloadSources]);

  const genreAccentColors = [
    "#3e62c0",
    "#16b195",
    "#f59e0b",
    "#ef4444",
    "#22c55e",
    "#0ea5e9",
  ];

  const handleGenreClick = (genreValue: string) => {
    dispatch(
      setFilters({
        title: "",
        downloadSourceFingerprints: [],
        tags: [],
        publishers: [],
        genres: [genreValue],
        developers: [],
        protondbSupportBadges: [],
        deckCompatibility: [],
      })
    );
    navigate("/catalogue");
  };

  return (
    <SkeletonTheme baseColor="#1c1c1c" highlightColor="#444">
      <section className="home__content">
        <section className="home__masthead">
          <div className="home__masthead-copy">
            <span className="home__eyebrow">{t("home_eyebrow")}</span>
            <h1 className="home__headline">{t("home_headline")}</h1>
            <p className="home__subtitle">{t("home_subtitle")}</p>
          </div>

          <Button
            onClick={handleRandomizerClick}
            theme="outline"
            disabled={!randomGame}
            className="home__random-button"
          >
            <div className="home__icon-wrapper">
              <img
                src={starsIconAnimated}
                alt=""
                className="home__stars-icon"
              />
            </div>
            {t("surprise_me")}
          </Button>
        </section>

        <section className="home__showcase">
          <div className="home__hero-shell">
            <Hero />
          </div>

          <aside className="home__showcase-aside">
            <div className="home__showcase-header">
              <span className="home__showcase-title">
                {t("home_spotlight_title")}
              </span>
              <span className="home__showcase-subtitle">
                {t("home_spotlight_subtitle")}
              </span>
            </div>

            <ul className="home__showcase-list">
              {topDownloadItems.map(({ game, downloads }, index) => (
                <li key={`${game.shop}-${game.objectId}`}>
                  <button
                    type="button"
                    className="home__showcase-item"
                    onClick={() => navigate(buildGameDetailsPath(game))}
                  >
                    <span className="home__showcase-rank">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {game.libraryImageUrl || game.coverImageUrl ? (
                      <img
                        src={game.libraryImageUrl ?? game.coverImageUrl ?? ""}
                        alt={game.title}
                        className="home__showcase-thumb"
                        loading="lazy"
                      />
                    ) : (
                      <div className="home__showcase-thumb home__showcase-thumb--empty" />
                    )}

                    <div className="home__showcase-info">
                      <span className="home__showcase-name">{game.title}</span>
                      <span className="home__showcase-meta">
                        {(game as { genres?: string[] }).genres
                          ?.slice(0, 2)
                          .join(", ") || t("home_spotlight_fallback")}
                      </span>
                    </div>

                    <span className="home__showcase-chip">
                      {downloads !== null
                        ? t("home_downloads", {
                            count: downloads,
                          })
                        : t("home_downloads_unavailable")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="home__rows">
          {[CatalogueCategory.Hot, CatalogueCategory.Weekly].map((category) => (
            <div className="home__row" key={category}>
              <div className="home__row-header">
                <h2 className="home__row-title">
                  {category === CatalogueCategory.Hot && (
                    <img
                      src={flameIconAnimated}
                      alt=""
                      className="home__row-icon"
                    />
                  )}
                  {t(category)}
                </h2>
              </div>

              <div className="home__row-track">
                {isLoading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <Skeleton
                        key={`${category}-skeleton-${index}`}
                        className="home__card-skeleton"
                      />
                    ))
                  : catalogue[category].map((result) => (
                      <GameCard
                        key={`${category}-${result.objectId}`}
                        game={result}
                        onClick={() => navigate(buildGameDetailsPath(result))}
                      />
                    ))}
              </div>
            </div>
          ))}
        </section>

        <section className="home__community">
          <div className="home__community-categories">
            {communityGenreCards.map((genre, index) => (
              <button
                type="button"
                key={`${genre.name}-${index}`}
                className="home__community-category"
                style={{
                  ["--accent" as string]:
                    genreAccentColors[index % genreAccentColors.length],
                }}
                onClick={() => handleGenreClick(genre.value)}
              >
                <div className="home__community-category-info">
                  <span className="home__community-category-name">
                    {genre.name}
                  </span>
                  <span className="home__community-category-count">
                    {genre.count === null
                      ? t("home_genre_count_loading")
                      : t("home_genre_count", {
                          count: genre.count,
                        })}
                  </span>
                </div>
                <div className="home__community-category-thumb">
                  {genre.imageUrl ? (
                    <img src={genre.imageUrl} alt={genre.name} loading="lazy" />
                  ) : (
                    <span className="home__community-category-mark" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {communityFeatured && (
            <div className="home__community-feature">
              <div className="home__community-image">
                {communityFeatured.game.libraryHeroImageUrl ||
                communityFeatured.game.coverImageUrl ||
                communityFeatured.game.libraryImageUrl ? (
                  <img
                    src={
                      communityFeatured.game.libraryHeroImageUrl ??
                      communityFeatured.game.coverImageUrl ??
                      communityFeatured.game.libraryImageUrl ??
                      ""
                    }
                    alt={communityFeatured.game.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="home__community-image-placeholder" />
                )}
              </div>

              <div className="home__community-info">
                <div className="home__community-badges">
                  <span className="home__community-badge">
                    {t("home_community_badge")}
                  </span>
                  <span className="home__community-today">{todayLabel}</span>
                  {communityFeatured.releaseDate && (
                    <span className="home__community-year">
                      {communityFeatured.releaseDate}
                    </span>
                  )}
                  {communityFeatured.hasTrailer && (
                    <span className="home__community-trailer">
                      {t("home_community_trailer")}
                    </span>
                  )}
                </div>

                <h3 className="home__community-title">
                  {communityFeatured.game.title}
                </h3>

                <div className="home__community-tags">
                  {communityFeatured.genres.map((genre) => (
                    <span key={genre} className="home__community-tag">
                      {genre}
                    </span>
                  ))}
                </div>

                <p className="home__community-description">
                  {communityFeatured.description ||
                    t("home_community_no_description")}
                </p>

                <div className="home__community-stats">
                  <div className="home__community-stat">
                    <DownloadIcon size={14} />
                    <span className="home__community-stat-value">
                      {communityStats
                        ? numberFormatter.format(communityStats.downloadCount)
                        : "—"}
                    </span>
                    <span className="home__community-stat-label">
                      {t("home_community_stats_downloads")}
                    </span>
                  </div>
                  <div className="home__community-stat">
                    <PeopleIcon size={14} />
                    <span className="home__community-stat-value">
                      {communityStats
                        ? numberFormatter.format(communityStats.playerCount)
                        : "—"}
                    </span>
                    <span className="home__community-stat-label">
                      {t("home_community_stats_players")}
                    </span>
                  </div>
                  <div className="home__community-stat">
                    <StarIcon size={14} />
                    <span className="home__community-stat-value">
                      {communityStats?.averageScore
                        ? communityStats.averageScore.toFixed(1)
                        : "—"}
                    </span>
                    <span className="home__community-stat-label">
                      {t("home_community_stats_score")}
                    </span>
                  </div>
                  <div className="home__community-stat">
                    <StarIcon size={14} />
                    <span className="home__community-stat-value">
                      {communityStats
                        ? numberFormatter.format(communityStats.reviewCount)
                        : "—"}
                    </span>
                    <span className="home__community-stat-label">
                      {t("home_community_stats_reviews")}
                    </span>
                  </div>
                  <div className="home__community-stat">
                    <FileDirectoryIcon size={14} />
                    <span className="home__community-stat-value">
                      {communityFeatured.storage ??
                        t("home_community_storage_unknown")}
                    </span>
                    <span className="home__community-stat-label">
                      {t("home_community_stats_storage")}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() =>
                    navigate(buildGameDetailsPath(communityFeatured.game))
                  }
                  theme="primary"
                  className="home__community-button"
                >
                  {t("home_community_button")}
                </Button>
              </div>
            </div>
          )}
        </section>
      </section>
    </SkeletonTheme>
  );
}
