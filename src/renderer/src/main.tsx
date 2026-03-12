import ReactDOM from "react-dom/client";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { Provider } from "react-redux";
import { HashRouter, Route, Routes } from "react-router-dom";

import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/700.css";

import "react-loading-skeleton/dist/skeleton.css";
import "react-tooltip/dist/react-tooltip.css";

import { App } from "./app";

import { store } from "./store";

import resources from "@locales";

import { logger } from "./logger";
import { addCookieInterceptor } from "./cookies";
import * as Sentry from "@sentry/react";
import { levelDBService } from "./services/leveldb.service";
import Catalogue from "./pages/catalogue/catalogue";
import Home from "./pages/home/home";
import Downloads from "./pages/downloads/downloads";
import GameDetails from "./pages/game-details/game-details";
import Settings from "./pages/settings/settings";
import Profile from "./pages/profile/profile";
import Achievements from "./pages/achievements/achievements";
import ThemeEditor from "./pages/theme-editor/theme-editor";
import Library from "./pages/library/library";
import Notifications from "./pages/notifications/notifications";
import { AchievementNotification } from "./pages/achievements/notification/achievement-notification";
import GameLauncher from "./pages/game-launcher/game-launcher";
import { getBaseLanguage } from "@shared";

console.log = logger.log;

Sentry.init({
  dsn: import.meta.env.RENDERER_VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 0.5,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  release: "hachimi@" + (await window.electron.getVersion()),
});

const isStaging = await window.electron.isStaging();
addCookieInterceptor(isStaging);

const LANGUAGE_STORAGE_KEY = "hachimi-language";
const SPLASH_TEXTS_STORAGE_KEY = "hachimi-splash-texts";
const STARTUP_STATUS_KEYS = [
  "startup_loading_settings",
  "startup_loading_library",
  "startup_preparing_interface",
] as const;
const SPLASH_TEXT_KEYS = [...STARTUP_STATUS_KEYS, "startup_credit"] as const;
type SplashTextKey = (typeof SPLASH_TEXT_KEYS)[number];

const readCachedLanguage = () => {
  const cached = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return getBaseLanguage(cached);
};

const syncDocumentLanguage = (language: string) => {
  const normalizedLanguage = getBaseLanguage(language);
  document.documentElement.lang = normalizedLanguage;
  document.documentElement.dir = i18n.dir(normalizedLanguage);
};

const cacheSplashTexts = (language: string) => {
  const baseLanguage = getBaseLanguage(language);

  if (baseLanguage === "vi") return;

  const splashTexts = SPLASH_TEXT_KEYS.reduce(
    (acc, key) => {
      acc[key] = i18n.t(key, {
        ns: "app",
        lng: language,
        defaultValue: i18n.t(key, { ns: "app", lng: "en" }),
      });
      return acc;
    },
    {} as Record<SplashTextKey, string>
  );

  try {
    const current = JSON.parse(
      window.localStorage.getItem(SPLASH_TEXTS_STORAGE_KEY) || "{}"
    ) as Record<string, Record<SplashTextKey, string>>;

    current[language] = splashTexts;
    current[baseLanguage] = splashTexts;

    window.localStorage.setItem(
      SPLASH_TEXTS_STORAGE_KEY,
      JSON.stringify(current)
    );
  } catch {}

  window.__HACHIMI_BOOT_SPLASH__?.setLanguageTexts?.(
    language,
    splashTexts as Record<string, string>
  );
};

const persistLanguage = (language: string) => {
  const normalizedLanguage = getBaseLanguage(language);
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
  cacheSplashTexts(normalizedLanguage);
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: readCachedLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  })
  .then(async () => {
    const userPreferences = (await levelDBService.get(
      "userPreferences",
      null,
      "json"
    )) as { language?: string } | null;

    const preferredLanguage = getBaseLanguage(userPreferences?.language);

    if (i18n.language !== preferredLanguage) {
      await i18n.changeLanguage(preferredLanguage);
    }

    if (!userPreferences?.language) {
      window.electron.updateUserPreferences({ language: "en" });
    }

    syncDocumentLanguage(i18n.language);
    persistLanguage(i18n.language);
    i18n.on("languageChanged", (language) => {
      syncDocumentLanguage(language);
      persistLanguage(language);
    });
  });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Home />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/library" element={<Library />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/game/:shop/:objectId" element={<GameDetails />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/achievements" element={<Achievements />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>

        <Route path="/theme-editor" element={<ThemeEditor />} />
        <Route
          path="/achievement-notification"
          element={<AchievementNotification />}
        />
        <Route path="/game-launcher" element={<GameLauncher />} />
      </Routes>
    </HashRouter>
  </Provider>
);
