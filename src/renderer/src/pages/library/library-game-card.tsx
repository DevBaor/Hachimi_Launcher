import { LibraryGame } from "@types";
import { useGameCard } from "@renderer/hooks";
import { memo, useEffect, useState } from "react";
import {
  ClockIcon,
  AlertFillIcon,
  TrophyIcon,
  ImageIcon,
  TrashIcon,
  CheckIcon,
} from "@primer/octicons-react";
import { useTranslation } from "react-i18next";
import { useGameActions } from "@renderer/components/game-context-menu/use-game-actions";
import cn from "classnames";
import "./library-game-card.scss";

interface LibraryGameCardProps {
  game: LibraryGame;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onContextMenu: (
    game: LibraryGame,
    position: { x: number; y: number }
  ) => void;
  onShowTooltip?: (gameId: string) => void;
  onHideTooltip?: () => void;
  imageLoading?: "lazy" | "eager";
  imageFetchPriority?: "high" | "low" | "auto";
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (game: LibraryGame) => void;
}

export const LibraryGameCard = memo(function LibraryGameCard({
  game,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  imageLoading = "lazy",
  imageFetchPriority = "auto",
}: Readonly<LibraryGameCardProps>) {
  const { t } = useTranslation("game_details");
  const {
    formatPlayTime,
    handleCardClick: openGame,
    handleContextMenuClick,
  } = useGameCard(game, onContextMenu);
  const { handleRemoveFromLibrary } = useGameActions(game);

  const resolveImageSource = (imageUrl: string | null | undefined): string => {
    if (!imageUrl) return "";

    const trimmedImageUrl = imageUrl.trim();
    if (!trimmedImageUrl) return "";

    if (
      trimmedImageUrl.startsWith("http://") ||
      trimmedImageUrl.startsWith("https://") ||
      trimmedImageUrl.startsWith("data:") ||
      trimmedImageUrl.startsWith("blob:")
    ) {
      return trimmedImageUrl;
    }

    if (trimmedImageUrl.startsWith("local:")) {
      const normalizedLocalPath = trimmedImageUrl
        .slice("local:".length)
        .replaceAll("\\", "/");
      return `local:${normalizedLocalPath}`;
    }

    const normalizedPath = trimmedImageUrl.replaceAll("\\", "/");
    if (/^[A-Za-z]:\//.test(normalizedPath) || normalizedPath.startsWith("/")) {
      return `local:${normalizedPath}`;
    }

    return normalizedPath;
  };

  const coverImage = resolveImageSource(
    game.customIconUrl ??
      game.coverImageUrl ??
      game.libraryImageUrl ??
      game.iconUrl
  );

  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    setImageError(false);
  }, [coverImage]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selectionMode) {
        onToggleSelect?.(game);
      } else {
        openGame();
      }
    }
  };

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect?.(game);
      return;
    }
    openGame();
  };

  const handleRemoveClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    await handleRemoveFromLibrary();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn("library-game-card__wrapper", {
        "library-game-card__wrapper--selecting": selectionMode,
        "library-game-card__wrapper--selected": isSelected,
      })}
      title={game.title}
      onClick={handleCardClick}
      onContextMenu={handleContextMenuClick}
    >
      {selectionMode && (
        <div className="library-game-card__select">
          {isSelected && <CheckIcon size={12} />}
        </div>
      )}
      <div className="library-game-card__overlay">
        <div className="library-game-card__top-section">
          <div className="library-game-card__playtime">
            {game.hasManuallyUpdatedPlaytime ? (
              <AlertFillIcon
                size={11}
                className="library-game-card__manual-playtime"
              />
            ) : (
              <ClockIcon size={11} />
            )}
            <span className="library-game-card__playtime-long">
              {formatPlayTime(game.playTimeInMilliseconds)}
            </span>
            <span className="library-game-card__playtime-short">
              {formatPlayTime(game.playTimeInMilliseconds, true)}
            </span>
          </div>
        </div>

        {(game.achievementCount ?? 0) > 0 && (
          <div className="library-game-card__achievements">
            <div className="library-game-card__achievement-header">
              <div className="library-game-card__achievements-gap">
                <TrophyIcon
                  size={13}
                  className="library-game-card__achievement-trophy"
                />
                <span className="library-game-card__achievement-count">
                  {game.unlockedAchievementCount ?? 0} /{" "}
                  {game.achievementCount ?? 0}
                </span>
              </div>
              <span className="library-game-card__achievement-percentage">
                {Math.round(
                  ((game.unlockedAchievementCount ?? 0) /
                    (game.achievementCount ?? 1)) *
                    100
                )}
                %
              </span>
            </div>
            <div className="library-game-card__achievement-progress">
              <div
                className="library-game-card__achievement-bar"
                style={{
                  width: `${((game.unlockedAchievementCount ?? 0) / (game.achievementCount ?? 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="library-game-card__action-button library-game-card__action-button--remove"
        title={t("remove_from_library")}
        aria-label={t("remove_from_library")}
        onClick={handleRemoveClick}
      >
        <TrashIcon size={16} />
      </button>

      {imageError || !coverImage ? (
        <div className="library-game-card__cover-placeholder">
          <ImageIcon size={48} />
        </div>
      ) : (
        <img
          src={coverImage}
          alt={game.title}
          className="library-game-card__game-image"
          loading={imageLoading}
          fetchPriority={imageFetchPriority}
          decoding="async"
          onError={() => setImageError(true)}
        />
      )}
    </div>
  );
});
