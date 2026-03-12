import i18next from "i18next";
import { registerEvent } from "../register-event";
import { HydraApi, WindowManager } from "@main/services";
import { AuthPage } from "@shared";
import { db, levelKeys } from "@main/level";
import { getBaseLanguage } from "@shared";

const openAuthWindow = async (
  _event: Electron.IpcMainInvokeEvent,
  page: AuthPage
) => {
  const storedLanguage = await db
    .get<string, string>(levelKeys.language, { valueEncoding: "utf-8" })
    .catch(() => null);
  const language = getBaseLanguage(
    storedLanguage ?? i18next.resolvedLanguage ?? i18next.language ?? "en"
  );

  const searchParams = new URLSearchParams({
    lng: language,
    lang: language,
    locale: language,
  });

  if ([AuthPage.UpdateEmail, AuthPage.UpdatePassword].includes(page)) {
    const { accessToken } = await HydraApi.refreshToken().catch(() => {
      return { accessToken: "" };
    });
    searchParams.set("token", accessToken);
  }

  WindowManager.openAuthWindow(page, searchParams);
};

registerEvent("openAuthWindow", openAuthWindow);
