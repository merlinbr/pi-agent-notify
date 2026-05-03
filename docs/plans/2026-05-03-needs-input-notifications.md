# Needs-Input Notifications Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add a distinct "needs input" end state so Discord notifications do not report `✅ Pi finished` when the final assistant message is actually waiting on a user decision.

**Architecture:** Keep the existing `agent_end` notification flow, but insert a message-classification step before status selection. Start with hybrid/extensible heuristics: implement a dedicated detector for user-input-needed phrasing now, and keep its interface narrow so it can later accept stronger Pi-native signals if they become available.

**Tech Stack:** TypeScript, Bun tests, Pi extension hooks, Discord webhook payload formatting

---

### Task 1: Add failing tests for needs-input detection heuristics

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Modify: `notify-format.test.ts`
- Test: `notify-format.test.ts`

**Step 1: Write the failing test**

Add focused tests for a new detection helper, covering at least:
- explicit question + options (`"should I"`, numbered choices)
- continuation gating (`"before I continue"`)
- negative control for normal completion (`"Done."`, `"Implemented X."`)
- negative control for informational text containing a question mark in a non-decision context if practical

Example shape:
```ts
expect(detectNeedsInput("Before I continue, should I:\n1. A\n2. B\n3. C")).toBe(true);
expect(detectNeedsInput("Done. Tests passed.")).toBe(false);
```

**Step 2: Run test to verify it fails**

Run: `bun test notify-format.test.ts`
Expected: FAIL because `detectNeedsInput` does not exist yet.

**Step 3: Write minimal implementation**

Do not implement here beyond the smallest stub needed to keep the compiler/test runner moving if required.

**Step 4: Run test to verify it passes/fails for the right reason**

Run: `bun test notify-format.test.ts`
Expected: still FAIL, but now specifically on heuristic behavior until real logic exists.

**Step 5: Commit**

```bash
git add notify-format.test.ts
git commit -m "test: add needs-input detection cases"
```

### Task 2: Implement an extensible needs-input detector

**TDD scenario:** New feature — full TDD cycle

**Files:**
- Modify: `notify-format.ts`
- Test: `notify-format.test.ts`

**Step 1: Write the failing test**

If needed, add or refine tests so the detector API is explicit. Prefer a narrow helper such as:
```ts
export function detectNeedsInput(summary: string | undefined): boolean
```
Optionally add a richer internal classifier later, but keep the exported surface simple for now.

**Step 2: Run test to verify it fails**

Run: `bun test notify-format.test.ts`
Expected: FAIL on missing or incorrect detection behavior.

**Step 3: Write minimal implementation**

Implement a conservative-but-useful heuristic in `notify-format.ts`, for example:
- normalize whitespace/case
- return `false` for empty text
- return `true` for strong phrases like:
  - `should i`
  - `before i continue`
  - `which would you like`
  - `do you want me to`
  - `please choose`
  - `pick one`
- increase confidence when question-like phrasing appears alongside numbered/bulleted options
- avoid classifying every `?` as needs-input by itself

Keep the logic isolated in one helper so later replacement with Pi-native metadata is easy.

**Step 4: Run test to verify it passes**

Run: `bun test notify-format.test.ts`
Expected: PASS for all new detection cases.

**Step 5: Commit**

```bash
git add notify-format.ts notify-format.test.ts
git commit -m "feat: detect needs-input assistant endings"
```

### Task 3: Wire needs-input into agent_end status selection

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `notify.ts`
- Modify: `notify-format.test.ts`
- Test: `notify-format.test.ts`

**Step 1: Write the failing test**

Add a payload/status-oriented test that proves a needs-input summary produces a non-success notification state. If direct `agent_end` event testing is cumbersome, test the smallest extractable status-selection helper instead.

Preferred direction:
- extract a small pure helper from `notify.ts`, e.g. `getAgentEndStatus(...)`
- test that needs-input produces a warning-style status string
- test that ordinary completion still returns `✅ Pi finished`

Example expectation:
```ts
expect(getAgentEndStatus({ summary: "Before I continue, should I...", errors: null, interrupted: false, riskyCommandSeen: false, attentionPinged: false })).toBe("⚠️ Pi needs your input");
```

**Step 2: Run test to verify it fails**

Run: `bun test notify-format.test.ts`
Expected: FAIL because status selection does not yet account for needs-input.

**Step 3: Write minimal implementation**

Update `notify.ts` so `agent_end` computes:
- `needsInput` from the final assistant summary
- `needsAttention` if any of:
  - explicit attention already pinged
  - risky command seen
  - errors
  - interruption
  - needsInput

Prefer three human-readable states in practice even if only two colors are used initially:
- `✅ Pi finished`
- `⚠️ Pi needs your input`
- `⚠️ Pi finished and may need review`

Order precedence carefully:
1. blocked/error/interrupted/risky review states
2. needs-input state
3. clean completion

If you extract a helper, keep it pure and unit-testable.

**Step 4: Run test to verify it passes**

Run: `bun test notify-format.test.ts`
Expected: PASS with the new needs-input status behavior.

**Step 5: Commit**

```bash
git add notify.ts notify-format.test.ts
git commit -m "feat: send needs-input completion status"
```

### Task 4: Reflect the new state in Discord payload formatting

**TDD scenario:** Modifying tested code — run existing tests first

**Files:**
- Modify: `notify-format.ts`
- Modify: `notify-format.test.ts`
- Test: `notify-format.test.ts`

**Step 1: Write the failing test**

Add a formatting test ensuring a needs-input status gets warning styling in the embed title/color and preserves the assistant summary.

Example:
```ts
const payload = buildAgentEndDiscordPayload({
  status: "⚠️ Pi needs your input",
  projectPath: "...",
  duration: "27s",
  summary: "Before I create the plan, should I...",
});
expect(payload.embeds?.[0].title).toContain("⚠️ Pi needs your input");
expect(payload.embeds?.[0].color).toBe(0xf1c40f);
```

**Step 2: Run test to verify it fails**

Run: `bun test notify-format.test.ts`
Expected: FAIL if formatting assumptions are not yet covered correctly.

**Step 3: Write minimal implementation**

Adjust payload formatting only as needed. Current color selection based on warning emoji may already work; if so, keep changes minimal and focus on ensuring the title/status text is correct.

**Step 4: Run test to verify it passes**

Run: `bun test notify-format.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add notify-format.ts notify-format.test.ts
git commit -m "test: cover needs-input notification formatting"
```

### Task 5: Update documentation for the new lifecycle state

**TDD scenario:** Trivial change — use judgment

**Files:**
- Modify: `README.md`

**Step 1: Write the docs change**

Update the behavior section to explain that automatic notifications now distinguish:
- task finished
- needs user input
- may need review / blocked attention

Include one brief example of the needs-input case.

**Step 2: Verify docs accuracy against implementation**

Read the changed sections and confirm they match the actual status strings and behavior.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe needs-input notifications"
```

### Task 6: Run full verification before completion

**TDD scenario:** Modifying tested code — run verification before claiming success

**Files:**
- Modify: none
- Test: `notify-format.test.ts`

**Step 1: Run targeted tests**

Run: `bun test notify-format.test.ts`
Expected: PASS

**Step 2: Run broader test sweep if available**

Run: `bun test`
Expected: PASS for the repository test suite

**Step 3: Manual behavior check**

Use a representative summary string from the real-world case and verify the resulting status is `⚠️ Pi needs your input` rather than `✅ Pi finished`.

Suggested sample:
```text
I see an untracked file: docs/plans/2026-05-03-real-ticker-detail-pages.md.

Before I create the Phase 9 dashboard build-out plan, should I:
1. Continue here and leave that file alone
2. Include/review that file as prior Phase 9 context
3. Stop so you can clean it up first
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: verify needs-input notification behavior"
```
