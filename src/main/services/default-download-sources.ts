import axios from "axios";
import { downloadSourcesSublevel } from "@main/level";
import type { DownloadSource } from "@types";
import { HydraApi } from "./hydra-api";
import { logger } from "./logger";

interface HydraLibrarySource {
  url: string;
}

interface HydraLibrarySourcesResponse {
  sources: HydraLibrarySource[];
  page: number;
  totalPages: number;
}

const HYDRA_LIBRARY_API_BASE_URL = "https://api.hydralibrary.com";
const HYDRA_LIBRARY_PAGE_SIZE = 100;

const isValidSourceUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.endsWith(".json");
  } catch {
    return false;
  }
};

const fetchHydraLibrarySourceUrls = async () => {
  const urls: string[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const { data } = await axios.get<HydraLibrarySourcesResponse>(
      `${HYDRA_LIBRARY_API_BASE_URL}/sources`,
      {
        params: {
          page,
          limit: HYDRA_LIBRARY_PAGE_SIZE,
          sort: "most-installs",
        },
      }
    );

    totalPages = data.totalPages;
    urls.push(
      ...data.sources
        .map((source) => source.url.trim())
        .filter((url) => isValidSourceUrl(url))
    );

    page += 1;
  }

  return Array.from(new Set(urls));
};

export const syncDefaultDownloadSources = async () => {
  try {
    const existingSources = await downloadSourcesSublevel.values().all();
    const existingUrls = new Set(
      existingSources.map((source) => source.url.trim().toLowerCase())
    );

    const sourceUrls = await fetchHydraLibrarySourceUrls();
    const missingSourceUrls = sourceUrls.filter(
      (url) => !existingUrls.has(url.toLowerCase())
    );

    if (!missingSourceUrls.length) {
      return;
    }

    logger.info(
      `Syncing ${missingSourceUrls.length} default download sources from Hydra Library`
    );

    for (const sourceUrl of missingSourceUrls) {
      try {
        const downloadSource = await HydraApi.post<DownloadSource>(
          "/download-sources",
          { url: sourceUrl },
          { needsAuth: false }
        );

        await downloadSourcesSublevel.put(downloadSource.id, {
          ...downloadSource,
          isRemote: true,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        logger.warn(`Failed to sync default source ${sourceUrl}`, error);
      }
    }
  } catch (error) {
    logger.error("Failed to sync default download sources", error);
  }
};
