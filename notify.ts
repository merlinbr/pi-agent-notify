// ~/.pi/agent/extensions/discord-notify.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  buildAgentEndDiscordPayload,
  extractAssistantText,
  getAgentEndStatus,
  truncate,
  type DiscordPayload,
} from "./notify-format";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "discord-notify.json");
const ENV_WEBHOOK_URL = "PI_DISCORD_WEBHOOK_URL";
const DISCORD_LIMIT = 2000;
const FETCH_TIMEOUT_MS = 10_000;

type DiscordNotifyConfig = {
  webhookUrl?: string;
  notifySubAgents?: boolean;
};

let agentStartedAt = 0;
let attentionPinged = false;
let riskyCommandSeen = false;
let agentDepth = 0;
let notifySubAgents = false;

async function loadConfig(): Promise<DiscordNotifyConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err: any) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function saveConfig(config: DiscordNotifyConfig) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function clearConfig() {
  try {
    await unlink(CONFIG_PATH);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
}

async function getWebhookUrl(): Promise<string | undefined> {
  const fromEnv = process.env[ENV_WEBHOOK_URL]?.trim();
  if (fromEnv) return fromEnv;

  const config = await loadConfig();
  return config.webhookUrl?.trim() || undefined;
}

function isLikelyDiscordWebhook(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"].includes(
        parsed.hostname,
      ) &&
      parsed.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

function truncateDiscordMessage(text: string) {
  return truncate(text, DISCORD_LIMIT - 50);
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function buildDiscordRequestBody(payload: string | DiscordPayload) {
  return typeof payload === "string"
    ? { content: truncateDiscordMessage(payload) }
    : payload;
}

async function postDiscord(payload: string | DiscordPayload, signal?: AbortSignal) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) {
    throw new Error(
      `Discord webhook is not configured. Run /discord-notify setup or set ${ENV_WEBHOOK_URL}.`,
    );
  }

  const timeout = new AbortController();
  const timeoutId = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS);

  const signals = [timeout.signal, signal].filter(Boolean) as AbortSignal[];
  const combinedSignal =
    signals.length === 1
      ? signals[0]
      : AbortSignal.any
        ? AbortSignal.any(signals)
        : timeout.signal;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDiscordRequestBody(payload)),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Discord webhook failed: ${res.status} ${res.statusText}${body ? `\n${body}` : ""}`,
      );
    }
  } catch (err: any) {
    if (timeout.signal.aborted) {
      throw new Error(`Discord webhook timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function tryPostDiscord(payload: string | DiscordPayload, ctx?: any, signal?: AbortSignal) {
  try {
    await postDiscord(payload, signal);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Automatic lifecycle notifications should never break, freeze, or nag during
    // normal conversations. Missing config is expected until the user runs setup.
    if (!message.includes("not configured")) {
      ctx?.ui?.notify?.(`Discord notification failed: ${message}`, "error");
      console.warn(`[discord-notify] ${message}`);
    }
    return false;
  }
}

async function refreshConfig() {
  const config = await loadConfig();
  notifySubAgents = config.notifySubAgents === true;
}

function helpText() {
  return [
    "Discord Notify commands:",
    "  /discord-notify setup            Prompt for and save a Discord webhook URL",
    "  /discord-notify test             Send a test notification",
    "  /discord-notify status           Show whether Discord Notify is configured",
    "  /discord-notify subagents on|off Toggle sub-agent notifications (default off)",
    "  /discord-notify clear            Remove the saved webhook URL",
    "",
    `Config file: ${CONFIG_PATH}`,
    `Env override: ${ENV_WEBHOOK_URL}`,
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  refreshConfig();

  pi.on("agent_start", async () => {
    agentDepth++;
    // Only reset tracking state when the outermost (main) agent starts, not for sub-agents.
    if (agentDepth === 1) {
      agentStartedAt = Date.now();
      attentionPinged = false;
      riskyCommandSeen = false;
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const command = event.input?.command;

    if (
      event.toolName === "bash" &&
      typeof command === "string" &&
      /sudo|rm -rf|git push|npm publish|docker|kubectl/.test(command)
    ) {
      riskyCommandSeen = true;
      attentionPinged = true;

      // Only notify for risky commands from the main agent, not sub-agents.
      if (agentDepth === 1) {
        await tryPostDiscord(
          `⚠️ Pi may need attention in \`${process.cwd()}\` before running:\n\n` +
            `\`\`\`sh\n${truncate(command, 1400)}\n\`\`\``,
          ctx,
          ctx.signal,
        );
      }
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    agentDepth = Math.max(0, agentDepth - 1);

    // Suppress sub-agent notifications unless the user opted in.
    if (agentDepth > 0 && !notifySubAgents) return;

    const duration =
      agentStartedAt > 0
        ? formatDuration(Date.now() - agentStartedAt)
        : "unknown";

    const summary = extractAssistantText((event as any).messages);

    const errors =
      (event as any)?.errors ??
      (event as any)?.error ??
      (event as any)?.failed ??
      null;

    const interrupted =
      (event as any)?.interrupted ??
      (event as any)?.aborted ??
      (event as any)?.cancelled ??
      false;

    const status = getAgentEndStatus({
      summary,
      interrupted,
      errors,
    });

    const message = buildAgentEndDiscordPayload({
      status,
      projectPath: process.cwd(),
      duration,
      summary,
      riskyCommandSeen,
      interrupted,
      errors,
    });

    await tryPostDiscord(message, ctx, ctx.signal);
  });

  pi.registerCommand("discord-notify", {
    description: "Configure and test Discord notifications. Use /discord-notify setup, test, status, or clear.",
    handler: async (args, ctx) => {
      const action = (args || "help").trim().toLowerCase();

      if (action === "setup") {
        const webhookUrl = await ctx.ui.input(
          "Discord webhook URL",
          "https://discord.com/api/webhooks/...",
        );

        if (!webhookUrl?.trim()) {
          ctx.ui.notify("Discord Notify setup cancelled.", "warning");
          return;
        }

        const trimmed = webhookUrl.trim();
        if (!isLikelyDiscordWebhook(trimmed)) {
          ctx.ui.notify("That does not look like a Discord webhook URL.", "error");
          return;
        }

        await saveConfig({ webhookUrl: trimmed });

        try {
          await postDiscord(`✅ Discord Notify configured for \`${process.cwd()}\`.`);
          ctx.ui.notify("Discord webhook saved and test notification sent.", "success");
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ctx.ui.notify(`Webhook saved, but test failed: ${message}`, "error");
        }
        return;
      }

      if (action === "test") {
        const ok = await tryPostDiscord(
          `🧪 Discord Notify test from Pi in \`${process.cwd()}\`.`,
          ctx,
        );
        ctx.ui.notify(ok ? "Discord test notification sent." : "Discord test failed.", ok ? "success" : "error");
        return;
      }

      if (action === "status") {
        const envUrl = process.env[ENV_WEBHOOK_URL]?.trim();
        const config = await loadConfig().catch(() => ({}));
        const configured = Boolean(envUrl || config.webhookUrl);
        const source = envUrl ? "environment variable" : config.webhookUrl ? "config file" : "none";
        ctx.ui.notify(
          configured
            ? `Discord Notify is configured via ${source}.`
            : "Discord Notify is not configured. Run /discord-notify setup.",
          configured ? "success" : "warning",
        );
        return;
      }

      if (action === "subagents" || action.startsWith("subagents ")) {
        const subAction = action.split(/\s+/, 2)[1];

        if (subAction === "on") {
          const config = await loadConfig();
          config.notifySubAgents = true;
          await saveConfig(config);
          notifySubAgents = true;
          ctx.ui.notify("Sub-agent notifications enabled.", "success");
        } else if (subAction === "off") {
          const config = await loadConfig();
          config.notifySubAgents = false;
          await saveConfig(config);
          notifySubAgents = false;
          ctx.ui.notify("Sub-agent notifications disabled.", "success");
        } else {
          ctx.ui.notify(
            `Sub-agent notifications are currently ${notifySubAgents ? "on" : "off"}. Use /discord-notify subagents on|off to toggle.`,
            "info",
          );
        }
        return;
      }

      if (action === "clear") {
        await clearConfig();
        ctx.ui.notify(
          process.env[ENV_WEBHOOK_URL]?.trim()
            ? `Saved webhook removed. ${ENV_WEBHOOK_URL} is still set and will be used.`
            : "Saved Discord webhook removed.",
          "success",
        );
        return;
      }

      ctx.ui.notify(helpText(), "info");
    },
  });

  pi.registerTool({
    name: "notify_discord",
    label: "Notify Discord",
    description:
      "Send a Discord notification when the user’s attention is needed, when blocked, or when important work is complete. Setup: tell the user to run /discord-notify setup, paste a Discord webhook URL, then run /discord-notify test.",
    promptSnippet:
      "Send Discord notifications; setup with /discord-notify setup and test with /discord-notify test.",
    promptGuidelines: [
      "If the user asks how to set up Discord notifications, answer directly: run /discord-notify setup, paste a Discord webhook URL, then run /discord-notify test. Do not search the repo or Pi docs for this setup flow.",
      "Use notify_discord only when the user asks for a Discord notification, when user attention is needed, when blocked, or when important work is complete.",
      "If notify_discord reports that the webhook is not configured, tell the user to run /discord-notify setup instead of trying to inspect extension files.",
    ],
    parameters: Type.Object({
      message: Type.String({
        description: "The message to send to Discord.",
      }),
      urgent: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      attentionPinged = true;

      const prefix = params.urgent ? "🚨 Pi needs attention" : "📣 Pi update";

      try {
        await postDiscord(
          `${prefix} in \`${process.cwd()}\`:\n\n${truncate(params.message, 1800)}`,
          signal,
        );

        return {
          content: [
            {
              type: "text",
              text: "Discord notification sent.",
            },
          ],
          details: { success: true },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx?.ui?.notify?.(`Discord notification failed: ${message}`, "error");

        return {
          content: [
            {
              type: "text",
              text: `Discord notification failed: ${message}`,
            },
          ],
          details: { success: false },
          isError: true,
        };
      }
    },
  });
}
