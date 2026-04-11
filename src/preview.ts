import { marked } from 'marked';
import DOMPurify from 'dompurify';

export class Preview {
  private element: HTMLElement | null = null;

  getElement(): HTMLElement | null {
    if (!this.element) {
      this.element = document.getElementById('preview');
    }
    return this.element;
  }

  render(markdown: string): void {
    const el = this.getElement();
    if (!el) return;

    const html = marked.parse(markdown, { async: false }) as string;
    const clean = DOMPurify.sanitize(html);

    el.innerHTML = `
      <div class="preview-content">${clean}</div>
    `;
  }

  clear(): void {
    const el = this.getElement();
    if (el) {
      el.innerHTML = `
        <p>点击「渲染预览」生成预览</p>
        <p>或使用 <span class="shortcut">Ctrl+R</span> 快捷键</p>
      `;
    }
  }

  exportHTML(markdown: string): void {
    const html = marked.parse(markdown, { async: false }) as string;
    const clean = DOMPurify.sanitize(html);
    const fullHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>RIVERTYPE Export</title>
  <style>
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    h1, h2, h3 { color: #333; }
    code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f5f5f5; padding: 16px; overflow-x: auto; }
    blockquote { border-left: 4px solid #a30a24; margin: 0; padding-left: 16px; color: #666; }
  </style>
</head>
<body>
${clean}
</body>
</html>`;

    const blob = new Blob([fullHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
  }
}
