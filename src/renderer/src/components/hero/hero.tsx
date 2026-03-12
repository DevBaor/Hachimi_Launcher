import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { DownloadSource, ShopAssets, TrendingGame } from "@types";
import { useTranslation } from "react-i18next";
import Skeleton from "react-loading-skeleton";
import {
  buildGameDetailsPath,
  buildLocaleCacheKey,
  getBaseLanguage,
  getSteamLanguage,
} from "@renderer/helpers";
import { levelDBService } from "@renderer/services/leveldb.service";
import { orderBy } from "lodash-es";
import { CatalogueCategory } from "@shared";
import "./hero.scss";

const HERO_AUTO_SLIDE_MS = 5000;
const NEW_RELEASE_DAYS_THRESHOLD = 120;

type HeroBadgeType = "hot" | "popular" | "new";
type HeroSlide = TrendingGame & {
  badgeType: HeroBadgeType;
};
const translatedDescriptionCache = new Map<string, string>();
const heroSlidesCache = new Map<string, HeroSlide[]>();
const heroSlidesInFlight = new Map<string, Promise<HeroSlide[]>>();

const parsePlainDescription = (value?: string | null) =>
  value
    ?.replaceAll(/<[^>]+>/g, " ")
    ?.replaceAll("&nbsp;", " ")
    ?.replaceAll(/\s+/g, " ")
    ?.trim() ?? "";

const normalizeDescriptionForComparison = (value?: string | null) =>
  parsePlainDescription(value).toLocaleLowerCase();

const VIETNAMESE_DIACRITICS =
  /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const looksVietnamese = (value?: string | null) =>
  VIETNAMESE_DIACRITICS.test(parsePlainDescription(value));

const toHeroExcerpt = (value?: string | null) => {
  const plainText = parsePlainDescription(value);
  if (!plainText) return "";

  const sentences = plainText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const excerpt = (sentences.slice(0, 2).join(" ") || plainText).trim();
  if (excerpt.length <= 260) return excerpt;

  return `${excerpt.slice(0, 257).trimEnd()}...`;
};

const pickHeroDescription = (...values: Array<string | null | undefined>) =>
  values.map((value) => toHeroExcerpt(value)).find(Boolean) ?? "";

const buildUri = (game: {
  objectId: string;
  shop: TrendingGame["shop"];
  title: string;
}) =>
  buildGameDetailsPath({
    objectId: game.objectId,
    shop: game.shop,
    title: game.title,
  });

const mergeUniqueGames = (games: TrendingGame[]) => {
  const gamesMap = new Map<string, TrendingGame>();

  games.forEach((game) => {
    const key = `${game.shop}:${game.objectId}`;
    if (!gamesMap.has(key)) {
      gamesMap.set(key, {
        ...game,
        uri: game.uri || buildUri(game),
      });
    }
  });

  return Array.from(gamesMap.values());
};

const toTrendingGame = (asset: ShopAssets): TrendingGame => ({
  ...asset,
  description: null,
  uri: buildUri(asset),
});

const translateDescription = async (
  cacheKey: string,
  text: string,
  targetLanguage: string
) => {
  const existing = translatedDescriptionCache.get(cacheKey);
  if (existing) return existing;

  const translated = await window.electron
    .translateText(text, targetLanguage, "en")
    .then((value) => parsePlainDescription(value))
    .catch(() => "");

  if (translated) {
    translatedDescriptionCache.set(cacheKey, translated);
  }

  return translated;
};

const parseReleaseDate = (value?: string | null) => {
  if (!value) return null;

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  const yearMatch = value.match(/(19|20)\d{2}/);
  if (!yearMatch) return null;

  const year = Number(yearMatch[0]);
  return new Date(year, 0, 1);
};

const isRecentRelease = (value?: string | null) => {
  const releaseDate = parseReleaseDate(value);
  if (!releaseDate) return false;

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - NEW_RELEASE_DAYS_THRESHOLD);

  return releaseDate >= thresholdDate;
};

export function Hero() {
  const [featuredGames, setFeaturedGames] = useState<HeroSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const { i18n, t } = useTranslation("home");
  const navigate = useNavigate();

  useEffect(() => {
    setIsLoading(true);
    setFeaturedGames([]);
    setActiveIndex(0);

    const language = getBaseLanguage(i18n.resolvedLanguage ?? i18n.language);
    const steamLanguage =
      language === "vi" ? "english" : getSteamLanguage(language);
    const heroCacheKey = buildLocaleCacheKey(language, "hero-slides");
    let cancelled = false;

    const loadGames = async () => {
      const cachedSlides = heroSlidesCache.get(heroCacheKey);
      if (cachedSlides) {
        if (!cancelled) {
          setFeaturedGames(cachedSlides);
          setActiveIndex(0);
          setIsLoading(false);
        }
        return;
      }

      try {
        const loadSlides =
          heroSlidesInFlight.get(heroCacheKey) ??
          (async () => {
            const featured = await window.electron.hydraApi
              .get<TrendingGame[]>("/catalogue/featured", {
                params: { language },
                needsAuth: false,
              })
              .catch(() => []);

            const sources = (await levelDBService.values(
              "downloadSources"
            )) as DownloadSource[];
            const downloadSources = orderBy(sources, "createdAt", "desc");

            const params = {
              take: 8,
              skip: 0,
              language,
              downloadSourceIds: downloadSources.map((source) => source.id),
            };

            const [hot, weekly, achievements] = await Promise.all([
              window.electron.hydraApi
                .get<ShopAssets[]>(`/catalogue/${CatalogueCategory.Hot}`, {
                  params,
                  needsAuth: false,
                })
                .catch(() => []),
              window.electron.hydraApi
                .get<ShopAssets[]>(`/catalogue/${CatalogueCategory.Weekly}`, {
                  params,
                  needsAuth: false,
                })
                .catch(() => []),
              window.electron.hydraApi
                .get<ShopAssets[]>(
                  `/catalogue/${CatalogueCategory.Achievements}`,
                  {
                    params,
                    needsAuth: false,
                  }
                )
                .catch(() => []),
            ]);

            const hotKeys = new Set(
              hot.map((game) => `${game.shop}:${game.objectId}`)
            );
            const weeklyKeys = new Set(
              weekly.map((game) => `${game.shop}:${game.objectId}`)
            );

            let games = featured;

            if (games.length < 3) {
              const fallbackGames = [...hot, ...weekly, ...achievements].map(
                toTrendingGame
              );

              games = mergeUniqueGames([...featured, ...fallbackGames]);
            } else {
              games = mergeUniqueGames(featured);
            }

            const selectedGames = games.slice(0, 7);

            return Promise.all(
              selectedGames.map(async (game) => {
                const gameKey = `${game.shop}:${game.objectId}`;
                const isVietnameseUI = language === "vi";
                const fallbackBadge: HeroBadgeType = weeklyKeys.has(gameKey)
                  ? "popular"
                  : hotKeys.has(gameKey)
                    ? "hot"
                    : "popular";
                const featuredDescription = parsePlainDescription(
                  game.description
                );

                try {
                  const localizedDetails =
                    await window.electron.getGameShopDetails(
                      game.objectId,
                      game.shop,
                      steamLanguage
                    );

                  const hasWeeklySignal = weeklyKeys.has(gameKey);
                  const hasHotSignal = hotKeys.has(gameKey);
                  const isNew = isRecentRelease(
                    localizedDetails?.release_date?.date
                  );
                  const localizedDescription = pickHeroDescription(
                    localizedDetails?.short_description,
                    localizedDetails?.about_the_game,
                    localizedDetails?.detailed_description,
                    featuredDescription
                  );

                  let englishDescription = "";
                  if (steamLanguage !== "english") {
                    const englishDetails =
                      await window.electron.getGameShopDetails(
                        game.objectId,
                        game.shop,
                        "english"
                      );
                    englishDescription = pickHeroDescription(
                      englishDetails?.short_description,
                      englishDetails?.about_the_game,
                      englishDetails?.detailed_description
                    );
                  }

                  const localizedLooksLikeEnglishFallback =
                    Boolean(localizedDescription) &&
                    Boolean(englishDescription) &&
                    normalizeDescriptionForComparison(localizedDescription) ===
                      normalizeDescriptionForComparison(englishDescription);

                  const fallbackEnglishDescription =
                    englishDescription ||
                    localizedDescription ||
                    featuredDescription;
                  const localizedLooksEnglish =
                    Boolean(fallbackEnglishDescription) &&
                    (!localizedDescription ||
                      localizedLooksLikeEnglishFallback ||
                      !looksVietnamese(localizedDescription));

                  let translatedEnglishDescription = "";
                  if (
                    isVietnameseUI &&
                    fallbackEnglishDescription &&
                    localizedLooksEnglish
                  ) {
                    translatedEnglishDescription = await translateDescription(
                      `${gameKey}:vi`,
                      fallbackEnglishDescription,
                      "vi"
                    );
                  }

                  const description = isVietnameseUI
                    ? translatedEnglishDescription ||
                      (localizedLooksEnglish ? "" : localizedDescription) ||
                      ""
                    : localizedDescription ||
                      englishDescription ||
                      featuredDescription;

                  const badgeType: HeroBadgeType = isNew
                    ? "new"
                    : hasWeeklySignal
                      ? "popular"
                      : hasHotSignal
                        ? "hot"
                        : fallbackBadge;

                  return {
                    ...game,
                    description,
                    badgeType,
                  };
                } catch {
                  let fallbackDescription =
                    pickHeroDescription(featuredDescription);
                  if (isVietnameseUI && fallbackDescription) {
                    fallbackDescription =
                      (await translateDescription(
                        `${gameKey}:vi:featured`,
                        fallbackDescription,
                        "vi"
                      )) || fallbackDescription;
                  }

                  return {
                    ...game,
                    description: fallbackDescription,
                    badgeType: fallbackBadge,
                  };
                }
              })
            );
          })();

        heroSlidesInFlight.set(heroCacheKey, loadSlides);
        const hydratedGames = await loadSlides.finally(() => {
          heroSlidesInFlight.delete(heroCacheKey);
        });
        heroSlidesCache.set(heroCacheKey, hydratedGames);

        if (cancelled) return;
        setFeaturedGames(hydratedGames);
        setActiveIndex(0);
      } catch {
        if (cancelled) return;
        setFeaturedGames([]);
        setActiveIndex(0);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadGames();

    return () => {
      cancelled = true;
    };
  }, [i18n.language, t]);

  useEffect(() => {
    if (featuredGames.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % featuredGames.length);
    }, HERO_AUTO_SLIDE_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [featuredGames.length]);

  const badgeLabelByType = useMemo(
    () => ({
      hot: t("hero_hot_badge"),
      popular: t("hero_popular_badge"),
      new: t("hero_new_badge"),
    }),
    [t]
  );

  const openGameDetails = (game: TrendingGame) => {
    navigate(game.uri || buildUri(game));
  };

  if (isLoading) {
    return <Skeleton className="hero" />;
  }

  if (!featuredGames.length) {
    return null;
  }

  return (
    <section className="hero">
      {featuredGames.map((game, index) => {
        const isActive = index === activeIndex;
        const description =
          parsePlainDescription(game.description) || t("hero_no_description");

        return (
          <button
            type="button"
            onClick={() => openGameDetails(game)}
            className={`hero__slide ${isActive ? "hero__slide--active" : ""}`}
            key={`${game.objectId}-${index}`}
            tabIndex={isActive ? 0 : -1}
            aria-hidden={!isActive}
          >
            <div className="hero__backdrop">
              <img
                src={
                  game.libraryHeroImageUrl ??
                  game.coverImageUrl ??
                  game.libraryImageUrl ??
                  undefined
                }
                alt={game.title}
                className="hero__media"
              />

              <div className="hero__content">
                <span className="hero__badge">
                  {badgeLabelByType[game.badgeType]}
                </span>

                {game.logoImageUrl && (
                  <img
                    src={game.logoImageUrl}
                    alt={game.title}
                    loading={isActive ? "eager" : "lazy"}
                    className="hero__logo"
                  />
                )}

                <h2 className="hero__title">{game.title}</h2>
                <p className="hero__description">{description}</p>
              </div>
            </div>
          </button>
        );
      })}

      {featuredGames.length > 1 && (
        <div className="hero__controls" aria-label={t("hero_slide_controls")}>
          {featuredGames.map((game, index) => (
            <button
              key={`${game.objectId}-indicator`}
              type="button"
              className={`hero__indicator ${
                index === activeIndex ? "hero__indicator--active" : ""
              }`}
              onClick={() => setActiveIndex(index)}
              title={t("hero_open_slide", {
                index: index + 1,
                title: game.title,
              })}
              aria-label={t("hero_open_slide", {
                index: index + 1,
                title: game.title,
              })}
              aria-current={index === activeIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}
