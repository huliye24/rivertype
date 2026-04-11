export class Editor {
  private element: HTMLTextAreaElement | null = null;

  getElement(): HTMLTextAreaElement | null {
    if (!this.element) {
      this.element = document.getElementById('editor') as HTMLTextAreaElement | null;
    }
    return this.element;
  }

  getContent(): string {
    const el = this.getElement();
    return el?.value ?? '';
  }

  setContent(content: string): void {
    const el = this.getElement();
    if (el) {
      el.value = content;
    }
  }

  clear(): void {
    const el = this.getElement();
    if (el) {
      el.value = '';
    }
  }
}
