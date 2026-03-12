process.env.ESBUILD_BINARY_PATH =
  "d:/DB_Launcher/DB_Launcher/esbuild-bin/esbuild.exe";
const esbuild = require("esbuild");
esbuild
  .build({
    stdin: { contents: "console.log(1)", loader: "js" },
    write: false,
  })
  .then(() => {
    console.log("ok");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
