export interface ToolbarCallbacks {
  onRender: () => void;
  onExportPDF: () => void;
  onExportHTML: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onAIDesign: () => void;
}

export class Toolbar {
  private callbacks: ToolbarCallbacks;
  private container: HTMLElement | null = null;

  constructor(callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    this.container = container;
    container.innerHTML = `
      <button class="btn" data-action="new">新建</button>
      <button class="btn" data-action="open">打开</button>
      <button class="btn" data-action="save">保存</button>
      <button class="btn btn-primary" data-action="render">渲染预览</button>
      <button class="btn btn-primary" data-action="pdf">导出 PDF</button>
      <button class="btn" data-action="html">导出 HTML</button>
      <button class="btn btn-ai" data-action="ai-design">AI 设计</button>
    `;

    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;

      switch (action) {
        case 'new':
          this.callbacks.onNew();
          break;
        case 'open':
          this.callbacks.onOpen();
          break;
        case 'save':
          this.callbacks.onSave();
          break;
        case 'render':
          this.callbacks.onRender();
          break;
        case 'pdf':
          this.callbacks.onExportPDF();
          break;
        case 'html':
          this.callbacks.onExportHTML();
          break;
        case 'ai-design':
          this.callbacks.onAIDesign();
          break;
      }
    });
  }
}
