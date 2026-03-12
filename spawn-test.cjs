const { spawn } = require("child_process");
const p = spawn("cmd", ["/c", "echo", "ok"], { stdio: "inherit" });
p.on("exit", (code) => process.exit(code ?? 0));
