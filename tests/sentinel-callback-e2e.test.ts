import { execSync, spawn } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

function sh(command: string, cwd: string): string {
  return execSync(command, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Timed out waiting for condition");
}

describe("runtime sentinel callback e2e", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const spawned: Array<{ kill: () => void }> = [];
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const p of spawned) {
      try {
        p.kill();
      } catch {
        // ignore
      }
    }
    spawned.length = 0;
    for (const p of cleanupPaths) {
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    cleanupPaths.length = 0;
  });

  it("boots a real OpenClaw gateway and enqueues /hooks/sentinel callback context for LLM processing", async () => {
    const profile = `ci-e2e-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const stateDir = path.join(os.homedir(), `.openclaw-${profile}`);
    cleanupPaths.push(stateDir);

    const packOut = sh("pnpm pack --pack-destination . --silent", repoRoot);
    const tarball = packOut.split("\n").pop()?.trim();
    if (!tarball) throw new Error("Failed to create package tarball");
    const tarballPath = path.join(repoRoot, tarball);
    cleanupPaths.push(tarballPath);

    const oc = `pnpm exec openclaw --profile ${profile} --log-level error`;

    sh(`${oc} plugins install ./` + tarball, repoRoot);

    const port = 18891;
    const child = spawn(
      "pnpm",
      [
        "exec",
        "openclaw",
        "--profile",
        profile,
        "--log-level",
        "error",
        "gateway",
        "run",
        "--allow-unconfigured",
        "--auth",
        "none",
        "--bind",
        "loopback",
        "--port",
        String(port),
      ],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
    );

    let stdoutLog = "";
    let stderrLog = "";
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let spawnError: string | null = null;

    child.stdout?.on("data", (chunk) => {
      stdoutLog = (stdoutLog + String(chunk)).slice(-8_000);
    });
    child.stderr?.on("data", (chunk) => {
      stderrLog = (stderrLog + String(chunk)).slice(-8_000);
    });
    child.on("exit", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
    });
    child.on("error", (err) => {
      spawnError = err.message;
    });

    spawned.push({
      kill: () => {
        child.kill("SIGTERM");
      },
    });

    try {
      await waitFor(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        return res.ok;
      }, 45_000);
    } catch {
      throw new Error(
        [
          "Timed out waiting for OpenClaw gateway health endpoint",
          `spawnError=${spawnError ?? "none"}`,
          `exitCode=${exitCode ?? "null"} exitSignal=${exitSignal ?? "null"}`,
          `stdoutTail=${JSON.stringify(stdoutLog)}`,
          `stderrTail=${JSON.stringify(stderrLog)}`,
        ].join("\n"),
      );
    }

    const payload = {
      type: "sentinel.callback",
      version: "1",
      intent: "sentinel_timeapi_test",
      actionable: true,
      watcher: {
        id: "runtime-e2e-watcher",
        skillId: "skills.test",
        eventName: "timeapi_runtime_e2e",
      },
      trigger: {
        matchedAt: new Date().toISOString(),
        dedupeKey: `runtime-e2e-${Date.now()}`,
        priority: "normal",
      },
      context: {
        watcher: "runtime-e2e-watcher",
        unix_timestamp: 1772669999,
      },
      payload: {
        unix_timestamp: 1772669999,
      },
      deliveryTargets: [
        {
          channel: "telegram",
          to: "5613673222",
          accountId: "default",
        },
      ],
      source: {
        plugin: "openclaw-sentinel",
        route: "/hooks/sentinel",
      },
    };

    const hookRes = await fetch(`http://127.0.0.1:${port}/hooks/sentinel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(hookRes.ok).toBe(true);
    const hookJson = (await hookRes.json()) as Record<string, unknown>;
    expect(hookJson.ok).toBe(true);
    expect(hookJson.enqueued).toBe(true);
    expect(String(hookJson.sessionKey ?? "")).toContain("watcher:runtime-e2e-watcher");

    // The callback payload is passed through live gateway routing; this confirms
    // runtime enqueue path and watcher-context session routing in a real process.
    expect(String(hookJson.route ?? "")).toBe("/hooks/sentinel");
  }, 60_000);
});
