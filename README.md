# Notion Like Editor

An Obsidian plugin that brings Notion-like interactions to Markdown notes:

- Multi-column blocks rendered from a `columns` code block, with drag-to-reorder (and write-back to the source Markdown)
- A Notion-style slash menu (type `/` to open, filter by keyword, press Enter to insert)
- A selection toolbar (format toggles + text/background colors + clear styles)

> Note: This plugin stores everything as **Markdown**. It does not convert your notes into a Notion block database.

---

## Features

### 1) Columns (drag-to-reorder)

- Renders `columns` code blocks as a 2–4 column layout in Reading/Preview
- Drag columns to reorder
- After dragging, automatically writes the new order back into the source Markdown by replacing the corresponding ` ```columns ` block

### 2) Slash Menu

- Type `/` in the editor to open the menu
- Keep typing to filter items by keyword
- Keyboard controls: `↑/↓` to navigate, `Enter` to insert, `Esc` to close
- After inserting an item, the cursor is placed where you can type immediately (e.g., after `# ` for headings, between backticks for inline code)

Built-in items include:

- Text
- Heading 1–4
- Bullet list / Ordered list / To-do
- Quote
- Inline code / Code block
- Highlight
- Link
- Page reference (Wiki link, `[[...]]`)
- Table

### 3) Selection Toolbar

- Shows a floating toolbar above the selection when text is selected
- Supports common formatting: bold, italic, strikethrough, inline code, highlight, link, wiki link, headings, lists, to-do, quote
- Color actions: text color and background color (preset colors)
- Clear action: removes the `<span style="...">...</span>` wrapper inserted by this plugin

---

## Installation

### Community Plugins (recommended)

Once this plugin is available in Obsidian Community Plugins:

1. Open Obsidian → **Settings** → **Community plugins**
2. Disable **Safe mode** (if enabled)
3. Click **Browse** and search for `Notion Like Editor`
4. Install and enable the plugin

### Manual installation (development/testing)

1. Download the release ZIP (should include `manifest.json`, `main.js`, `styles.css`)
2. Extract to: `Vault/.obsidian/plugins/notion-like-editor/`
3. Restart Obsidian (or reload plugins)
4. Enable `Notion Like Editor` in **Community plugins**

---

## Usage

### A. Columns

Insert a `columns` code block in a note:

```md
```columns 2
Left column content
--- column ---
Right column content
```
```

- Replace `2` with `3` or `4`
- Use `--- column ---` to separate columns
- In Reading/Preview you can drag columns to reorder; the plugin writes the new order back to the source Markdown

You can also insert templates via Command Palette:

- `Insert 2-column block`
- `Insert 3-column block`
- `Insert 4-column block`

### B. Slash Menu

1. Type `/` in the editor to open the menu
2. Keep typing to filter (e.g., `/table`)
3. Use the keyboard:
   - `↑/↓` to navigate
   - `Enter` to insert
   - `Esc` to close

**Cursor placement examples**:

- Headings: inserts `# ` / `## ` / `### ` / `#### ` and places the cursor right after the prefix
- Inline code: inserts `````` and places the cursor between the backticks
- Wiki link: inserts `[[]]` and places the cursor between the brackets
- Link: inserts `[](https://)` and places the cursor inside `[]`

### C. Selection Toolbar

1. Select text in the editor
2. A toolbar appears above the selection
3. Click buttons to apply formatting or colors

About colors:

- Text/background colors are implemented by inserting inline HTML: `<span style="...">...</span>`
- **Clear** tries to remove the enclosing `<span style="...">...</span>` wrapper (i.e. reset styles)

---

## Settings

Go to **Settings → Community plugins → Notion Like Editor** and toggle:

- Enable Columns
- Enable Slash Menu
- Enable Selection Toolbar

---

## Compatibility & Known Limitations

- Targeting Obsidian `1.5.0+`
- Column drag write-back replaces the corresponding ` ```columns ` block; after reordering, quickly review the block if you use very complex nested content
- Color features use inline HTML (`<span style="...">...</span>`):
  - Usually renders fine in Reading view
  - Some themes/plugins may style or restrict HTML differently

---

## Development

This repository currently keeps the plugin in a “ready-to-ship” structure:

- `main.js` — plugin logic
- `styles.css` — styles
- `manifest.json` — plugin manifest

If you want a TypeScript + build pipeline (esbuild) setup, you can layer it on top of this.

---

## License

See `LICENSE`.
