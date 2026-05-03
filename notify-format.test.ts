import { describe, expect, test } from "bun:test";
import {
  buildAgentEndDiscordPayload,
  detectNeedsInput,
  extractAssistantText,
  getAgentEndStatus,
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

  test("detects assistant endings that need user input", () => {
    expect(
      detectNeedsInput(
        "Before I continue, should I:\n1. Continue here\n2. Include the file\n3. Stop first",
      ),
    ).toBe(true);
    expect(detectNeedsInput("Should I continue here or stop first?")).toBe(true);
  });

  test("does not flag normal completion or incidental questions", () => {
    expect(detectNeedsInput("Done. Tests passed.")).toBe(false);
    expect(detectNeedsInput("Implemented Discord embeds.")).toBe(false);
    expect(detectNeedsInput("The README asks, \"What is Pi?\" in the intro.")).toBe(false);
  });

  test("classifies needs-input endings separately from completion and review states", () => {
    expect(
      getAgentEndStatus({
        summary: "Before I continue, should I:\n1. Continue\n2. Stop",
        errors: null,
        interrupted: false,
        riskyCommandSeen: false,
        attentionPinged: false,
      }),
    ).toBe("⚠️ Pi needs your input");

    expect(
      getAgentEndStatus({
        summary: "Done. Tests passed.",
        errors: null,
        interrupted: false,
        riskyCommandSeen: false,
        attentionPinged: false,
      }),
    ).toBe("✅ Pi finished");

    expect(
      getAgentEndStatus({
        summary: "Done.",
        errors: "boom",
        interrupted: false,
        riskyCommandSeen: false,
        attentionPinged: false,
      }),
    ).toBe("⚠️ Pi finished and may need review");
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

  test("formats needs-input notifications as warning embeds", () => {
    const payload = buildAgentEndDiscordPayload({
      status: "⚠️ Pi needs your input",
      projectPath: String.raw`C:\Users\merli\.pi\agent\extensions\pi-agent-notify`,
      duration: "27s",
      summary: "Before I create the plan, should I:\n1. Continue\n2. Stop",
      riskyCommandSeen: false,
      interrupted: false,
      errors: null,
    });

    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds?.[0].title).toBe("⚠️ Pi needs your input: pi-agent-notify · 27s");
    expect(payload.embeds?.[0].description).toBe(
      "Before I create the plan, should I:\n1. Continue\n2. Stop",
    );
    expect(payload.embeds?.[0].color).toBe(0xf1c40f);
  });
});
