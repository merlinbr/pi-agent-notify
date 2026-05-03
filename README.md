# pi-agent-notify

Notification extension for the [Pi coding agent](https://github.com/badlogic/pi-mono) so Pi can notify you when it needs attention, is blocked, or finishes important work.

Currently supported provider:

- Discord webhooks

Planned/future providers could include Telegram, Slack, email, desktop notifications, etc.

## Current commands

This first version is still Discord-specific internally:

```text
/discord-notify setup
/discord-notify test
/discord-notify status
/discord-notify clear
```

Available tool:

```text
notify_discord
```

You can ask Pi things like:

```text
Notify me on Discord when the tests finish.
```

or:

```text
Send me a Discord notification if you get blocked.
```

## Install

Pi auto-loads extensions from:

```text
~/.pi/agent/extensions/*.ts
```

So the easiest install is to copy `notify.ts` and `notify-format.ts` to:

```text
~/.pi/agent/extensions/notify.ts
~/.pi/agent/extensions/notify-format.ts
```

Then restart Pi or run inside Pi:

```text
/reload
```

### Important note when developing from this repo

If this repository itself is placed inside `~/.pi/agent/extensions/pi-agent-notify/`, Pi will **not** auto-load `notify.ts` from that subfolder unless it is named `index.ts`.

Valid options:

1. Copy/symlink the files to the top-level extensions folder:

   ```text
   ~/.pi/agent/extensions/notify.ts
   ~/.pi/agent/extensions/notify-format.ts
   ```

2. Or rename/copy it inside the repo as:

   ```text
   ~/.pi/agent/extensions/pi-agent-notify/index.ts
   ```

## Setup

Run this inside Pi:

```text
/discord-notify setup
```

Paste your Discord webhook URL when prompted.

Then test it:

```text
/discord-notify test
```

You can check configuration with:

```text
/discord-notify status
```

To remove the saved webhook:

```text
/discord-notify clear
```

## Discord webhook URL

To create a Discord webhook:

1. Open your Discord server.
2. Go to the channel where notifications should appear.
3. Open **Edit Channel**.
4. Go to **Integrations**.
5. Create or copy a webhook.
6. Paste that URL into `/discord-notify setup`.

The URL usually looks like:

```text
https://discord.com/api/webhooks/...
```

## Configuration

The extension looks for the webhook in this order:

1. Environment variable:

   ```text
   PI_DISCORD_WEBHOOK_URL
   ```

2. Saved config file:

   ```text
   ~/.pi/agent/discord-notify.json
   ```

Using `/discord-notify setup` writes the config file for you, so you do not need to set environment variables in Bash, PowerShell, Windows, Linux, or macOS.

## Behavior

The extension can notify when:

- Pi finishes a task
- Pi may need your attention
- Pi is blocked
- Pi is about to run a potentially risky command
- You explicitly ask Pi to send a notification

If Discord is not configured yet, automatic notifications are skipped silently so normal Pi conversations are not interrupted.

Explicit commands like `/discord-notify test` or the `notify_discord` tool will tell you when setup is missing.

## Safety/error handling

Discord requests are wrapped in error handling so a missing or broken webhook should not crash or freeze Pi.

Webhook requests also use a timeout to avoid waiting forever on network issues.

## Development roadmap

Possible next steps:

- Rename user-facing command from `/discord-notify` to provider-neutral `/notify`
- Rename tool from `notify_discord` to `notify_user` or `send_notification`
- Add provider selection
- Add Telegram provider
- Add Slack provider
- Add per-project notification config
- Package for easier Pi installation

## License

MIT License. See [LICENSE](LICENSE).
