import { app } from "electron";
import { registerEvent } from "../register-event";
import { is } from "@electron-toolkit/utils";
import { WindowManager } from "@main/services";

const restartApp = async () => {
  if (is.dev || !app.isPackaged) {
    WindowManager.mainWindow?.webContents.reloadIgnoringCache();
    return;
  }

  app.relaunch();
  app.exit(0);
};

registerEvent("restartApp", restartApp);
