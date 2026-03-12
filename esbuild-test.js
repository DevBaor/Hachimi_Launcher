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
