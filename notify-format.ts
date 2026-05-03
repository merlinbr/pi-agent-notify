import { basename } from "node:path";

const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096;
const DISCORD_EMBED_FIELD_VALUE_LIMIT = 1024;

export type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
};

export type DiscordPayload = {
  content?: string;
  embeds?: DiscordEmbed[];
};

export type AgentEndPayloadOptions = {
  status: string;
  projectPath: string;
  duration: string;
  summary?: string;
  riskyCommandSeen?: boolean;
  interrupted?: boolean;
  errors?: unknown;
};

export function truncate(text: string, max = 1500) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function getProjectName(projectPath = process.cwd()) {
  return basename(projectPath) || projectPath;
}

export function extractText(message: any) {
  if (!message?.content) return "";

  if (typeof message.content === "string") return message.content;

  if (Array.isArray(message.content)) {
    return message.content
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
  }

  return "";
}

export function extractAssistantText(messages: any[] | undefined) {
  const assistantMessages = (messages ?? []).filter(
    (message) => message?.role === "assistant",
  );

  return extractText(assistantMessages.at(-1));
}

export function buildAgentEndDiscordPayload(options: AgentEndPayloadOptions): DiscordPayload {
  const project = getProjectName(options.projectPath);
  const fields: DiscordEmbed["fields"] = [
    {
      name: "Path",
      value: truncate(options.projectPath, DISCORD_EMBED_FIELD_VALUE_LIMIT),
      inline: false,
    },
  ];

  if (options.riskyCommandSeen) {
    fields.push({ name: "Note", value: "Risky command was detected", inline: false });
  }

  if (options.interrupted) {
    fields.push({ name: "Interrupted", value: "Run appears to have been interrupted", inline: false });
  }

  if (options.errors) {
    fields.push({
      name: "Errors",
      value: `\`\`\`\n${truncate(String(options.errors), DISCORD_EMBED_FIELD_VALUE_LIMIT - 10)}\n\`\`\``,
      inline: false,
    });
  }

  return {
    embeds: [
      {
        title: `${options.status}: ${project} · ${options.duration}`,
        description: options.summary
          ? truncate(String(options.summary), DISCORD_EMBED_DESCRIPTION_LIMIT)
          : undefined,
        color: options.status.includes("⚠️") ? 0xf1c40f : 0x2ecc71,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}
