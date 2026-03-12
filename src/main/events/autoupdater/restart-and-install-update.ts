import { app } from "electron";
import { registerEvent } from "../register-event";
import updater from "electron-updater";

const { autoUpdater } = updater;
const UPDATES_ENABLED = false;

export const restartAndInstallUpdate = () => {
  if (!UPDATES_ENABLED) {
    return;
  }

  autoUpdater.removeAllListeners();
  if (app.isPackaged) {
    autoUpdater.quitAndInstall(false);
  }
};

const restartAndInstallUpdateEvent = async (
  _event: Electron.IpcMainInvokeEvent
) => restartAndInstallUpdate();

registerEvent("restartAndInstallUpdate", restartAndInstallUpdateEvent);
