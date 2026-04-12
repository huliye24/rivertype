const API_BASE = '/api';

export class Preview {
  private element: HTMLElement | null = null;

  getElement(): HTMLElement | null {
    if (!this.element) {
      this.element = document.getElementById('preview');
    }
    return this.element;
  }

  async render(markdown: string): Promise<void> {
    const el = this.getElement();
    if (!el) return;

    el.innerHTML = '<p class="loading">正在渲染...</p>';

    try {
      const response = await fetch(`${API_BASE}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          theme: 'default',
          include_toc: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      el.innerHTML = `<div class="preview-content">${data.html}</div>`;
    } catch (error) {
      // 后端不可用时，回退到纯前端渲染
      console.warn('后端不可用，回退到纯前端渲染:', error);
      const { marked } = await import('marked');
      const { default: DOMPurify } = await import('dompurify');
      const html = marked.parse(markdown, { async: false }) as string;
      const clean = DOMPurify.sanitize(html);
      el.innerHTML = `<div class="preview-content">${clean}</div>`;
    }
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

  async exportHTML(markdown: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/export/html`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          theme: 'default',
          full_page: false,
          include_toc: false,
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.html';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请确保后端服务正在运行');
    }
  }

  async exportPDF(markdown: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          theme: 'default',
          full_page: true,
          include_toc: true,
        }),
      });

      if (!response.ok) throw new Error('PDF生成失败');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF导出失败:', error);
      alert('PDF导出失败: ' + error);
    }
  }
}
