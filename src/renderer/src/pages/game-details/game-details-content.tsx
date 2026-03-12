import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { PencilIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { HeroPanel } from "./hero";
import { DescriptionHeader } from "./description-header/description-header";
import { GallerySlider } from "./gallery-slider/gallery-slider";
import { Sidebar } from "./sidebar/sidebar";
import { GameReviews } from "./game-reviews";
import { GameLogo } from "./game-logo";

import { cloudSyncContext, gameDetailsContext } from "@renderer/context";

import cloudIconAnimated from "@renderer/assets/icons/cloud-animated.gif";
import { useLibrary, useToast, useUserDetails } from "@renderer/hooks";
import "./game-details.scss";
import "./hero.scss";

const processMediaElements = (document: Document) => {
  const $images = Array.from(document.querySelectorAll("img"));
  $images.forEach(($image) => {
    $image.loading = "lazy";
    $image.removeAttribute("width");
    $image.removeAttribute("height");
    $image.removeAttribute("style");
    $image.style.maxWidth = "100%";
    $image.style.width = "auto";
    $image.style.height = "auto";
    $image.style.boxSizing = "border-box";
  });

  // Handle videos the same way
  const $videos = Array.from(document.querySelectorAll("video"));
  $videos.forEach(($video) => {
    $video.removeAttribute("width");
    $video.removeAttribute("height");
    $video.removeAttribute("style");
    $video.style.maxWidth = "100%";
    $video.style.width = "auto";
    $video.style.height = "auto";
    $video.style.boxSizing = "border-box";
  });
};

const getImageWithCustomPriority = (
  customUrl: string | null | undefined,
  originalUrl: string | null | undefined,
  fallbackUrl?: string | null | undefined
) => {
  return customUrl || originalUrl || fallbackUrl || "";
};

const resolveImageSource = (imageUrl: string | null | undefined): string => {
  if (!imageUrl) return "";

  const trimmedImageUrl = imageUrl.trim();
  if (!trimmedImageUrl) return "";

  if (
    trimmedImageUrl.startsWith("http://") ||
    trimmedImageUrl.startsWith("https://") ||
    trimmedImageUrl.startsWith("data:") ||
    trimmedImageUrl.startsWith("blob:") ||
    trimmedImageUrl.startsWith("local:")
  ) {
    return trimmedImageUrl;
  }

  const normalizedPath = trimmedImageUrl.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith("/")) {
    return `local:${normalizedPath}`;
  }

  return normalizedPath;
};

export function GameDetailsContent() {
  const { t } = useTranslation("game_details");
  const [searchParams] = useSearchParams();
  const reviewsRef = useRef<HTMLDivElement>(null);

  const {
    objectId,
    shopDetails,
    gameAssets,
    game,
    hasNSFWContentBlocked,
    shop,
    setShowGameOptionsModal,
    setGameOptionsInitialCategory,
  } = useContext(gameDetailsContext);

  const { userDetails, hasActiveSubscription } = useUserDetails();
  const { library } = useLibrary();
  const { showWarningToast } = useToast();

  const { getGameArtifacts } = useContext(cloudSyncContext);

  const aboutTheGame = useMemo(() => {
    const aboutTheGame =
      shopDetails?.about_the_game ||
      shopDetails?.detailed_description ||
      shopDetails?.short_description;

    if (aboutTheGame) {
      const document = new DOMParser().parseFromString(
        aboutTheGame,
        "text/html"
      );

      processMediaElements(document);

      return document.body.outerHTML;
    }

    if (game?.shop === "custom") {
      return "";
    }

    return shopDetails ? t("no_game_description") : t("no_shop_details");
  }, [shopDetails, t, game?.shop]);

  const [backdropOpacity, setBackdropOpacity] = useState(1);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [hasUserReviewed, setHasUserReviewed] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);

  // Check if the current game is in the user's library
  const isGameInLibrary = useMemo(() => {
    if (!library || !shop || !objectId) return false;
    return library.some(
      (libItem) => libItem.shop === shop && libItem.objectId === objectId
    );
  }, [library, shop, objectId]);

  useEffect(() => {
    setBackdropOpacity(1);
    setHeroImageError(false);
  }, [objectId]);

  const handleCloudSaveButtonClick = () => {
    if (!userDetails) {
      showWarningToast(
        t("sign_in_to_sync_title", { ns: "app" }),
        t("sign_in_to_sync_message", { ns: "app" })
      );
      return;
    }

    if (!hasActiveSubscription) {
      setGameOptionsInitialCategory("hydra_cloud");
      setShowGameOptionsModal(true);
      return;
    }

    setGameOptionsInitialCategory("hydra_cloud");
    setShowGameOptionsModal(true);
  };

  const handleEditGameClick = () => {
    setGameOptionsInitialCategory("assets");
    setShowGameOptionsModal(true);
  };

  useEffect(() => {
    getGameArtifacts();
  }, [getGameArtifacts]);

  // Scroll to reviews section if reviews=true in URL
  useEffect(() => {
    const shouldScrollToReviews = searchParams.get("reviews") === "true";
    if (shouldScrollToReviews && reviewsRef.current) {
      setTimeout(() => {
        reviewsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    }
  }, [searchParams, objectId]);

  const isCustomGame = game?.shop === "custom";

  const heroImage = isCustomGame
    ? game?.libraryHeroImageUrl || game?.iconUrl || ""
    : resolveImageSource(
        getImageWithCustomPriority(
          game?.customHeroImageUrl,
          shopDetails?.assets?.libraryHeroImageUrl ??
            gameAssets?.libraryHeroImageUrl ??
            game?.libraryHeroImageUrl,
          gameAssets?.coverImageUrl ??
            game?.coverImageUrl ??
            gameAssets?.libraryImageUrl ??
            game?.libraryImageUrl ??
            gameAssets?.iconUrl ??
            game?.iconUrl
        )
      );

  const hasHeroImage = Boolean(heroImage) && !heroImageError;

  return (
    <div
      className={`game-details__wrapper ${hasNSFWContentBlocked ? "game-details__wrapper--blurred" : ""}`}
    >
      <section className="game-details__container">
        <div className="game-details__hero">
          {hasHeroImage ? (
            <img
              src={heroImage}
              className="game-details__hero-image"
              alt={game?.title}
              onError={() => setHeroImageError(true)}
            />
          ) : (
            <div className="game-details__hero-image" aria-hidden="true" />
          )}

          <div
            className="game-details__hero-logo-backdrop"
            style={{ opacity: backdropOpacity }}
          >
            <div className="game-details__hero-content">
              <GameLogo
                game={game}
                gameAssets={gameAssets}
                shopDetails={shopDetails}
              />

              <div className="game-details__hero-buttons game-details__hero-buttons--right">
                {game && (
                  <button
                    type="button"
                    className="game-details__edit-custom-game-button"
                    onClick={handleEditGameClick}
                    title={t("edit_game_modal_button")}
                  >
                    <PencilIcon size={16} />
                  </button>
                )}

                {game?.shop !== "custom" && (
                  <button
                    type="button"
                    className="game-details__cloud-sync-button"
                    onClick={handleCloudSaveButtonClick}
                  >
                    <div className="game-details__cloud-icon-container">
                      <img
                        src={cloudIconAnimated}
                        alt=""
                        className="game-details__cloud-icon"
                      />
                    </div>
                    {t("cloud_save")}
                  </button>
                )}
              </div>
            </div>

            <div className="game-details__hero-panel">
              <HeroPanel />
            </div>
          </div>
        </div>

        <div className="game-details__description-container">
          <div className="game-details__description-content">
            <DescriptionHeader />
            <GallerySlider />

            <div
              dangerouslySetInnerHTML={{
                __html: aboutTheGame,
              }}
              className={`game-details__description ${
                isDescriptionExpanded
                  ? "game-details__description--expanded"
                  : "game-details__description--collapsed"
              }`}
            />

            {aboutTheGame && aboutTheGame.length > 500 && (
              <button
                type="button"
                className="game-details__description-toggle"
                onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              >
                {isDescriptionExpanded ? t("show_less") : t("show_more")}
              </button>
            )}

            {shop !== "custom" && shop && objectId && (
              <div ref={reviewsRef}>
                <GameReviews
                  shop={shop}
                  objectId={objectId}
                  game={game}
                  userDetailsId={userDetails?.id}
                  isGameInLibrary={isGameInLibrary}
                  hasUserReviewed={hasUserReviewed}
                  onUserReviewedChange={setHasUserReviewed}
                />
              </div>
            )}
          </div>

          {shop !== "custom" && <Sidebar />}
        </div>
      </section>
    </div>
  );
}
