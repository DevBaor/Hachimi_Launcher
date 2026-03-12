const { spawn } = require("child_process");
const p = spawn(
  "d:/DB_Launcher/DB_Launcher/esbuild-bin/esbuild.exe",
  ["--version"],
  { stdio: "inherit" }
);
p.on("exit", (code) => process.exit(code ?? 0));
