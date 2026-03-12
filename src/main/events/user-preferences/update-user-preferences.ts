import { registerEvent } from "../register-event";

import type { UserPreferences } from "@types";
import i18next from "i18next";
import { db, levelKeys } from "@main/level";
import { patchUserProfile } from "../profile/update-profile";
import { DownloadManager, WindowManager } from "@main/services";
import { getBaseLanguage } from "@shared";

const updateUserPreferences = async (
  _event: Electron.IpcMainInvokeEvent,
  preferences: Partial<UserPreferences>
) => {
  const userPreferences = await db.get<string, UserPreferences | null>(
    levelKeys.userPreferences,
    { valueEncoding: "json" }
  );
  const nextLanguage = preferences.language
    ? getBaseLanguage(preferences.language)
    : undefined;

  if (nextLanguage) {
    await db.put<string, string>(levelKeys.language, nextLanguage, {
      valueEncoding: "utf8",
    });

    i18next.changeLanguage(nextLanguage);
    patchUserProfile({ language: nextLanguage }).catch(() => {});
    WindowManager.createSystemTray(nextLanguage).catch(() => {});
  }

  await db.put<string, UserPreferences>(
    levelKeys.userPreferences,
    {
      ...userPreferences,
      ...preferences,
      ...(nextLanguage ? { language: nextLanguage } : {}),
    },
    {
      valueEncoding: "json",
    }
  );

  if (Object.hasOwn(preferences, "maxDownloadSpeedBytesPerSecond")) {
    await DownloadManager.applyDownloadSpeedLimit(
      preferences.maxDownloadSpeedBytesPerSecond ?? null
    );
  }
};

registerEvent("updateUserPreferences", updateUserPreferences);
