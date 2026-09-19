import { spawn } from "node:child_process";

/**
 * Bounded, synchronous (promise-based) command runner — used by the agent's
 * `run_command` tool. Different from runCommandStreaming below (which pushes
 * live output over the interactive terminal WebSocket): this one just runs
 * a command to completion (or until it times out), buffers stdout/stderr,
 * and resolves once with the full result so the agent loop can read it and
 * decide what to do next.
 */
export function runCommandBounded(command, cwd, timeoutMs = 25000, onOutput = null) {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, { cwd, shell: true, env: process.env });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    // Cap buffered output so a runaway/verbose command can't blow up memory
    // or the response payload — keep the last 20kb of each stream.
    const MAX_LEN = 20000;
    child.stdout.on("data", (d) => {
      const chunk=d.toString();
      onOutput?.("stdout", chunk);
      stdout += chunk;
      if (stdout.length > MAX_LEN) stdout = stdout.slice(-MAX_LEN);
    });
    child.stderr.on("data", (d) => {
      const chunk=d.toString();
      onOutput?.("stderr", chunk);
      stderr += chunk;
      if (stderr.length > MAX_LEN) stderr = stderr.slice(-MAX_LEN);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: timedOut ? `${stderr}\n[timed out after ${timeoutMs}ms, process killed]` : stderr,
        exitCode: code,
        timedOut
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\nFailed to start: ${err.message}`, exitCode: 1, timedOut: false });
    });
  });
}

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
