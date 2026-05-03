import { describe, expect, test } from "bun:test";
import {
  buildAgentEndDiscordPayload,
  extractAssistantText,
  getProjectName,
} from "./notify-format";

describe("notification formatting", () => {
  test("uses the last path segment as the project name", () => {
    expect(getProjectName(String.raw`C:\Users\merli\.pi\agent\extensions\pi-agent-notify`)).toBe(
      "pi-agent-notify",
    );
  });

  test("extracts the final assistant text from agent_end messages", () => {
    const text = extractAssistantText([
      { role: "user", content: [{ type: "text", text: "do thing" }] },
      { role: "assistant", content: [{ type: "text", text: "First answer" }] },
      { role: "toolResult", content: [{ type: "text", text: "ok" }] },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "Final " },
          { type: "text", text: "answer" },
        ],
      },
    ]);

    expect(text).toBe("Final answer");
  });

  test("builds a Discord embed card for agent completion", () => {
    const payload = buildAgentEndDiscordPayload({
      status: "✅ Pi finished",
      projectPath: String.raw`C:\Users\merli\.pi\agent\extensions\pi-agent-notify`,
      duration: "12s",
      summary: "Implemented Discord embeds.",
      riskyCommandSeen: false,
      interrupted: false,
      errors: null,
    });

    expect(payload.content).toBeUndefined();
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toBe("✅ Pi finished: pi-agent-notify · 12s");
    expect(payload.embeds[0].description).toBe("Implemented Discord embeds.");
    expect(payload.embeds[0].color).toBe(0x2ecc71);
    expect(payload.embeds[0].fields).toEqual([
      {
        name: "Path",
        value: String.raw`C:\Users\merli\.pi\agent\extensions\pi-agent-notify`,
        inline: false,
      },
    ]);
  });
});
