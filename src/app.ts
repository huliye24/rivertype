import { config } from './config';
import { Editor } from './editor';
import { Preview } from './preview';
import { Toolbar } from './toolbar';

export class App {
  private editor: Editor;
  private preview: Preview;
  private toolbar: Toolbar;

  constructor(container: HTMLElement) {
    this.editor = new Editor();
    this.preview = new Preview();

    this.toolbar = new Toolbar({
      onRender: () => this.handleRender(),
      onExportPDF: () => this.handleExportPDF(),
      onExportHTML: () => this.handleExportHTML(),
      onNew: () => this.handleNew(),
      onOpen: () => this.handleOpen(),
      onSave: () => this.handleSave(),
    });

    this.render(container);
    this.bindKeyboardShortcuts();
  }

  private render(container: HTMLElement): void {
    container.innerHTML = `
      <header class="header">
        <div class="brand">
          <h1 class="logo">${config.brand}</h1>
          <span class="slogan">${config.slogan}</span>
        </div>
        <div class="toolbar-right" id="toolbar"></div>
      </header>
      <main class="main">
        <section class="pane">
          <div class="pane-header">
            MARKDOWN 编辑器
            <span class="hint">支持标准 Markdown 语法</span>
          </div>
          <textarea id="editor" placeholder="${config.defaultPlaceholder}"></textarea>
        </section>
        <section class="pane">
          <div class="pane-header">实时预览</div>
          <div class="preview-area" id="preview">
            <p>点击「渲染预览」生成预览</p>
            <p>或使用 <span class="shortcut">Ctrl+R</span> 快捷键</p>
          </div>
        </section>
      </main>
    `;

    const toolbarEl = document.getElementById('toolbar');
    if (toolbarEl) {
      this.toolbar.mount(toolbarEl);
    }
  }

  private bindKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        this.handleRender();
      }
    });
  }

  private handleRender(): void {
    const content = this.editor.getContent();
    this.preview.render(content);
  }

  private handleExportPDF(): void {
    console.log('Export PDF');
  }

  private handleExportHTML(): void {
    const content = this.editor.getContent();
    this.preview.exportHTML(content);
  }

  private handleNew(): void {
    this.editor.clear();
    this.preview.clear();
  }

  private handleOpen(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const content = await file.text();
        this.editor.setContent(content);
      }
    };
    input.click();
  }

  private handleSave(): void {
    const content = this.editor.getContent();
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  }
}
