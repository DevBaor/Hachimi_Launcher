import {
  BrowserWindow,
  Menu,
  MenuItem,
  MenuItemConstructorOptions,
  Tray,
  app,
  nativeImage,
  screen,
  shell,
} from "electron";
import { is } from "@electron-toolkit/utils";
import { t } from "i18next";
import path from "node:path";
import icon from "@resources/icon.png?asset";
import trayIcon from "@resources/tray-icon.png?asset";
import { HydraApi } from "./hydra-api";
import UserAgent from "user-agents";
import { db, gamesSublevel, levelKeys } from "@main/level";
import { orderBy, slice } from "lodash-es";
import type {
  AchievementCustomNotificationPosition,
  ScreenState,
  UserPreferences,
} from "@types";
import { AuthPage, generateAchievementCustomNotificationTest } from "@shared";
import { isStaging } from "@main/constants";
import { logger } from "./logger";

export class WindowManager {
  public static mainWindow: Electron.BrowserWindow | null = null;
  public static notificationWindow: Electron.BrowserWindow | null = null;
  public static gameLauncherWindow: Electron.BrowserWindow | null = null;
  private static systemTray: Tray | null = null;
  private static systemTrayLanguage = "en";
  private static systemTrayListenersAttached = false;

  private static readonly editorWindows: Map<string, BrowserWindow> = new Map();
  private static readonly AUTH_WINDOW_TITLE = "Hachimi - Sign in";
  private static readonly AUTH_WINDOW_TITLE_VI = "Hachimi - Đăng nhập";

  private static getAuthBrandingScript() {
    const iconDataUrl = nativeImage.createFromPath(icon).toDataURL();
    const viAuthWindowTitle = "Hachimi - Đăng nhập";
    const viAuthTextMap: Record<string, string> = {
      "sign in": "Đăng nhập",
      "sign in to hachimi": "Đăng nhập vào Hachimi",
      "sign in to hydra": "Đăng nhập vào Hachimi",
      "welcome to hachimi!": "Chào mừng đến với Hachimi!",
      "welcome back!": "Chào mừng quay lại!",
      username: "Tên đăng nhập",
      "username or email": "Tên đăng nhập hoặc email",
      password: "Mật khẩu",
      "forgot your password?": "Quên mật khẩu?",
      "recover account": "Khôi phục tài khoản",
      "recover your password": "Khôi phục mật khẩu",
      "recover password": "Khôi phục mật khẩu",
      "recover using email": "Khôi phục bằng email",
      "recover using pin": "Khôi phục bằng PIN",
      "recover using pin or email": "Khôi phục bằng PIN hoặc email",
      "request recovery email": "Yêu cầu email khôi phục",
      "recovery pin": "Mã PIN khôi phục",
      "enter your pin": "Nhập mã PIN của bạn",
      "enter recovery pin": "Nhập mã PIN khôi phục",
      pin: "Mã PIN",
      "forgot your password? recover using pin or email":
        "Quên mật khẩu? Khôi phục bằng PIN hoặc email",
      "well send you an email with instructions to recover your account":
        "Chúng tôi sẽ gửi email hướng dẫn để khôi phục tài khoản của bạn",
      "we will send an email with instructions to recover your account":
        "Chúng tôi sẽ gửi email hướng dẫn để khôi phục tài khoản của bạn",
      "youll use the pin you received during registration to recover your account":
        "Bạn sẽ dùng mã PIN đã nhận khi đăng ký để khôi phục tài khoản",
      "the 6-digit pin you received during registration":
        "Mã PIN 6 chữ số bạn nhận được khi đăng ký",
      login: "Đăng nhập",
      register: "Đăng ký",
      "create an account": "Tạo tài khoản",
      "already have an account?": "Đã có tài khoản?",
      "dont have an account?": "Chưa có tài khoản?",
      "don't have an account?": "Chưa có tài khoản?",
      "confirm password": "Xác nhận mật khẩu",
      "confirm your password": "Xác nhận mật khẩu",
      "display name": "Tên hiển thị",
      "email address": "Địa chỉ email",
      email: "Email",
      send: "Gửi",
      check: "Kiểm tra",
      "you will use this name to sign in to hachimi":
        "Bạn sẽ dùng tên này để đăng nhập vào Hachimi",
      "add an optional email address for recovery":
        "Thêm email tùy chọn để khôi phục tài khoản",
      "enter the email address you used to create your account":
        "Nhập địa chỉ email bạn đã dùng để tạo tài khoản",
      "your password must be at least 8 characters":
        "Mật khẩu phải có ít nhất 8 ký tự",
      "i accept the terms of use and privacy policy":
        "Tôi đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư",
      "i accept the": "Tôi đồng ý với",
      "terms of use": "Điều khoản sử dụng",
      "privacy policy": "Chính sách quyền riêng tư",
      and: "và",
      "login to existing account": "Đăng nhập vào tài khoản hiện có",
      "back to sign in": "Quay lại đăng nhập",
      "disconnect previous sessions": "Đăng xuất các phiên trước",
      continue: "Tiếp tục",
      back: "Quay lại",
      verify: "Xác minh",
      "try again": "Thử lại",
      "send code": "Gửi mã",
      "enter code": "Nhập mã",
      "resend code": "Gửi lại mã",
      "update email": "Cập nhật email",
      "update password": "Cập nhật mật khẩu",
      "new password": "Mật khẩu mới",
      "current password": "Mật khẩu hiện tại",
      save: "Lưu",
      submit: "Xác nhận",
      "loading...": "Đang tải...",
      or: "HOẶC",
    };

    return `
      (() => {
        if (typeof window.__hachimiAuthBrandingApply === "function") {
          window.__hachimiAuthBrandingApply();
          return;
        }

        window.__hachimiAuthBrandingApplied = true;
        const brandName = "Hachimi";
        const iconDataUrl = ${JSON.stringify(iconDataUrl)};
        const viAuthWindowTitle = ${JSON.stringify(viAuthWindowTitle)};
        const viAuthTextMap = ${JSON.stringify(viAuthTextMap)};
        const viPhraseMap = [
          ["Welcome to Hachimi!", "Chào mừng đến với Hachimi!"],
          ["Username", "Tên đăng nhập"],
          ["Check", "Kiểm tra"],
          [
            "You will use this name to sign in to Hachimi",
            "Bạn sẽ dùng tên này để đăng nhập vào Hachimi",
          ],
          ["Email address", "Địa chỉ email"],
          [
            "Add an optional email address for recovery",
            "Thêm email tùy chọn để khôi phục tài khoản",
          ],
          [
            "Your password must be at least 8 characters",
            "Mật khẩu phải có ít nhất 8 ký tự",
          ],
          ["Confirm your password", "Xác nhận mật khẩu"],
          [
            "I accept the Terms of Use and Privacy Policy",
            "Tôi đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư",
          ],
          ["Login to existing account", "Đăng nhập vào tài khoản hiện có"],
          ["I accept the", "Tôi đồng ý với"],
          ["Terms of Use", "Điều khoản sử dụng"],
          ["Privacy Policy", "Chính sách quyền riêng tư"],
          ["Recover account", "Khôi phục tài khoản"],
          ["Recover your password", "Khôi phục mật khẩu"],
          ["Recover password", "Khôi phục mật khẩu"],
          ["Recover using email", "Khôi phục bằng email"],
          ["Recover using PIN", "Khôi phục bằng PIN"],
          ["Request recovery email", "Yêu cầu email khôi phục"],
          ["Recovery PIN", "Mã PIN khôi phục"],
          ["Enter your PIN", "Nhập mã PIN của bạn"],
          ["Enter recovery PIN", "Nhập mã PIN khôi phục"],
          [
            "We will send an email with instructions to recover your account",
            "Chúng tôi sẽ gửi email hướng dẫn để khôi phục tài khoản của bạn",
          ],
          [
            "Enter the email address you used to create your account",
            "Nhập địa chỉ email bạn đã dùng để tạo tài khoản",
          ],
          [
            "We'll send you an email with instructions to recover your account",
            "Chúng tôi sẽ gửi email hướng dẫn để khôi phục tài khoản của bạn",
          ],
          [
            "You'll use the PIN you received during registration to recover your account",
            "Bạn sẽ dùng mã PIN đã nhận khi đăng ký để khôi phục tài khoản",
          ],
          [
            "The 6-digit PIN you received during registration",
            "Mã PIN 6 chữ số bạn nhận được khi đăng ký",
          ],
          ["Back to sign in", "Quay lại đăng nhập"],
          ["Disconnect previous sessions", "Đăng xuất các phiên trước"],
          ["Try again", "Thử lại"],
        ];

        const normalizeText = (value) =>
          (value || "")
            .normalize("NFD")
            .replace(/[\\u0300-\\u036f]/g, "")
            .replace(/[’']/g, "")
            .replace(/\\s+/g, " ")
            .trim()
            .toLowerCase();

        const escapeRegExp = (value) =>
          value.replace(/[|\\\\{}()[\\]^$+*?.]/g, "\\\\$&");

        const getStoredLanguage = () => {
          try {
            return (
              sessionStorage.getItem("__hachimiAuthLanguage") ||
              localStorage.getItem("__hachimiAuthLanguage") ||
              ""
            )
              .toLowerCase()
              .trim();
          } catch {
            return "";
          }
        };

        const persistRequestedLanguage = (language) => {
          const normalized = (language || "").toLowerCase().trim();
          if (!normalized) return;

          try {
            sessionStorage.setItem("__hachimiAuthLanguage", normalized);
            localStorage.setItem("__hachimiAuthLanguage", normalized);
          } catch {
            // Ignore storage failures inside auth webview.
          }
        };

        const getRequestedLanguage = () => {
          try {
            const params = new URLSearchParams(window.location.search);
            const detectedLanguage = (
              params.get("lng") ||
              params.get("lang") ||
              params.get("locale") ||
              document.documentElement.lang ||
              ""
            )
              .toLowerCase()
              .trim();

            if (detectedLanguage) {
              persistRequestedLanguage(detectedLanguage);
              return detectedLanguage;
            }

            return getStoredLanguage();
          } catch {
            return getStoredLanguage();
          }
        };

        const isVietnameseAuth = getRequestedLanguage().startsWith("vi");

        const patchTitleAndFavicon = () => {
          document.title = isVietnameseAuth
            ? viAuthWindowTitle
            : "${this.AUTH_WINDOW_TITLE}";
          document.documentElement.lang = isVietnameseAuth ? "vi" : "en";

          const iconLinks = Array.from(
            document.querySelectorAll("link[rel*='icon']")
          );

          if (iconLinks.length === 0) {
            const link = document.createElement("link");
            link.rel = "icon";
            link.href = iconDataUrl;
            document.head?.appendChild(link);
          } else {
            iconLinks.forEach((link) => {
              link.href = iconDataUrl;
            });
          }
        };

        const patchHydraText = () => {
          const textNodes = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (tag === "script" || tag === "style" || tag === "noscript") {
                  return NodeFilter.FILTER_REJECT;
                }

                return /hydra/i.test(node.nodeValue || "")
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              },
            }
          );

          while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
          }

          textNodes.forEach((node) => {
            if (!node.nodeValue) return;
            node.nodeValue = node.nodeValue.replace(/hydra/gi, brandName);
          });

          const attributesToPatch = ["placeholder", "title", "aria-label", "alt"];
          const elements = Array.from(
            document.querySelectorAll(
              attributesToPatch.map((attr) => "[" + attr + "*='Hydra' i]").join(",")
            )
          );

          elements.forEach((element) => {
            attributesToPatch.forEach((attribute) => {
              const value = element.getAttribute(attribute);
              if (!value || !/hydra/i.test(value)) return;
              element.setAttribute(attribute, value.replace(/hydra/gi, brandName));
            });
          });
        };

        const patchVietnameseText = () => {
          if (!isVietnameseAuth || !document.body) return;

          const replaceIfMapped = (value) => {
            const translated = viAuthTextMap[normalizeText(value)];
            return translated || null;
          };

        const replaceByPhrase = (value) => {
          let output = value;
          [...viPhraseMap]
            .sort((a, b) => b[0].length - a[0].length)
            .forEach(([source, target]) => {
              if (!source || !target) return;
              output = output.replace(new RegExp(escapeRegExp(source), "gi"), target);
            });
          return output;
        };

        const replaceByValidationPattern = (value) => {
          let output = value;

          const rules = [
            [/^Username is required\\.?$/i, "Tên đăng nhập là bắt buộc."],
            [/^This field is required\\.?$/i, "Trường này là bắt buộc."],
            [/^Email address is required\\.?$/i, "Địa chỉ email là bắt buộc."],
            [/^Email is required\\.?$/i, "Email là bắt buộc."],
            [/^Password is required\\.?$/i, "Mật khẩu là bắt buộc."],
            [/^Confirm password is required\\.?$/i, "Xác nhận mật khẩu là bắt buộc."],
            [/^PIN is required\\.?$/i, "Mã PIN là bắt buộc."],
            [/^Code is required\\.?$/i, "Mã xác nhận là bắt buộc."],
            [/^Username must be at least (\\d+) characters\\.?$/i, "Tên đăng nhập phải có ít nhất $1 ký tự."],
            [/^Password must be at least (\\d+) characters\\.?$/i, "Mật khẩu phải có ít nhất $1 ký tự."],
            [/^PIN must be at least (\\d+) digits\\.?$/i, "Mã PIN phải có ít nhất $1 chữ số."],
            [/^Code must be at least (\\d+) digits\\.?$/i, "Mã xác nhận phải có ít nhất $1 chữ số."],
            [/^PIN must contain only numbers\\.?$/i, "Mã PIN chỉ được chứa số."],
            [/^Code must contain only numbers\\.?$/i, "Mã xác nhận chỉ được chứa số."],
            [/^Invalid email address\\.?$/i, "Địa chỉ email không hợp lệ."],
            [/^Invalid email\\.?$/i, "Email không hợp lệ."],
            [/^Passwords do not match\\.?$/i, "Mật khẩu xác nhận không khớp."],
            [/^PIN is invalid\\.?$/i, "Mã PIN không hợp lệ."],
            [/^Invalid PIN\\.?$/i, "Mã PIN không hợp lệ."],
            [/^Invalid code\\.?$/i, "Mã xác nhận không hợp lệ."],
            [/^Username is already taken\\.?$/i, "Tên đăng nhập đã được sử dụng."],
            [/^Username already exists\\.?$/i, "Tên đăng nhập đã tồn tại."],
            [/^Username is available\\.?$/i, "Tên đăng nhập có thể sử dụng."],
            [/^Please enter a valid PIN\\.?$/i, "Vui lòng nhập mã PIN hợp lệ."],
            [/^Please enter a valid email address\\.?$/i, "Vui lòng nhập địa chỉ email hợp lệ."],
          ];

          rules.forEach(([pattern, replacement]) => {
            output = output.replace(pattern, replacement);
          });

          return output;
        };

        const translateVietnameseValue = (value) => {
          const byPhrase = replaceByPhrase(value);
          const exact = replaceIfMapped(byPhrase) ?? byPhrase;
          return replaceByValidationPattern(exact);
        };

        const patchElementTextContent = () => {
          const elements = Array.from(
            document.querySelectorAll("button, a, label, p, span, div, h1, h2, h3")
          );

          elements.forEach((element) => {
            const children = Array.from(element.children ?? []);
            if (children.length > 0) return;

            const original = element.textContent;
            if (!original || !original.trim()) return;

            const translated = translateVietnameseValue(original);
            if (translated === original) return;

            element.textContent = translated;
          });
        };

          const textNodes = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName.toLowerCase();
                if (tag === "script" || tag === "style" || tag === "noscript") {
                  return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
              },
            }
          );

          while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
          }

          textNodes.forEach((node) => {
            if (!node.nodeValue) return;
            const original = node.nodeValue;
            let nextValue = translateVietnameseValue(original);

            if (nextValue !== original) {
              node.nodeValue = nextValue;
            }
          });

          const attributesToPatch = [
            "placeholder",
            "title",
            "aria-label",
            "alt",
            "value",
          ];
          const elements = Array.from(
            document.querySelectorAll(
              attributesToPatch.map((attr) => "[" + attr + "]").join(",")
            )
          );

          elements.forEach((element) => {
            attributesToPatch.forEach((attribute) => {
              const value = element.getAttribute(attribute);
              if (!value) return;

              const translated = translateVietnameseValue(value);
              if (translated === value) return;

              element.setAttribute(attribute, translated);
            });
          });

          patchElementTextContent();
        };

        const findAuthHeading = () => {
          const headings = Array.from(
            document.querySelectorAll("h1, h2, h3, [role='heading']")
          );

          return (
            headings.find((element) =>
              /(sign\\s*in|register|create\\s+an\\s+account|welcome|account|dang\\s*nhap|đăng\\s*nhập|dang\\s*ky|đăng\\s*ký|tai\\s*khoan|tài\\s*khoản)/i.test(
                element.textContent || ""
              )
            ) ?? headings.find((element) => /hachimi|hydra/i.test(element.textContent || ""))
          );
        };

        const patchLoginLogo = (heading) => {
          const replacement = document.createElement("img");
          replacement.id = "hachimi-auth-logo";
          replacement.src = iconDataUrl;
          replacement.alt = brandName;
          replacement.style.width = "56px";
          replacement.style.height = "56px";
          replacement.style.objectFit = "contain";
          replacement.style.display = "inline-block";
          replacement.style.margin = "0 auto 16px";

          const headingRect = heading?.getBoundingClientRect?.() ?? null;
          const candidates = Array.from(
            document.querySelectorAll("img, svg")
          ).filter((element) => {
            if (!element) return false;
            if (element.id === "hachimi-auth-logo") return false;
            if (String(element.id || "").startsWith("hachimi-auth-logo-")) return false;
            if (element.closest("button, a, label, input")) return false;

            const rect = element.getBoundingClientRect?.();
            if (!rect) return false;

            const isLargeEnough = rect.width >= 32 && rect.height >= 32;
            const isVisible =
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom >= 0 &&
              rect.top <= window.innerHeight;

            if (!isLargeEnough || !isVisible) return false;

            if (!headingRect) {
              return rect.top >= 0 && rect.top <= 260;
            }

            const iconCenterX = rect.left + rect.width / 2;
            const headingCenterX = headingRect.left + headingRect.width / 2;
            const horizontalDistance = Math.abs(iconCenterX - headingCenterX);
            const verticalDistance = headingRect.top - rect.bottom;

            return (
              horizontalDistance <= Math.max(headingRect.width, 260) &&
              verticalDistance >= -24 &&
              verticalDistance <= 220
            );
          });

          const bestCandidate = candidates
            .map((element) => {
              const rect = element.getBoundingClientRect();

              if (!headingRect) {
                return { element, score: rect.top };
              }

              const iconCenterX = rect.left + rect.width / 2;
              const headingCenterX = headingRect.left + headingRect.width / 2;
              const horizontalDistance = Math.abs(iconCenterX - headingCenterX);
              const verticalDistance = Math.abs(headingRect.top - rect.bottom);

              return {
                element,
                score: horizontalDistance + verticalDistance * 2,
              };
            })
            .sort((a, b) => a.score - b.score)[0]?.element;

          Array.from(document.querySelectorAll("[id^='hachimi-auth-logo']"))
            .filter((element) => element !== bestCandidate)
            .forEach((element) => element.remove());

          if (bestCandidate) {
            if (bestCandidate.tagName.toLowerCase() === "img") {
              bestCandidate.setAttribute("src", iconDataUrl);
              bestCandidate.setAttribute("alt", brandName);
              bestCandidate.setAttribute("id", "hachimi-auth-logo");
              return;
            }

            bestCandidate.replaceWith(replacement);
            return;
          }

          if (!heading) return;

          const container = heading.parentElement;
          if (!container) return;
          container.insertBefore(replacement, heading);
        };

        const apply = () => {
          patchTitleAndFavicon();
          patchHydraText();
          patchVietnameseText();
          const heading = findAuthHeading();
          patchLoginLogo(heading);
        };

        window.__hachimiAuthBrandingApply = apply;

        apply();
        setTimeout(apply, 250);
        setTimeout(apply, 800);
        setTimeout(apply, 1600);

        const root = document.body;
        if (!root) return;

        let scheduled = false;
        const observer = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(() => {
            scheduled = false;
            apply();
          });
        });

        observer.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["placeholder", "title", "aria-label", "alt", "src"],
        });

        setTimeout(() => observer.disconnect(), 30000);
      })();
    `;
  }

  private static initialConfigInitializationMainWindow: Electron.BrowserWindowConstructorOptions =
    {
      width: 1200,
      height: 860,
      minWidth: 1024,
      minHeight: 860,
      backgroundColor: "#1c1c1c",
      titleBarStyle: process.platform === "linux" ? "default" : "hidden",
      icon,
      trafficLightPosition: { x: 16, y: 16 },
      titleBarOverlay: {
        symbolColor: "#DADBE1",
        color: "#00000000",
        height: 34,
      },
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.mjs"),
        sandbox: false,
      },
      show: false,
    };

  private static formatVersionNumber(version: string) {
    return version.replaceAll(".", "-");
  }

  private static async loadWindowURL(window: BrowserWindow, hash: string = "") {
    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/${hash}`);
    } else if (import.meta.env.MAIN_VITE_LAUNCHER_SUBDOMAIN) {
      // Try to load from remote URL in production
      try {
        await window.loadURL(
          `https://release-v${this.formatVersionNumber(app.getVersion())}.${import.meta.env.MAIN_VITE_LAUNCHER_SUBDOMAIN}#/${hash}`
        );
      } catch (error) {
        // Fall back to local file if remote URL fails
        logger.error(
          "Failed to load from MAIN_VITE_LAUNCHER_SUBDOMAIN, falling back to local file:",
          error
        );
        window.loadFile(path.join(__dirname, "../renderer/index.html"), {
          hash,
        });
      }
    } else {
      window.loadFile(path.join(__dirname, "../renderer/index.html"), {
        hash,
      });
    }
  }

  private static async loadMainWindowURL(hash: string = "") {
    if (this.mainWindow) {
      await this.loadWindowURL(this.mainWindow, hash);
    }
  }

  private static async saveScreenConfig(configScreenWhenClosed: ScreenState) {
    await db.put(levelKeys.screenState, configScreenWhenClosed, {
      valueEncoding: "json",
    });
  }

  private static async loadScreenConfig() {
    const data = await db.get<string, ScreenState | undefined>(
      levelKeys.screenState,
      {
        valueEncoding: "json",
      }
    );
    return data ?? { isMaximized: false, height: 860, width: 1200 };
  }

  private static updateInitialConfig(
    newConfig: Partial<Electron.BrowserWindowConstructorOptions>
  ) {
    this.initialConfigInitializationMainWindow = {
      ...this.initialConfigInitializationMainWindow,
      ...newConfig,
    };
  }

  public static async createMainWindow() {
    if (this.mainWindow) return;

    const { isMaximized = false, ...configWithoutMaximized } =
      await this.loadScreenConfig();

    this.updateInitialConfig(configWithoutMaximized);

    this.mainWindow = new BrowserWindow(
      this.initialConfigInitializationMainWindow
    );

    if (isMaximized) {
      this.mainWindow.maximize();
    }

    this.mainWindow.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        if (
          details.webContentsId !== this.mainWindow?.webContents.id ||
          details.url.includes("chatwoot")
        ) {
          return callback(details);
        }

        if (details.url.includes("workwonders")) {
          return callback({
            ...details,
            requestHeaders: {
              Origin: "https://workwonders.app",
              ...details.requestHeaders,
            },
          });
        }

        const userAgent = new UserAgent();

        callback({
          requestHeaders: {
            ...details.requestHeaders,
            "user-agent": userAgent.toString(),
          },
        });
      }
    );

    this.mainWindow.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        if (
          details.webContentsId !== this.mainWindow?.webContents.id ||
          details.url.includes("featurebase") ||
          details.url.includes("chatwoot") ||
          details.url.includes("workwonders")
        ) {
          return callback(details);
        }

        const headers = {
          "access-control-allow-origin": ["*"],
          "access-control-allow-methods": ["GET, POST, PUT, DELETE, OPTIONS"],
          "access-control-expose-headers": ["ETag"],
          "access-control-allow-headers": [
            "Content-Type, Authorization, X-Requested-With, If-None-Match",
          ],
        };

        if (details.method === "OPTIONS") {
          return callback({
            cancel: false,
            responseHeaders: {
              ...details.responseHeaders,
              ...headers,
            },
            statusLine: "HTTP/1.1 200 OK",
          });
        }

        return callback({
          responseHeaders: {
            ...details.responseHeaders,
            ...headers,
          },
        });
      }
    );

    const userPreferences = await db
      .get<string, UserPreferences | null>(levelKeys.userPreferences, {
        valueEncoding: "json",
      })
      .catch(() => null);

    const initialHash = userPreferences?.launchToLibraryPage ? "library" : "";

    this.loadMainWindowURL(initialHash);
    this.mainWindow.removeMenu();

    this.mainWindow.on("ready-to-show", () => {
      if (!app.isPackaged || isStaging)
        WindowManager.mainWindow?.webContents.openDevTools();
      WindowManager.mainWindow?.show();
    });

    this.mainWindow.on("close", async () => {
      const mainWindow = this.mainWindow;
      this.mainWindow = null;

      const userPreferences = await db.get<string, UserPreferences>(
        levelKeys.userPreferences,
        {
          valueEncoding: "json",
        }
      );

      if (mainWindow) {
        mainWindow.setProgressBar(-1);

        const lastBounds = mainWindow.getBounds();
        const isMaximized = mainWindow.isMaximized() ?? false;
        const screenConfig = isMaximized
          ? {
              x: undefined,
              y: undefined,
              height: this.initialConfigInitializationMainWindow.height ?? 860,
              width: this.initialConfigInitializationMainWindow.width ?? 1200,
              isMaximized: true,
            }
          : { ...lastBounds, isMaximized };

        await this.saveScreenConfig(screenConfig);
      }

      if (userPreferences?.preferQuitInsteadOfHiding) {
        app.quit();
      }
    });

    this.mainWindow.webContents.setWindowOpenHandler((handler) => {
      shell.openExternal(handler.url);
      return { action: "deny" };
    });
  }

  public static openAuthWindow(page: AuthPage, searchParams: URLSearchParams) {
    if (this.mainWindow) {
      const requestedLanguage = (
        searchParams.get("lng") ||
        searchParams.get("lang") ||
        searchParams.get("locale") ||
        "en"
      ).toLowerCase();
      const authWindowTitle = requestedLanguage.startsWith("vi")
        ? this.AUTH_WINDOW_TITLE_VI
        : this.AUTH_WINDOW_TITLE;

      const authWindow = new BrowserWindow({
        width: 600,
        height: 640,
        backgroundColor: "#1c1c1c",
        icon,
        title: authWindowTitle,
        parent: this.mainWindow,
        modal: true,
        show: false,
        maximizable: false,
        resizable: false,
        minimizable: false,
        webPreferences: {
          sandbox: false,
          nodeIntegrationInSubFrames: true,
        },
      });

      authWindow.removeMenu();
      authWindow.setIcon(nativeImage.createFromPath(icon));

      // Keep the auth window clean in normal dev runs.
      if (!app.isPackaged && process.env.HACHIMI_OPEN_AUTH_DEVTOOLS === "1") {
        authWindow.webContents.openDevTools({ mode: "detach" });
      }

      authWindow.loadURL(
        `${import.meta.env.MAIN_VITE_AUTH_URL}${page}?${searchParams.toString()}`
      );

      authWindow.once("ready-to-show", () => {
        authWindow.show();
      });

      authWindow.on("page-title-updated", (event) => {
        event.preventDefault();
        authWindow.setTitle(authWindowTitle);
      });

      authWindow.webContents.on("did-finish-load", () => {
        authWindow.webContents
          .executeJavaScript(this.getAuthBrandingScript(), true)
          .catch((error) => {
            logger.warn("Failed to apply auth branding patch:", error);
          });
      });

      authWindow.webContents.on("did-navigate-in-page", () => {
        authWindow.webContents
          .executeJavaScript(this.getAuthBrandingScript(), true)
          .catch((error) => {
            logger.warn("Failed to re-apply auth branding patch:", error);
          });
      });

      authWindow.webContents.on("will-navigate", (_event, url) => {
        if (
          url.startsWith("hachimi://auth") ||
          url.startsWith("hydralauncher://auth")
        ) {
          authWindow.close();

          HydraApi.handleExternalAuth(url);
          return;
        }

        if (
          url.startsWith("hachimi://update-account") ||
          url.startsWith("hydralauncher://update-account")
        ) {
          authWindow.close();

          WindowManager.mainWindow?.webContents.send("on-account-updated");
        }
      });
    }
  }

  private static readonly NOTIFICATION_WINDOW_WIDTH = 360;
  private static readonly NOTIFICATION_WINDOW_HEIGHT = 140;

  private static async getNotificationWindowPosition(
    position: AchievementCustomNotificationPosition | undefined
  ) {
    const display = screen.getPrimaryDisplay();
    const {
      x: displayX,
      y: displayY,
      width: displayWidth,
      height: displayHeight,
    } = display.bounds;

    if (position === "bottom-left") {
      return {
        x: displayX,
        y: displayY + displayHeight - this.NOTIFICATION_WINDOW_HEIGHT,
      };
    }

    if (position === "bottom-center") {
      return {
        x: displayX + (displayWidth - this.NOTIFICATION_WINDOW_WIDTH) / 2,
        y: displayY + displayHeight - this.NOTIFICATION_WINDOW_HEIGHT,
      };
    }

    if (position === "bottom-right") {
      return {
        x: displayX + displayWidth - this.NOTIFICATION_WINDOW_WIDTH,
        y: displayY + displayHeight - this.NOTIFICATION_WINDOW_HEIGHT,
      };
    }

    if (position === "top-left") {
      return {
        x: displayX,
        y: displayY,
      };
    }

    if (position === "top-center") {
      return {
        x: displayX + (displayWidth - this.NOTIFICATION_WINDOW_WIDTH) / 2,
        y: displayY,
      };
    }

    if (position === "top-right") {
      return {
        x: displayX + displayWidth - this.NOTIFICATION_WINDOW_WIDTH,
        y: displayY,
      };
    }

    return {
      x: displayX,
      y: displayY,
    };
  }

  public static async createNotificationWindow() {
    if (this.notificationWindow) return;

    if (process.platform === "darwin") {
      return;
    }

    const userPreferences = await db.get<string, UserPreferences | undefined>(
      levelKeys.userPreferences,
      {
        valueEncoding: "json",
      }
    );

    if (
      userPreferences?.achievementNotificationsEnabled === false ||
      userPreferences?.achievementCustomNotificationsEnabled === false
    ) {
      return;
    }

    const { x, y } = await this.getNotificationWindowPosition(
      userPreferences?.achievementCustomNotificationPosition
    );

    this.notificationWindow = new BrowserWindow({
      transparent: true,
      maximizable: false,
      autoHideMenuBar: true,
      minimizable: false,
      backgroundColor: "#00000000",
      focusable: false,
      skipTaskbar: true,
      frame: false,
      width: this.NOTIFICATION_WINDOW_WIDTH,
      height: this.NOTIFICATION_WINDOW_HEIGHT,
      x,
      y,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.mjs"),
        sandbox: false,
      },
    });
    this.notificationWindow.setIgnoreMouseEvents(true);

    this.notificationWindow.setAlwaysOnTop(true, "screen-saver", 1);
    this.loadWindowURL(this.notificationWindow, "achievement-notification");

    if (!app.isPackaged || isStaging) {
      this.notificationWindow.webContents.openDevTools();
    }
  }

  public static async showAchievementTestNotification() {
    const userPreferences = await db.get<string, UserPreferences>(
      levelKeys.userPreferences,
      {
        valueEncoding: "json",
      }
    );

    const language = userPreferences.language ?? "en";

    this.notificationWindow?.webContents.send(
      "on-achievement-unlocked",
      userPreferences.achievementCustomNotificationPosition ?? "top-left",
      [
        generateAchievementCustomNotificationTest(t, language),
        generateAchievementCustomNotificationTest(t, language, {
          isRare: true,
          isHidden: true,
        }),
        generateAchievementCustomNotificationTest(t, language, {
          isPlatinum: true,
        }),
      ]
    );
  }

  public static async closeNotificationWindow() {
    if (this.notificationWindow) {
      this.notificationWindow.close();
      this.notificationWindow = null;
    }
  }

  public static openEditorWindow(themeId: string) {
    if (this.mainWindow) {
      const existingWindow = this.editorWindows.get(themeId);
      if (existingWindow) {
        if (existingWindow.isMinimized()) {
          existingWindow.restore();
        }
        existingWindow.focus();
        return;
      }

      const editorWindow = new BrowserWindow({
        width: 720,
        height: 720,
        minWidth: 600,
        minHeight: 540,
        backgroundColor: "#1c1c1c",
        titleBarStyle: process.platform === "linux" ? "default" : "hidden",
        icon,
        trafficLightPosition: { x: 16, y: 16 },
        titleBarOverlay: {
          symbolColor: "#DADBE1",
          color: "#151515",
          height: 34,
        },
        webPreferences: {
          preload: path.join(__dirname, "../preload/index.mjs"),
          sandbox: false,
        },
        show: false,
      });

      this.editorWindows.set(themeId, editorWindow);

      editorWindow.removeMenu();

      this.loadWindowURL(editorWindow, `theme-editor?themeId=${themeId}`);

      editorWindow.once("ready-to-show", () => {
        editorWindow.show();
        this.mainWindow?.webContents.openDevTools();
        if (!app.isPackaged || isStaging) {
          editorWindow.webContents.openDevTools();
        }
      });

      editorWindow.webContents.on("before-input-event", (_event, input) => {
        if (input.key === "F12") {
          this.mainWindow?.webContents.toggleDevTools();
        }
      });

      editorWindow.on("close", () => {
        this.mainWindow?.webContents.closeDevTools();
        this.editorWindows.delete(themeId);
      });
    }
  }

  public static closeEditorWindow(themeId?: string) {
    if (themeId) {
      const editorWindow = this.editorWindows.get(themeId);
      if (editorWindow) {
        editorWindow.close();
      }
    } else {
      this.editorWindows.forEach((editorWindow) => {
        editorWindow.close();
      });
    }
  }

  private static readonly GAME_LAUNCHER_WINDOW_WIDTH = 550;
  private static readonly GAME_LAUNCHER_WINDOW_HEIGHT = 320;

  public static async createGameLauncherWindow(shop: string, objectId: string) {
    if (this.gameLauncherWindow) {
      this.gameLauncherWindow.close();
      this.gameLauncherWindow = null;
    }

    const display = screen.getPrimaryDisplay();
    const { width: displayWidth, height: displayHeight } = display.bounds;

    const x = Math.round((displayWidth - this.GAME_LAUNCHER_WINDOW_WIDTH) / 2);
    const y = Math.round(
      (displayHeight - this.GAME_LAUNCHER_WINDOW_HEIGHT) / 2
    );

    this.gameLauncherWindow = new BrowserWindow({
      width: this.GAME_LAUNCHER_WINDOW_WIDTH,
      height: this.GAME_LAUNCHER_WINDOW_HEIGHT,
      x,
      y,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      frame: false,
      backgroundColor: "#1c1c1c",
      icon,
      skipTaskbar: false,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.mjs"),
        sandbox: false,
      },
      show: false,
    });

    this.gameLauncherWindow.removeMenu();

    this.loadWindowURL(
      this.gameLauncherWindow,
      `game-launcher?shop=${shop}&objectId=${objectId}`
    );

    this.gameLauncherWindow.on("closed", () => {
      this.gameLauncherWindow = null;
    });

    if (!app.isPackaged || isStaging) {
      this.gameLauncherWindow.webContents.openDevTools();
    }
  }

  public static showGameLauncherWindow() {
    if (this.gameLauncherWindow && !this.gameLauncherWindow.isDestroyed()) {
      this.gameLauncherWindow.show();
    }
  }

  public static closeGameLauncherWindow() {
    if (this.gameLauncherWindow) {
      this.gameLauncherWindow.close();
      this.gameLauncherWindow = null;
    }
  }

  public static openMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.focus();
    } else {
      this.createMainWindow();
    }
  }

  public static redirect(hash: string) {
    if (!this.mainWindow) this.createMainWindow();
    this.loadMainWindowURL(hash);

    if (this.mainWindow?.isMinimized()) this.mainWindow.restore();
    this.mainWindow?.focus();
  }

  private static async buildSystemTrayMenu(language: string) {
    const games = await gamesSublevel
      .values()
      .all()
      .then((games) => {
        const filteredGames = games.filter(
          (game) =>
            !game.isDeleted && game.executablePath && game.lastTimePlayed
        );

        const sortedGames = orderBy(filteredGames, "lastTimePlayed", "desc");

        return slice(sortedGames, 0, 6);
      });

    const recentlyPlayedGames: Array<MenuItemConstructorOptions | MenuItem> =
      games.map(({ title, executablePath }) => ({
        label: title.length > 18 ? `${title.slice(0, 18)}…` : title,
        type: "normal",
        click: async () => {
          if (!executablePath) return;

          shell.openPath(executablePath);
        },
      }));

    return Menu.buildFromTemplate([
      {
        label: t("open", {
          ns: "system_tray",
          lng: language,
        }),
        type: "normal",
        click: () => {
          if (this.mainWindow) {
            this.mainWindow.show();
          } else {
            this.createMainWindow();
          }
        },
      },
      {
        type: "separator",
      },
      ...recentlyPlayedGames,
      {
        type: "separator",
      },
      {
        label: t("quit", {
          ns: "system_tray",
          lng: language,
        }),
        type: "normal",
        click: () => app.quit(),
      },
    ]);
  }

  private static async updateSystemTrayMenu() {
    if (!this.systemTray) return null;
    const contextMenu = await this.buildSystemTrayMenu(
      this.systemTrayLanguage || "en"
    );

    if (process.platform === "linux") {
      this.systemTray.setContextMenu(contextMenu);
    }

    return contextMenu;
  }

  private static handleTrayOpen() {
    if (this.mainWindow) {
      this.mainWindow.show();
    } else {
      this.createMainWindow();
    }
  }

  private static async showTrayContextMenu() {
    if (!this.systemTray) return;
    const contextMenu = await this.updateSystemTrayMenu();
    if (contextMenu) this.systemTray.popUpContextMenu(contextMenu);
  }

  public static async createSystemTray(language: string) {
    this.systemTrayLanguage = language || "en";

    if (!this.systemTray) {
      if (process.platform === "darwin") {
        const macIcon = nativeImage
          .createFromPath(trayIcon)
          .resize({ width: 24, height: 24 });
        this.systemTray = new Tray(macIcon);
      } else {
        this.systemTray = new Tray(trayIcon);
      }

      this.systemTray.setToolTip("Hachimi");
    }

    await this.updateSystemTrayMenu();

    if (!this.systemTray || this.systemTrayListenersAttached) return;
    this.systemTrayListenersAttached = true;

    if (process.platform === "win32") {
      this.systemTray.addListener("double-click", () => this.handleTrayOpen());
      this.systemTray.addListener("right-click", () =>
        this.showTrayContextMenu()
      );
    } else if (process.platform === "linux") {
      this.systemTray.addListener("click", () => this.handleTrayOpen());
      this.systemTray.addListener("right-click", () =>
        this.showTrayContextMenu()
      );
    } else {
      this.systemTray.addListener("click", () => this.showTrayContextMenu());
      this.systemTray.addListener("right-click", () =>
        this.showTrayContextMenu()
      );
    }
  }
}
