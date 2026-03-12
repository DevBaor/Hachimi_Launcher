import {
  AchievementCustomNotificationPosition,
  AchievementNotificationInfo,
} from "@types";
import cn from "classnames";
import HachimiIcon from "@renderer/assets/icons/hachimi.png";
import { EyeClosedIcon } from "@primer/octicons-react";
import Ellipses from "@renderer/assets/icons/ellipses.png";
import "./achievement-notification.scss";

interface AchievementNotificationProps {
  position: AchievementCustomNotificationPosition;
  achievement: AchievementNotificationInfo;
  isClosing: boolean;
}

const TEST_ACHIEVEMENT_ICON_URL = "https://cdn.losbroxas.org/favicon.svg";

export function AchievementNotificationItem({
  position,
  achievement,
  isClosing,
}: Readonly<AchievementNotificationProps>) {
  const baseClassName = "achievement-notification";
  const shouldUseHachimiIcon =
    !achievement.iconUrl || achievement.iconUrl === TEST_ACHIEVEMENT_ICON_URL;
  const iconSrc = shouldUseHachimiIcon ? HachimiIcon : achievement.iconUrl;

  return (
    <div
      className={cn("achievement-notification", {
        [`${baseClassName}--${position}`]: true,
        [`${baseClassName}--closing`]: isClosing,
        [`${baseClassName}--hidden`]: achievement.isHidden,
        [`${baseClassName}--rare`]: achievement.isRare,
        [`${baseClassName}--platinum`]: achievement.isPlatinum,
      })}
    >
      {achievement.points !== undefined && (
        <div className="achievement-notification__chip">
          <img
            src={HachimiIcon}
            alt="Hachimi"
            className="achievement-notification__chip__icon"
          />
          <span className="achievement-notification__chip__label">
            +{achievement.points}
          </span>
        </div>
      )}

      <div className="achievement-notification__outer-container">
        <div className="achievement-notification__container">
          <div className="achievement-notification__content">
            <img
              src={iconSrc}
              alt={achievement.title}
              className="achievement-notification__icon"
            />
            <div className="achievement-notification__text-container">
              <p className="achievement-notification__title">
                {achievement.isHidden && (
                  <span className="achievement-notification__hidden-icon">
                    <EyeClosedIcon size={16} />
                  </span>
                )}
                {achievement.title}
              </p>
              <p className="achievement-notification__description">
                {achievement.description}
              </p>
            </div>
          </div>

          <div className="achievement-notification__additional-overlay">
            <div className="achievement-notification__dark-overlay"></div>
            <img
              className="achievement-notification__ellipses-overlay"
              src={Ellipses}
              alt=""
            />
            <div className="achievement-notification__trophy-overlay"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
