import { spawn } from "node:child_process";

export function runCommandStreaming(command, cwd, ws) {
  const child = spawn(command, {
    cwd,
    shell: true,
    env: process.env
  });

  const send = (type, data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, data: data.toString() }));
    }
  };

  child.stdout.on("data", (d) => send("stdout", d));
  child.stderr.on("data", (d) => send("stderr", d));

  child.on("close", (code) => {
    send("exit", String(code));
  });

  child.on("error", (err) => {
    send("stderr", `Failed to start command: ${err.message}`);
    send("exit", "1");
  });

  return child;
}
