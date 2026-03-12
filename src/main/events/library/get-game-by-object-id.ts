import { registerEvent } from "../register-event";
import {
  gamesSublevel,
  downloadsSublevel,
  gamesShopAssetsSublevel,
  levelKeys,
} from "@main/level";
import type { GameShop, LibraryGame } from "@types";

const readMaybe = async <T>(promise: Promise<T>): Promise<T | null> => {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFoundError") {
      return null;
    }

    throw error;
  }
};

const getGameByObjectId = async (
  _event: Electron.IpcMainInvokeEvent,
  shop: GameShop,
  objectId: string
) => {
  const gameKey = levelKeys.game(shop, objectId);
  const [game, download, gameAssets] = await Promise.all([
    readMaybe(gamesSublevel.get(gameKey)),
    readMaybe(downloadsSublevel.get(gameKey)),
    readMaybe(gamesShopAssetsSublevel.get(gameKey)),
  ]);

  if (!game || game.isDeleted) return null;

  return {
    id: gameKey,
    ...game,
    ...gameAssets,
    download,
  } as LibraryGame;
};

registerEvent("getGameByObjectId", getGameByObjectId);
