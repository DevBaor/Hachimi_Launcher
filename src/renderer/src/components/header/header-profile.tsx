import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "@primer/octicons-react";
import { useTranslation } from "react-i18next";

import { Avatar } from "@renderer/components/avatar/avatar";
import { useUserDetails } from "@renderer/hooks";
import { AuthPage } from "@shared";
import { logger } from "@renderer/logger";
import type { NotificationCountResponse } from "@types";

import "./header-profile.scss";

export function HeaderProfile() {
  const navigate = useNavigate();
  const { t } = useTranslation("sidebar");
  const { userDetails } = useUserDetails();

  const [notificationCount, setNotificationCount] = useState(0);
  const apiNotificationCountRef = useRef(0);
  const hasFetchedInitialCount = useRef(false);

  const fetchLocalNotificationCount = useCallback(async () => {
    try {
      const localCount = await window.electron.getLocalNotificationsCount();
      setNotificationCount(localCount + apiNotificationCountRef.current);
    } catch (error) {
      logger.error("Failed to fetch local notification count", error);
    }
  }, []);

  const fetchApiNotificationCount = useCallback(async () => {
    try {
      const response =
        await window.electron.hydraApi.get<NotificationCountResponse>(
          "/profile/notifications/count",
          { needsAuth: true }
        );
      apiNotificationCountRef.current = response.count;
    } catch {
      // Ignore API errors
    }
    fetchLocalNotificationCount();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    fetchLocalNotificationCount();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    if (userDetails && !hasFetchedInitialCount.current) {
      hasFetchedInitialCount.current = true;
      fetchApiNotificationCount();
    } else if (!userDetails) {
      hasFetchedInitialCount.current = false;
      apiNotificationCountRef.current = 0;
      fetchLocalNotificationCount();
    }
  }, [userDetails, fetchApiNotificationCount, fetchLocalNotificationCount]);

  useEffect(() => {
    const unsubscribe = window.electron.onLocalNotificationCreated(() => {
      fetchLocalNotificationCount();
    });

    return () => unsubscribe();
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    const handleNotificationsChange = () => {
      fetchLocalNotificationCount();
    };

    window.addEventListener("notificationsChanged", handleNotificationsChange);
    return () => {
      window.removeEventListener(
        "notificationsChanged",
        handleNotificationsChange
      );
    };
  }, [fetchLocalNotificationCount]);

  useEffect(() => {
    const unsubscribe = window.electron.onSyncNotificationCount(
      (notification) => {
        apiNotificationCountRef.current = notification.notificationCount;
        fetchLocalNotificationCount();
      }
    );

    return () => unsubscribe();
  }, [fetchLocalNotificationCount]);

  const handleProfileClick = () => {
    if (!userDetails) {
      window.electron.openAuthWindow(AuthPage.SignIn);
      return;
    }

    navigate(`/profile/${userDetails.id}`);
  };

  const isGuest = !userDetails;

  return (
    <div className="header-profile">
      <button
        type="button"
        className={`header-profile__button ${
          isGuest ? "header-profile__button--guest" : ""
        }`}
        onClick={handleProfileClick}
      >
        <Avatar
          size={28}
          src={userDetails?.profileImageUrl}
          alt={userDetails?.displayName}
        />

        {!isGuest && (
          <div className="header-profile__info">
            <span className="header-profile__title">
              {userDetails?.displayName}
            </span>
          </div>
        )}

        {isGuest && (
          <span className="header-profile__guest-label">{t("sign_in")}</span>
        )}
      </button>

      <button
        type="button"
        className="header-profile__notification-button"
        onClick={() => navigate("/notifications")}
        title={t("notifications")}
      >
        {notificationCount > 0 && (
          <span className="header-profile__notification-badge">
            {notificationCount > 99 ? "99+" : notificationCount}
          </span>
        )}
        <BellIcon size={16} />
      </button>
    </div>
  );
}
