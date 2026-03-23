const {
  Plugin,
  PluginSettingTab,
  Setting,
  Notice,
  MarkdownView,
  MarkdownRenderer,
  Component,
  TFile
} = require("obsidian");

const DEFAULT_SETTINGS = {
  enableColumns: true,
  enableSlashMenu: true,
  enableSelectionToolbar: true
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function normalizeQuery(s) {
  return (s ?? "").trim().toLowerCase();
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function tryGetEditorView(editor) {
  const cm = editor?.cm;
  if (cm && typeof cm.coordsAtPos === "function" && cm.state?.doc) return cm;
  return null;
}

function cmPosFromEditorCursor(cm, cursor) {
  const line = cm.state.doc.line(cursor.line + 1);
  return line.from + cursor.ch;
}

function rectFromCmPos(cm, pos) {
  try {
    const r = cm.coordsAtPos(pos);
    if (!r) return null;
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  } catch {
    return null;
  }
}

function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    left: Math.min(a.left, b.left),
    right: Math.max(a.right, b.right),
    top: Math.min(a.top, b.top),
    bottom: Math.max(a.bottom, b.bottom)
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ICON_SVG = {
  text: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6" /><path d="M12 9v8" /></svg>`,
  heading: (n) => {
    const label = `H${n}`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><text x="7" y="16">${escapeHtml(label)}</text></svg>`;
  },
  ul: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h12" /><path d="M9 12h12" /><path d="M9 17h12" /><path d="M5.5 7h.01" /><path d="M5.5 12h.01" /><path d="M5.5 17h.01" /></svg>`,
  ol: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7h11" /><path d="M10 12h11" /><path d="M10 17h11" /><path d="M4 7h2" /><path d="M4 12h2" /><path d="M4 17h2" /><path d="M6 7v0" /></svg>`,
  todo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h12" /><path d="M9 12h12" /><path d="M9 17h12" /><rect x="4" y="6" width="3" height="3" rx="0.6" /><rect x="4" y="11" width="3" height="3" rx="0.6" /><rect x="4" y="16" width="3" height="3" rx="0.6" /></svg>`,
  quote: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11c0-2 1.2-3.6 3-4" /><path d="M7 11c0 2 .8 3 3 3" /><path d="M14 11c0-2 1.2-3.6 3-4" /><path d="M14 11c0 2 .8 3 3 3" /></svg>`,
  code: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l-5-6 5-6" /><path d="M15 6l5 6-5 6" /><path d="M13 5l-2 14" /></svg>`,
  codeBlock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M10 10l-2 2 2 2" /><path d="M14 10l2 2-2 2" /></svg>`,
  highlight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h8" /><path d="M14 4l6 6" /><path d="M13 5l-7 7 6 6 7-7" /></svg>`,
  link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" /><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" /></svg>`,
  pageRef: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H8a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9z" /><path d="M14 3v6h6" /><path d="M10 14h8" /><path d="M14 10l4 4-4 4" /></svg>`,
  table: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16" /><path d="M4 14h16" /><path d="M10 5v14" /><path d="M14 5v14" /></svg>`,
  divider: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>`
};

function iconHtml(name, ...args) {
  const v = ICON_SVG[name];
  if (typeof v === "function") return v(...args);
  return v ?? "";
}

class NotionLikeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("启用拖拽分栏")
      .setDesc("支持 `columns` 代码块渲染与拖拽调整列顺序")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableColumns)
          .onChange(async (v) => {
            this.plugin.settings.enableColumns = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("启用斜杠菜单")
      .setDesc("输入 / 后按关键词过滤，回车插入")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSlashMenu)
          .onChange(async (v) => {
            this.plugin.settings.enableSlashMenu = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("启用选区工具栏")
      .setDesc("选中文本后显示悬浮格式工具栏")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSelectionToolbar)
          .onChange(async (v) => {
            this.plugin.settings.enableSelectionToolbar = v;
            await this.plugin.saveSettings();
          })
      );
  }
}

module.exports = class NotionLikeEditorPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.slashMenuEl = null;
    this.slashHintEl = null;
    this.selectionBarEl = null;
    this.selectionColorPopoverEl = null;
    this.selectionColorPopoverKind = null;
    this.selectionColorState = { tc: null, bg: null };
    this.slashState = null;
    this.slashDismiss = null;
    this.lastActiveEditor = null;
    this.columnSourceByEl = new WeakMap();

    this.addSettingTab(new NotionLikeSettingTab(this.app, this));

    this.addCommand({
      id: "nst-insert-columns-2",
      name: "插入 2 分栏块",
      callback: () => this.insertColumnsBlock(2)
    });
    this.addCommand({
      id: "nst-insert-columns-3",
      name: "插入 3 分栏块",
      callback: () => this.insertColumnsBlock(3)
    });
    this.addCommand({
      id: "nst-insert-columns-4",
      name: "插入 4 分栏块",
      callback: () => this.insertColumnsBlock(4)
    });

    this.addRibbonIcon("layout-grid", "Notion Like Editor", () => {
      new Notice("输入 / 打开菜单；选中文本显示格式工具栏；使用 ```columns N 分栏");
    });

    this.registerDomEvent(window, "resize", () => {
      this.positionSlashMenu();
      this.positionSlashHint();
      this.positionSelectionBar();
      this.positionSelectionColorPopover();
    });
    this.registerDomEvent(window, "scroll", () => {
      this.positionSlashMenu();
      this.positionSlashHint();
      this.positionSelectionBar();
      this.positionSelectionColorPopover();
    }, true);

    this.registerDomEvent(window, "keydown", (evt) => {
      if (evt.key === "Escape" || evt.key === "Esc") {
        this.dismissSlashMenu();
        this.hideSelectionBar();
      }
    }, true);

    this.registerDomEvent(document, "keydown", (evt) => {
      if (evt.key === "Escape" || evt.key === "Esc") {
        this.dismissSlashMenu();
        this.hideSelectionBar();
      }
    });

    this.registerDomEvent(document, "click", (evt) => {
      const t = evt.target;
      if (this.slashMenuEl && t instanceof Node && this.slashMenuEl.contains(t)) return;
      if (this.selectionBarEl && t instanceof Node && this.selectionBarEl.contains(t)) return;
      if (this.selectionColorPopoverEl && t instanceof Node && this.selectionColorPopoverEl.contains(t)) return;
      this.dismissSlashMenu();
      this.hideSelectionBar();
    });

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor) => {
        this.lastActiveEditor = editor;
        this.onEditorChange(editor);
      })
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.editor) this.lastActiveEditor = view.editor;
      })
    );

    this.registerInterval(window.setInterval(() => {
      const editor = this.lastActiveEditor ?? this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
      if (!editor) return;
      this.lastActiveEditor = editor;
      this.onEditorChange(editor);
    }, 120));

    if (this.settings.enableColumns) {
      this.registerMarkdownCodeBlockProcessor("columns", async (src, el, ctx) => {
        await this.renderColumnsBlock(src, el, ctx);
      });
    }
  }

  onunload() {
    this.hideSlashMenu();
    this.hideSelectionBar();
    this.hideSelectionColorPopover();
  }

  buildColorPickerHtml() {
    const theme = [
      "#000000", "#f2f2f2", "#1f4e79", "#2b6cb0", "#c05621", "#2f855a", "#6b46c1", "#0f7b6c", "#e03e3e",
      "#434343", "#d9d9d9", "#17365d", "#1e4e8c", "#7b341e", "#276749", "#44337a", "#0b5d51", "#9b2c2c",
      "#666666", "#bfbfbf", "#0f2f4b", "#153e75", "#652b19", "#22543d", "#322659", "#08443a", "#742a2a",
      "#999999", "#a6a6a6", "#0b2234", "#1a365d", "#4a1d0a", "#1c4532", "#2a2141", "#063a32", "#5a1f1f"
    ];
    const standard = ["#ff0000", "#ff9900", "#ffff00", "#99cc00", "#00cc66", "#00cccc", "#00a2ff", "#0047ff", "#0000ff", "#9900ff"];
    const custom = ["#f79646", "#4f81bd", "#8064a2", "#7f7f7f"];

    const swatchBtn = (c) =>
      `<button class="nst-swatch" data-color="${escapeHtml(c)}" style="background:${escapeHtml(c)};--c:${escapeHtml(c)}"></button>`;

    return `
      <div class="nst-color-panel">
        <div class="nst-color-title">Theme Colors</div>
        <div class="nst-color-grid">${theme.map(swatchBtn).join("")}</div>
        <div class="nst-color-title">Standard Colors</div>
        <div class="nst-color-row">${standard.map(swatchBtn).join("")}</div>
        <div class="nst-color-title">Custom Font Colors</div>
        <div class="nst-color-row">${custom.map(swatchBtn).join("")}</div>
        <div class="nst-color-actions">
          <button class="nst-color-action" disabled aria-disabled="true">🧪</button>
          <button class="nst-color-action" disabled aria-disabled="true">🎨</button>
        </div>
      </div>
    `;
  }

  ensureSelectionColorPopover() {
    if (this.selectionColorPopoverEl) return this.selectionColorPopoverEl;
    const el = document.createElement("div");
    el.className = "nst-color-popover";
    el.style.display = "none";
    el.innerHTML = this.buildColorPickerHtml();
    document.body.appendChild(el);
    this.selectionColorPopoverEl = el;

    el.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
    });

    el.addEventListener("click", (evt) => {
      const t = evt.target;
      if (!(t instanceof HTMLElement)) return;
      const btn = t.closest(".nst-swatch");
      if (!(btn instanceof HTMLElement)) return;
      const color = btn.getAttribute("data-color");
      const kind = this.selectionColorPopoverKind;
      const editor = this.lastActiveEditor;
      if (!color || !kind || !editor) return;
      if (kind === "tc") {
        this.selectionColorState.tc = color;
        this.applySpanStyle(editor, { color });
      }
      if (kind === "bg") {
        this.selectionColorState.bg = color;
        this.applySpanStyle(editor, { background: color });
      }
      this.updateSelectionColorButtons();
      this.hideSelectionColorPopover();
    });

    return el;
  }

  showSelectionColorPopover(kind) {
    if (!this.selectionBarEl) return;
    const el = this.ensureSelectionColorPopover();
    this.selectionColorPopoverKind = kind;
    el.setAttribute("data-kind", kind);
    el.style.display = "block";
    this.positionSelectionColorPopover();
    this.updateSelectionColorButtons();
  }

  hideSelectionColorPopover() {
    if (!this.selectionColorPopoverEl) return;
    this.selectionColorPopoverEl.style.display = "none";
    this.selectionColorPopoverKind = null;
    this.updateSelectionColorButtons();
  }

  toggleSelectionColorPopover(kind) {
    if (!this.selectionColorPopoverEl || this.selectionColorPopoverEl.style.display === "none") {
      this.showSelectionColorPopover(kind);
      return;
    }
    if (this.selectionColorPopoverKind === kind) {
      this.hideSelectionColorPopover();
      return;
    }
    this.showSelectionColorPopover(kind);
  }

  positionSelectionColorPopover() {
    if (!this.selectionBarEl || !this.selectionColorPopoverEl || this.selectionColorPopoverEl.style.display === "none") return;
    const kind = this.selectionColorPopoverKind;
    if (!kind) return;

    const trigger = this.selectionBarEl.querySelector(kind === "tc" ? '[data-act="tc-menu"]' : '[data-act="bg-menu"]');
    if (!(trigger instanceof HTMLElement)) return;
    const rect = trigger.getBoundingClientRect();

    const pop = this.selectionColorPopoverEl;
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    let top = rect.bottom + 8;

    left = clamp(left, 8, Math.max(8, vw - popRect.width - 8));
    if (top + popRect.height > vh - 8) {
      top = clamp(rect.top - popRect.height - 8, 8, vh - popRect.height - 8);
    }

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  updateSelectionColorButtons() {
    if (!this.selectionBarEl) return;
    const tc = this.selectionBarEl.querySelector('[data-act="tc-menu"]');
    const bg = this.selectionBarEl.querySelector('[data-act="bg-menu"]');
    const open = this.selectionColorPopoverEl && this.selectionColorPopoverEl.style.display !== "none";
    const kind = open ? this.selectionColorPopoverKind : null;
    if (tc instanceof HTMLElement) tc.classList.toggle("is-active", kind === "tc");
    if (bg instanceof HTMLElement) bg.classList.toggle("is-active", kind === "bg");
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  getSlashItems() {
    return [
      {
        id: "text",
        section: "基本区块",
        label: "文本",
        iconHtml: iconHtml("text"),
        shortcut: "",
        keywords: ["text", "文本"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
        }
      },
      {
        id: "h1",
        section: "基本区块",
        label: "标题 1",
        iconHtml: iconHtml("heading", 1),
        shortcut: "#",
        keywords: ["h1", "标题", "heading"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "# ");
        }
      },
      {
        id: "h2",
        section: "基本区块",
        label: "标题 2",
        iconHtml: iconHtml("heading", 2),
        shortcut: "##",
        keywords: ["h2", "标题", "heading"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "## ");
        }
      },
      {
        id: "h3",
        section: "基本区块",
        label: "标题 3",
        iconHtml: iconHtml("heading", 3),
        shortcut: "###",
        keywords: ["h3", "标题", "heading"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "### ");
        }
      },
      {
        id: "h4",
        section: "基本区块",
        label: "标题 4",
        iconHtml: iconHtml("heading", 4),
        shortcut: "####",
        keywords: ["h4", "标题", "heading"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "#### ");
        }
      },
      {
        id: "ul",
        section: "基本区块",
        label: "项目符号列表",
        iconHtml: iconHtml("ul"),
        shortcut: "-",
        keywords: ["ul", "bullet", "list", "无序", "项目符号"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "- ");
        }
      },
      {
        id: "ol",
        section: "基本区块",
        label: "有序列表",
        iconHtml: iconHtml("ol"),
        shortcut: "1.",
        keywords: ["ol", "ordered", "list", "有序"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "1. ");
        }
      },
      {
        id: "todo",
        section: "基本区块",
        label: "待办事项",
        iconHtml: iconHtml("todo"),
        shortcut: "- [ ]",
        keywords: ["todo", "task", "checkbox", "待办", "任务"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "- [ ] ");
        }
      },
      {
        id: "quote",
        section: "基本区块",
        label: "引用",
        iconHtml: iconHtml("quote"),
        shortcut: ">",
        keywords: ["quote", "blockquote", "引用"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.applyLinePrefixAndPlaceCursor(editor, "> ");
        }
      },
      {
        id: "inline-code",
        section: "基本区块",
        label: "代码",
        iconHtml: iconHtml("code"),
        shortcut: "` `",
        keywords: ["code", "inline", "代码", "行内"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.wrapOrInsertAndPlaceCursor(editor, "`", "`", { placeholder: "", cursorOffset: 1 });
        }
      },
      {
        id: "formula",
        section: "基本区块",
        label: "公式",
        icon: "√x",
        shortcut: "$$",
        keywords: ["math", "formula", "latex", "katex", "公式"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.insertMathBlock(editor);
        }
      },
      {
        id: "code-block",
        section: "基本区块",
        label: "代码块",
        iconHtml: iconHtml("codeBlock"),
        shortcut: "```",
        keywords: ["codeblock", "code block", "代码块", "fence"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.insertFencedCodeBlock(editor);
        }
      },
      {
        id: "highlight",
        section: "基本区块",
        label: "高亮",
        iconHtml: iconHtml("highlight"),
        shortcut: "== ==",
        keywords: ["highlight", "mark", "高亮"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.wrapOrInsertAndPlaceCursor(editor, "==", "==", { placeholder: "", cursorOffset: 2 });
        }
      },
      {
        id: "link",
        section: "基本区块",
        label: "链接",
        iconHtml: iconHtml("link"),
        shortcut: "[ ]( )",
        keywords: ["link", "url", "链接"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.insertMarkdownLinkAndPlaceCursor(editor);
        }
      },
      {
        id: "page-ref",
        section: "基本区块",
        label: "页面引用",
        iconHtml: iconHtml("pageRef"),
        shortcut: "[[ ]]",
        keywords: ["page", "ref", "reference", "页面", "引用", "wiki"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          this.insertWikiLinkAndPlaceCursor(editor);
        }
      },
      {
        id: "table",
        section: "基本区块",
        label: "表格",
        iconHtml: iconHtml("table"),
        shortcut: "|",
        keywords: ["table", "grid", "表格"],
        apply: (editor) => {
          this.deleteSlashTriggerText(editor);
          editor.replaceSelection("| 列 1 | 列 2 |\n| --- | --- |\n| 值 1 | 值 2 |\n");
        }
      }
    ];
  }

  applyLinePrefixAndPlaceCursor(editor, prefix) {
    const sel = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (sel && from.line !== to.line) {
      this.applyLinePrefix(editor, prefix);
      return;
    }

    const lineNo = from.line;
    const line = editor.getLine(lineNo) ?? "";
    const stripped = line.replace(/^\s+/, "");
    const stripLen = line.length - stripped.length;

    if (!stripped.startsWith(prefix)) {
      editor.replaceRange(prefix, { line: lineNo, ch: stripLen }, { line: lineNo, ch: stripLen });
    }
    editor.setCursor({ line: lineNo, ch: stripLen + prefix.length });
  }

  wrapOrInsertAndPlaceCursor(editor, pre, post, { placeholder, cursorOffset }) {
    const s = editor.getSelection();
    if (s) {
      editor.replaceSelection(pre + s + post);
      return;
    }
    const cur = editor.getCursor();
    const insert = placeholder ? pre + placeholder + post : pre + post;
    editor.replaceSelection(insert);
    editor.setCursor({ line: cur.line, ch: cur.ch + cursorOffset });
  }

  insertMarkdownLinkAndPlaceCursor(editor) {
    const s = editor.getSelection();
    if (s) {
      editor.replaceSelection(`[${s}](https://)`);
      return;
    }
    const cur = editor.getCursor();
    editor.replaceSelection(`[](https://)`);
    editor.setCursor({ line: cur.line, ch: cur.ch + 1 });
  }

  insertWikiLinkAndPlaceCursor(editor) {
    const s = editor.getSelection();
    if (s) {
      editor.replaceSelection(`[[${s}]]`);
      return;
    }
    const cur = editor.getCursor();
    editor.replaceSelection(`[[]]`);
    editor.setCursor({ line: cur.line, ch: cur.ch + 2 });
  }

  onEditorChange(editor) {
    if (!editor) return;

    if (this.settings.enableSlashMenu) {
      this.maybeUpdateSlashMenu(editor);
    } else {
      this.hideSlashMenu();
    }

    if (this.settings.enableSelectionToolbar) {
      if (typeof editor.somethingSelected === "function" && editor.somethingSelected()) {
        this.showSelectionBar(editor);
      } else {
        this.hideSelectionBar();
      }
    } else {
      this.hideSelectionBar();
    }
  }

  maybeUpdateSlashMenu(editor) {
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line) ?? "";

    if (this.slashState) {
      const st = this.slashState;
      const cur = editor.getCursor();
      if (cur.line !== st.triggerPos.line) {
        this.hideSlashMenu();
        return;
      }

      const triggerLine = editor.getLine(st.triggerPos.line) ?? "";
      if (st.triggerPos.ch >= triggerLine.length || triggerLine[st.triggerPos.ch] !== "/") {
        this.hideSlashMenu();
        return;
      }

      if (cur.ch < st.triggerPos.ch + 1) {
        this.hideSlashMenu();
        return;
      }

      const raw = editor.getRange(st.triggerPos, cur);
      if (!raw.startsWith("/")) {
        this.hideSlashMenu();
        return;
      }

      const query = normalizeQuery(raw.slice(1));
      if (query !== st.query) {
        st.query = query;
        st.selectedIndex = 0;
        this.renderSlashMenu(editor);
      }
      this.positionSlashMenu();
      this.updateSlashHint(editor);
      return;
    }

    if (typeof editor.somethingSelected === "function" && editor.somethingSelected()) return;
    if (cursor.ch <= 0) return;
    const left = lineText[cursor.ch - 1];
    if (left !== "/") return;

    if (this.slashDismiss) {
      const d = this.slashDismiss;
      const dismissedSamePos = cursor.line === d.line && cursor.ch === d.chAfter;
      const stillInWindow = Date.now() - d.at < 5000;
      if (dismissedSamePos && stillInWindow) return;
      if (!dismissedSamePos || !stillInWindow) {
        this.slashDismiss = null;
      }
    }

    const beforeSlash = cursor.ch - 2 >= 0 ? lineText[cursor.ch - 2] : "";
    if (beforeSlash && !isWhitespace(beforeSlash)) return;
    this.showSlashMenu(editor, { line: cursor.line, ch: cursor.ch - 1 });
  }

  showSlashMenu(editor, triggerPos) {
    this.hideSlashMenu();

    this.slashMenuEl = document.createElement("div");
    this.slashMenuEl.className = "nst-slash-menu";
    document.body.appendChild(this.slashMenuEl);

    this.slashState = {
      triggerPos,
      query: "",
      selectedIndex: 0,
      visibleItemIds: []
    };

    this.renderSlashMenu(editor);
    this.positionSlashMenu();
    this.updateSlashHint(editor);
    this.attachSlashKeyHandler(editor);
  }

  hideSlashMenu() {
    if (this.slashMenuEl) {
      this.slashMenuEl.remove();
      this.slashMenuEl = null;
    }
    this.hideSlashHint();
    if (this.slashState?.detachKeys) {
      this.slashState.detachKeys();
    }
    this.slashState = null;
  }

  dismissSlashMenu() {
    if (this.slashState) {
      this.slashDismiss = {
        line: this.slashState.triggerPos.line,
        chAfter: this.slashState.triggerPos.ch + 1,
        at: Date.now()
      };
    }
    this.hideSlashMenu();
  }

  ensureSlashHintEl() {
    if (this.slashHintEl) return this.slashHintEl;
    const el = document.createElement("div");
    el.className = "nst-slash-hint";
    el.textContent = "输入以搜索";
    el.style.display = "none";
    document.body.appendChild(el);
    this.slashHintEl = el;
    return el;
  }

  hideSlashHint() {
    if (!this.slashHintEl) return;
    this.slashHintEl.style.display = "none";
  }

  updateSlashHint(editor) {
    if (!this.slashState) {
      this.hideSlashHint();
      return;
    }
    const cur = editor.getCursor?.();
    if (!cur || cur.line !== this.slashState.triggerPos.line || cur.ch !== this.slashState.triggerPos.ch + 1) {
      this.hideSlashHint();
      return;
    }
    if (this.slashState.query) {
      this.hideSlashHint();
      return;
    }
    const el = this.ensureSlashHintEl();
    const ok = this.positionSlashHint(editor);
    el.style.display = ok ? "block" : "none";
  }

  positionSlashHint(editorArg) {
    const editor = editorArg ?? this.lastActiveEditor;
    if (!this.slashState || !editor) return false;
    const el = this.slashHintEl;
    if (!el) return false;

    const cm = tryGetEditorView(editor);
    if (!cm) return false;

    const pos = cmPosFromEditorCursor(cm, {
      line: this.slashState.triggerPos.line,
      ch: this.slashState.triggerPos.ch + 1
    });
    const r = rectFromCmPos(cm, pos);
    if (!r) return false;

    el.style.left = `${Math.round(r.left)}px`;
    el.style.top = `${Math.round(r.top)}px`;
    el.style.height = `${Math.max(0, Math.round(r.bottom - r.top))}px`;
    el.style.lineHeight = el.style.height;
    return true;
  }

  attachSlashKeyHandler(editor) {
    const onKeyDown = (evt) => {
      if (!this.slashState || !this.slashMenuEl) return;
      if (evt.key === "Escape" || evt.key === "Esc" || evt.keyCode === 27) {
        evt.preventDefault();
        evt.stopPropagation();
        this.dismissSlashMenu();
        return;
      }
      if (evt.key === "ArrowDown" || evt.key === "ArrowUp" || evt.key === "Enter") {
        evt.preventDefault();
        evt.stopPropagation();
      }

      if (evt.key === "ArrowDown") {
        this.slashState.selectedIndex = clamp(this.slashState.selectedIndex + 1, 0, Math.max(0, this.slashState.visibleItemIds.length - 1));
        this.updateSlashSelectionDom({ ensureVisible: true });
        return;
      }
      if (evt.key === "ArrowUp") {
        this.slashState.selectedIndex = clamp(this.slashState.selectedIndex - 1, 0, Math.max(0, this.slashState.visibleItemIds.length - 1));
        this.updateSlashSelectionDom({ ensureVisible: true });
        return;
      }
      if (evt.key === "Enter") {
        const itemId = this.slashState.visibleItemIds[this.slashState.selectedIndex];
        if (!itemId) return;
        const item = this.getSlashItems().find((x) => x.id === itemId);
        if (!item) return;
        item.apply(editor);
        this.hideSlashMenu();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    this.slashState.detachKeys = () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }

  updateSlashSelectionDom({ ensureVisible }) {
    if (!this.slashMenuEl || !this.slashState) return;
    const rows = Array.from(this.slashMenuEl.querySelectorAll(".nst-item"));
    rows.forEach((r) => r.classList.remove("is-selected"));
    const selectedId = this.slashState.visibleItemIds[this.slashState.selectedIndex];
    const el = selectedId ? this.slashMenuEl.querySelector(`.nst-item[data-id="${CSS.escape(selectedId)}"]`) : null;
    if (el) {
      el.classList.add("is-selected");
      if (ensureVisible && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    }
  }

  renderSlashMenu(editor) {
    if (!this.slashMenuEl || !this.slashState) return;

    const q = this.slashState.query;
    const items = this.getSlashItems();
    const filtered = q
      ? items.filter((it) => {
          const hay = [it.label, ...(it.keywords ?? [])].join(" ").toLowerCase();
          return hay.includes(q);
        })
      : items;

    const visible = uniqBy(filtered, (x) => x.id);
    this.slashState.visibleItemIds = visible.map((x) => x.id);
    this.slashState.selectedIndex = clamp(this.slashState.selectedIndex, 0, Math.max(0, visible.length - 1));

    const chipText = q ? `${escapeHtml(q)}` : "";

    const bySection = new Map();
    for (const it of visible) {
      const k = it.section || "";
      if (!bySection.has(k)) bySection.set(k, []);
      bySection.get(k).push(it);
    }

    const content = [];
    if (chipText) {
      content.push(`<div class="nst-header"><div class="nst-chip">${chipText}</div></div>`);
    }
    content.push(`<div class="nst-scroll">`);

    const pushSection = (title) => {
      content.push(`<div class="nst-sec">${escapeHtml(title)}</div>`);
      for (const it of bySection.get(title) ?? []) {
        const idx = this.slashState.visibleItemIds.indexOf(it.id);
        const selected = idx === this.slashState.selectedIndex ? " is-selected" : "";
        const icon = it.iconHtml
          ? `<span class="nst-icon">${it.iconHtml}</span>`
          : it.icon
            ? `<span class="nst-icon">${escapeHtml(it.icon)}</span>`
            : `<span class="nst-icon">&nbsp;</span>`;
        const badge = it.badge ? `<span class="nst-pill">${escapeHtml(it.badge)}</span>` : "";
        const shortcut = it.shortcut ? `<span class="nst-kbd">${escapeHtml(it.shortcut)}</span>` : "";
        content.push(
          `<div class="nst-item${selected}" data-id="${escapeHtml(it.id)}">` +
            `<span class="nst-left">${icon}<span class="nst-label">${escapeHtml(it.label)}</span>${badge}</span>` +
            `${shortcut}` +
          `</div>`
        );
      }
    };

    if (visible.length === 0) {
      content.push(`<div class="nst-empty">无匹配</div>`);
    } else {
      if (bySection.has("基本区块")) pushSection("基本区块");
      else pushSection(Array.from(bySection.keys()).filter(Boolean)[0] ?? "基本区块");
    }

    content.push(`</div>`);
    content.push(`<div class="nst-bottom"><span>关闭菜单</span><span class="nst-kbd">esc</span></div>`);

    this.slashMenuEl.innerHTML = content.join("");

    const bottom = this.slashMenuEl.querySelector(".nst-bottom");
    if (bottom) {
      bottom.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
      });
      bottom.addEventListener("click", () => {
        this.dismissSlashMenu();
      });
    }

    this.slashMenuEl.querySelectorAll(".nst-item").forEach((row) => {
      row.addEventListener("mouseenter", () => {
        if (!this.slashState) return;
        const id = row.getAttribute("data-id");
        const idx = this.slashState.visibleItemIds.indexOf(id);
        if (idx >= 0 && idx !== this.slashState.selectedIndex) {
          this.slashState.selectedIndex = idx;
          this.updateSlashSelectionDom({ ensureVisible: false });
        }
      });
      row.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
      });
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        const item = this.getSlashItems().find((x) => x.id === id);
        if (!item) return;
        item.apply(editor);
        this.hideSlashMenu();
      });
    });

    this.updateSlashSelectionDom({ ensureVisible: false });
  }

  positionSlashMenu() {
    if (!this.slashMenuEl || !this.slashState) return;
    const editor = this.lastActiveEditor;
    if (!editor) return;

    const cm = tryGetEditorView(editor);
    const cursor = editor.getCursor();

    let anchor = null;
    if (cm) {
      const pos = cmPosFromEditorCursor(cm, cursor);
      anchor = rectFromCmPos(cm, pos);
    }
    if (!anchor) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width || r.height)) {
          anchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }
      }
    }
    if (!anchor) return;

    const menuRect = this.slashMenuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.left;
    let top = anchor.bottom + 8;
    left = clamp(left, 12, Math.max(12, vw - menuRect.width - 12));
    if (top + menuRect.height > vh - 12) {
      top = clamp(anchor.top - menuRect.height - 8, 12, vh - menuRect.height - 12);
    }
    this.slashMenuEl.style.left = `${left}px`;
    this.slashMenuEl.style.top = `${top}px`;
  }

  deleteSlashTriggerText(editor) {
    if (!this.slashState) return;
    const cur = editor.getCursor();
    const from = this.slashState.triggerPos;
    if (cur.line !== from.line || cur.ch < from.ch) return;
    editor.replaceRange("", from, cur);
  }

  wrapOrInsert(editor, pre, post, placeholder) {
    const s = editor.getSelection();
    if (s) {
      editor.replaceSelection(pre + s + post);
      return;
    }
    editor.replaceSelection(pre + placeholder + post);
  }

  insertFencedCodeBlock(editor) {
    const at = editor.getCursor();
    editor.replaceSelection("```\n\n```\n");
    editor.setCursor({ line: at.line + 1, ch: 0 });
  }

  insertMathBlock(editor) {
    const at = editor.getCursor();
    editor.replaceSelection("$$\n\n$$\n");
    editor.setCursor({ line: at.line + 1, ch: 0 });
  }

  showSelectionBar(editor) {
    if (!this.selectionBarEl) {
      const bar = document.createElement("div");
      bar.className = "nst-select-bar";
      bar.innerHTML = `
        <div class="nst-select-row">
          <button data-act="bold"><b>B</b></button>
          <button data-act="italic"><i>I</i></button>
          <button data-act="underline"><u>U</u></button>
          <button data-act="strike"><s>S</s></button>
          <button data-act="code"><code>{ }</code></button>
          <button data-act="formula">√x</button>
          <button data-act="link">🔗</button>
          <button data-act="page">[[ ]]</button>
          <span class="sep"></span>
          <button data-act="h1">H1</button>
          <button data-act="h2">H2</button>
          <button data-act="h3">H3</button>
          <span class="sep"></span>
          <button data-act="ul">•</button>
          <button data-act="ol">1.</button>
          <button data-act="todo">☐</button>
          <button data-act="quote">❝</button>
        </div>
        <div class="nst-select-row">
          <button data-act="highlight">高亮</button>
          <span class="sep"></span>
          <button data-act="tc-menu" title="字体颜色">字体颜色 ▾</button>
          <button data-act="bg-menu" title="背景颜色">背景颜色 ▾</button>
          <span class="sep"></span>
          <button data-act="clr">清除</button>
        </div>
      `;
      document.body.appendChild(bar);
      this.selectionBarEl = bar;

      bar.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("mousedown", (evt) => {
          evt.preventDefault();
        });
        btn.addEventListener("click", () => {
          const act = btn.getAttribute("data-act");
          if (!act) return;
          const ed = this.lastActiveEditor ?? editor;
          if (!ed) return;
          this.formatSelection(act, ed);
        });
      });
    }
    this.positionSelectionBar();
  }

  hideSelectionBar() {
    if (this.selectionBarEl) {
      this.selectionBarEl.remove();
      this.selectionBarEl = null;
    }
    this.hideSelectionColorPopover();
  }

  positionSelectionBar() {
    if (!this.selectionBarEl) return;
    const editor = this.lastActiveEditor;
    if (!editor || typeof editor.getCursor !== "function") return;

    const cm = tryGetEditorView(editor);
    let anchor = null;

    if (cm && cm.state?.selection?.main) {
      const sel = cm.state.selection.main;
      const a = rectFromCmPos(cm, sel.from);
      const b = rectFromCmPos(cm, sel.to);
      anchor = unionRect(a, b);
    }

    if (!anchor) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width || r.height)) {
          anchor = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }
      }
    }

    if (!anchor) return;

    const barRect = this.selectionBarEl.getBoundingClientRect();
    const vw = window.innerWidth;

    let left = anchor.left + (anchor.right - anchor.left) / 2 - barRect.width / 2;
    left = clamp(left, 8, Math.max(8, vw - barRect.width - 8));
    const top = Math.max(8, anchor.top - barRect.height - 10);
    this.selectionBarEl.style.left = `${left}px`;
    this.selectionBarEl.style.top = `${top}px`;
    this.positionSelectionColorPopover();
  }

  formatSelection(act, editor) {
    const sel = editor.getSelection();
    if (!sel) return;

    const toggleWrap = (pre, post = pre) => {
      const s = editor.getSelection();
      if (!s) return;
      if (s.startsWith(pre) && s.endsWith(post) && s.length >= pre.length + post.length) {
        editor.replaceSelection(s.slice(pre.length, s.length - post.length));
      } else {
        editor.replaceSelection(pre + s + post);
      }
    };

    if (act === "bold") {
      toggleWrap("**");
      this.hideSelectionBar();
      return;
    }
    if (act === "italic") {
      toggleWrap("*");
      this.hideSelectionBar();
      return;
    }
    if (act === "underline") {
      toggleWrap("<u>", "</u>");
      this.hideSelectionBar();
      return;
    }
    if (act === "code") {
      toggleWrap("`");
      this.hideSelectionBar();
      return;
    }
    if (act === "strike") {
      toggleWrap("~~");
      this.hideSelectionBar();
      return;
    }
    if (act === "highlight") {
      toggleWrap("==");
      this.hideSelectionBar();
      return;
    }
    if (act === "link") {
      const s = editor.getSelection();
      editor.replaceSelection(`[${s}](https://)`);
      this.hideSelectionBar();
      return;
    }
    if (act === "page") {
      const s = editor.getSelection();
      editor.replaceSelection(`[[${s}]]`);
      this.hideSelectionBar();
      return;
    }
    if (act === "clr") {
      this.clearSpanStyle(editor);
      this.hideSelectionBar();
      return;
    }
    if (act === "tc-menu") {
      this.toggleSelectionColorPopover("tc");
      return;
    }
    if (act === "bg-menu") {
      this.toggleSelectionColorPopover("bg");
      return;
    }
    if (act === "formula") {
      const s = editor.getSelection();
      if (s.startsWith("$$") && s.endsWith("$$") && s.length >= 4) {
        let inner = s.slice(2, s.length - 2);
        inner = inner.replace(/^\n/, "").replace(/\n$/, "");
        editor.replaceSelection(inner);
      } else if (s.startsWith("$") && s.endsWith("$") && s.length >= 2) {
        editor.replaceSelection(s.slice(1, s.length - 1));
      } else if (s.includes("\n")) {
        editor.replaceSelection(`$$\n${s}\n$$`);
      } else {
        editor.replaceSelection(`$${s}$`);
      }
      this.hideSelectionBar();
      return;
    }
    if (act === "more") {
      return;
    }
    if (act === "quote") {
      this.applyLinePrefix(editor, "> ");
      this.hideSelectionBar();
      return;
    }
    if (act === "h1") {
      this.applyLinePrefix(editor, "# ");
      this.hideSelectionBar();
      return;
    }
    if (act === "h2") {
      this.applyLinePrefix(editor, "## ");
      this.hideSelectionBar();
      return;
    }
    if (act === "h3") {
      this.applyLinePrefix(editor, "### ");
      this.hideSelectionBar();
      return;
    }
    if (act === "ul") {
      this.applyLinePrefix(editor, "- ");
      this.hideSelectionBar();
      return;
    }
    if (act === "ol") {
      this.applyLinePrefix(editor, "1. ");
      this.hideSelectionBar();
      return;
    }
    if (act === "todo") {
      this.applyLinePrefix(editor, "- [ ] ");
      this.hideSelectionBar();
      return;
    }
  }

  applySpanStyle(editor, style) {
    const s = editor.getSelection();
    if (!s) return;

    const parsed = this.parseOuterSpan(s);
    const inner = parsed ? parsed.inner : String(s);
    const cur = parsed ? parsed.style : {};

    const next = { ...cur };
    if (style.color) next.color = style.color;
    if (style.background) next["background-color"] = style.background;

    const parts = [];
    if (next.color) parts.push(`color:${next.color}`);
    if (next["background-color"]) parts.push(`background-color:${next["background-color"]}`);

    if (parts.length === 0) {
      editor.replaceSelection(inner);
      return;
    }
    editor.replaceSelection(`<span style="${parts.join(";")}">${inner}</span>`);
  }

  clearSpanStyle(editor) {
    const unwrapped = this.unwrapEnclosingSpan(editor);
    if (unwrapped) return;

    const s = editor.getSelection();
    if (!s) return;
    editor.replaceSelection(this.stripOuterSpan(s));
  }

  unwrapEnclosingSpan(editor) {
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    const posToOffset = editor?.posToOffset;
    const offsetToPos = editor?.offsetToPos;
    if (typeof posToOffset !== "function" || typeof offsetToPos !== "function") return false;

    const fromOff = posToOffset(from);
    const toOff = posToOffset(to);
    const startOff = Math.max(0, fromOff - 400);
    const endOff = toOff + 400;
    const startPos = offsetToPos(startOff);
    const endPos = offsetToPos(endOff);
    const text = editor.getRange(startPos, endPos);

    const localFrom = fromOff - startOff;
    const localTo = toOff - startOff;
    const closeTag = "</span>";

    const isClosedBeforeFrom = (openIndex) => {
      const lastClose = text.lastIndexOf(closeTag, localFrom);
      return lastClose >= 0 && lastClose > openIndex;
    };

    let openIndex = text.lastIndexOf("<span", localFrom);
    while (openIndex >= 0) {
      const openEnd = text.indexOf(">", openIndex);
      if (openEnd < 0 || openEnd > localFrom) {
        openIndex = text.lastIndexOf("<span", openIndex - 1);
        continue;
      }
      if (isClosedBeforeFrom(openIndex)) {
        openIndex = text.lastIndexOf("<span", openIndex - 1);
        continue;
      }
      const closeIndex = text.indexOf(closeTag, localTo);
      if (closeIndex < 0) return false;
      if (closeIndex <= openEnd) {
        openIndex = text.lastIndexOf("<span", openIndex - 1);
        continue;
      }

      const absStart = startOff + openIndex;
      const absEnd = startOff + closeIndex + closeTag.length;
      const inner = text.slice(openEnd + 1, closeIndex);

      editor.replaceRange(inner, offsetToPos(absStart), offsetToPos(absEnd));
      return true;
    }

    return false;
  }

  stripOuterSpan(s) {
    const parsed = this.parseOuterSpan(s);
    if (parsed) return parsed.inner;
    return String(s);
  }

  parseOuterSpan(s) {
    const m = String(s).match(/^<span\s+style=(['"])([\s\S]*?)\1\s*>([\s\S]*)<\/span>$/i);
    if (!m) return null;
    const styleText = m[2] ?? "";
    const inner = m[3] ?? "";

    const out = {};
    for (const raw of styleText.split(";")) {
      const seg = raw.trim();
      if (!seg) continue;
      const idx = seg.indexOf(":");
      if (idx <= 0) continue;
      const k = seg.slice(0, idx).trim().toLowerCase();
      const v = seg.slice(idx + 1).trim();
      if (!v) continue;
      if (k === "color") out.color = v;
      if (k === "background-color") out["background-color"] = v;
    }

    return { inner, style: out };
  }

  applyLinePrefix(editor, prefix) {
    const s = editor.getSelection();
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");

    const applyToLine = (lineNo) => {
      const line = editor.getLine(lineNo) ?? "";
      const stripped = line.replace(/^\s+/, "");
      const stripLen = line.length - stripped.length;
      if (stripped.startsWith(prefix)) return;
      editor.replaceRange(prefix, { line: lineNo, ch: stripLen }, { line: lineNo, ch: stripLen });
    };

    if (!s || from.line === to.line) {
      applyToLine(from.line);
      return;
    }

    for (let ln = from.line; ln <= to.line; ln++) {
      applyToLine(ln);
    }
  }

  insertColumnsBlock(n) {
    const editor = this.lastActiveEditor;
    if (!editor) return;
    const cols = clamp(Number(n) || 2, 2, 4);
    const parts = [];
    for (let i = 0; i < cols; i++) {
      parts.push("在此处输入…");
    }
    const body = parts.join("\n--- column ---\n");
    const tpl = `\n\n\`\`\`columns ${cols}\n${body}\n\`\`\`\n\n`;
    editor.replaceSelection(tpl);
  }

  parseColumnsCountFromFence(blockText) {
    const m = blockText.match(/```columns\s+(\d+)/);
    const n = m ? Number(m[1]) : 2;
    return clamp(Number.isFinite(n) ? n : 2, 2, 4);
  }

  splitColumnsSrc(src, cols) {
    const parts = src
      .split(/^---\s*column\s*---$/m)
      .map((s) => s.replace(/^\n+|\n+$/g, ""));
    while (parts.length < cols) parts.push("");
    return parts.slice(0, cols);
  }

  async renderColumnsBlock(src, el, ctx) {
    el.empty();

    const sec = ctx.getSectionInfo(el);
    const cols = sec?.text ? this.parseColumnsCountFromFence(sec.text) : 2;

    const wrap = el.createDiv({ cls: "nst-columns" });
    wrap.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;

    const parts = this.splitColumnsSrc(src, cols);
    const component = new Component();
    ctx.addChild(component);

    parts.forEach((p, idx) => {
      const col = wrap.createDiv({ cls: "nst-col" });
      const handle = col.createDiv({ cls: "nst-col-handle" });
      handle.setAttribute("aria-label", "Drag");
      col.setAttribute("draggable", "true");

      const inner = col.createDiv({ cls: "nst-col-inner" });
      this.columnSourceByEl.set(col, p);
      MarkdownRenderer.render(this.app, p, inner, ctx.sourcePath, component);

      this.enableColumnDnD(col, wrap, ctx, cols);
    });
  }

  enableColumnDnD(colEl, wrapEl, ctx, cols) {
    let dragSrc = null;

    colEl.addEventListener("dragstart", (e) => {
      dragSrc = colEl;
      colEl.classList.add("nst-dragging");
      e.dataTransfer?.setData("text/plain", "nst");
      e.dataTransfer?.setDragImage(colEl, 10, 10);
    });

    colEl.addEventListener("dragend", () => {
      colEl.classList.remove("nst-dragging");
      dragSrc = null;
      wrapEl.querySelectorAll(".nst-col").forEach((x) => x.classList.remove("nst-dragover"));
    });

    colEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      colEl.classList.add("nst-dragover");
    });

    colEl.addEventListener("dragleave", () => {
      colEl.classList.remove("nst-dragover");
    });

    colEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      colEl.classList.remove("nst-dragover");
      if (!dragSrc || dragSrc === colEl) return;

      const children = Array.from(wrapEl.querySelectorAll(".nst-col"));
      const fromIdx = children.indexOf(dragSrc);
      const toIdx = children.indexOf(colEl);
      if (fromIdx < 0 || toIdx < 0) return;

      if (fromIdx < toIdx) {
        wrapEl.insertBefore(dragSrc, colEl.nextSibling);
      } else {
        wrapEl.insertBefore(dragSrc, colEl);
      }

      await this.updateColumnsMarkdown(wrapEl, ctx, cols);
    });
  }

  async updateColumnsMarkdown(wrapEl, ctx, cols) {
    const sec = ctx.getSectionInfo(wrapEl) ?? ctx.getSectionInfo(wrapEl.parentElement);
    if (!sec || !ctx.sourcePath) return;

    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const children = Array.from(wrapEl.querySelectorAll(".nst-col"));
    const parts = children.map((c) => this.columnSourceByEl.get(c) ?? "");
    const body = parts.join("\n--- column ---\n");
    const newBlock = "```columns " + cols + "\n" + body + "\n```";

    try {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");

      const hintStart = clamp(sec.lineStart, 0, Math.max(0, lines.length - 1));
      const hintEnd = clamp(sec.lineEnd, hintStart, lines.length);

      let start = -1;
      const forwardLimit = clamp(hintStart + 80, 0, lines.length);
      for (let i = hintStart; i < forwardLimit; i++) {
        if ((lines[i] ?? "").startsWith("```columns")) {
          start = i;
          break;
        }
      }
      if (start < 0) {
        const backLimit = clamp(hintStart - 80, 0, lines.length);
        for (let i = hintStart; i >= backLimit; i--) {
          if ((lines[i] ?? "").startsWith("```columns")) {
            start = i;
            break;
          }
        }
      }
      if (start < 0) return;

      let end = start + 1;
      while (end < lines.length) {
        if ((lines[end] ?? "").startsWith("```")) {
          end = end + 1;
          break;
        }
        end++;
      }
      end = clamp(end, start + 1, Math.max(start + 1, hintEnd));

      const newLines = newBlock.split("\n");
      lines.splice(start, end - start, ...newLines);
      await this.app.vault.modify(file, lines.join("\n"));
      new Notice("已更新分栏顺序");
    } catch {
      new Notice("更新分栏失败");
    }
  }
};
