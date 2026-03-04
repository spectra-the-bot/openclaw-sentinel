import { jsonResult } from "openclaw/plugin-sdk";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";
import { WatcherManager } from "./watcherManager.js";

const ParamsSchema = z
  .object({
    action: z.enum(["create", "enable", "disable", "remove", "status", "list"]),
    id: z.string().optional(),
    watcher: z.unknown().optional(),
  })
  .strict();

type RegisterToolFn = (tool: AnyAgentTool) => void;

export function registerSentinelControl(
  registerTool: RegisterToolFn,
  manager: WatcherManager,
): void {
  registerTool({
    name: "sentinel_control",
    label: "sentinel_control",
    description: "Create/manage sentinel watchers",
    parameters: {
      action: {
        type: "string",
        enum: ["create", "enable", "disable", "remove", "status", "list"],
      },
      id: { type: "string" },
      watcher: { type: "object" },
    },
    async execute(_toolCallId, params) {
      const payload = ParamsSchema.parse((params ?? {}) as Record<string, unknown>);
      switch (payload.action) {
        case "create":
          return jsonResult(await manager.create(payload.watcher));
        case "enable":
          return jsonResult(await manager.enable(payload.id ?? ""));
        case "disable":
          return jsonResult(await manager.disable(payload.id ?? ""));
        case "remove":
          return jsonResult(await manager.remove(payload.id ?? ""));
        case "status":
          return jsonResult(manager.status(payload.id ?? ""));
        case "list":
          return jsonResult(manager.list());
      }
    },
  });
}
