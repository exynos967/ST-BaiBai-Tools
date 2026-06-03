# 柏宝箱

This extension packages a small set of SillyTavern responsiveness fixes as a third-party extension.

What it does:

- Guards `AutoComplete` reposition work so inactive instances do not recompute layout on every mobile `resize`
- Replaces the stock `power-user` window `resize` handler with a version that exits early on mobile before expensive autocomplete and hotswap refresh work runs
- Speeds up opening the chat file manager for normal character chats by rendering a lightweight file-name list first, then using one full metadata request to fill in file size, message count, date, and preview text
- Speeds up prompt preset toggles and saves by updating only the affected prompt row immediately, then refreshing token counts after a short debounce instead of rebuilding the whole prompt list on every click
- Adds a SillyTavern extension settings panel with separate switches for the input responsiveness and chat file manager optimizations

The chat file manager optimization only applies when:

- the request is for `/api/chats/search`
- the search query is empty
- the current target is a normal character chat, not a group chat

Keyword searches and group chats fall back to SillyTavern's original `/api/chats/search` behavior.

The prompt preset quick-operation optimization only applies to existing rows in the OpenAI/chat-completion prompt manager list. New prompt creation still falls back to SillyTavern's original behavior because it changes the available prompt list. The feature switch preserves SillyTavern's original behavior when disabled.

For local testing inside this repository, the extension can live under:

- `public/scripts/extensions/third-party/SillyTavern-Mobile-Resize-Guard`

For end-user Git installation through SillyTavern's third-party extension installer, publish the contents of this folder at the root of a separate repository so that `manifest.json` is at the repository root.
