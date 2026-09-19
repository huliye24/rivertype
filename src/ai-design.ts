import { API_BASE } from './config';

export interface AIColorScheme {
  background: string;
  text: string;
  heading: string;
  link: string;
  code_bg: string;
  blockquote_border: string;
  table_border: string;
}

export interface AITypography {
  heading_font: string;
  body_font: string;
  code_font: string;
  base_size: string;
  line_height: string;
}

export interface AISpacing {
  paragraph_margin: string;
  section_margin: string;
}

export interface AIEffects {
  blockquote_style: string;
  code_block_style: string;
  hr_style: string;
  link_style: string;
  table_style: string;
}

export interface AIScheme {
  name: string;
  description: string;
  prompt: string;
  colors: AIColorScheme;
  typography: AITypography;
  spacing: AISpacing;
  effects: AIEffects;
  css: string;
}

export interface AISchemeResponse {
  schemes: AIScheme[];
  used_prompt: string;
}

// ==================== 图片设计相关类型 ====================

export interface DesignImage {
  image_base64: string;
  design_notes: string;
  style_name: string;
}

export interface DesignImageResponse {
  images: DesignImage[];
  used_prompt: string;
}

export interface AnalyzeImageResponse {
  scheme: AIScheme;
  used_notes: string;
}

export interface AIDesignCallbacks {
  onSchemeApplied: (scheme: AIScheme) => void;
  onClose: () => void;
}

// ==================== AIDesign 类 ====================

export class AIDesign {
  private container: HTMLElement | null = null;
  private callbacks: AIDesignCallbacks;
  private currentSchemes: AIScheme[] = [];
  private selectedScheme: AIScheme | null = null;
  private usedPrompt: string = '';
  private currentMode: 'text' | 'image' = 'text';
  private generatedImages: DesignImage[] = [];

  constructor(callbacks: AIDesignCallbacks) {
    this.callbacks = callbacks;
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
  }

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="ai-panel">
        <div class="ai-panel-header">
          <h2>AI 设计</h2>
          <button class="ai-close-btn" data-action="close">✕</button>
        </div>

        <div class="ai-mode-tabs">
          <button class="ai-mode-tab ${this.currentMode === 'text' ? 'active' : ''}" data-mode="text">
            💡 纯文字生成
          </button>
          <button class="ai-mode-tab ${this.currentMode === 'image' ? 'active' : ''}" data-mode="image">
            🎨 生成设计图
          </button>
        </div>

        <div class="ai-panel-body">

          ${this.renderTextMode()}
          ${this.renderImageMode()}

        </div>
      </div>

      <div class="ai-image-preview-modal" id="ai-image-modal" style="display:none;">
        <div class="ai-modal-backdrop" data-action="close-modal"></div>
        <div class="ai-modal-content">
          <button class="ai-modal-close" data-action="close-modal">✕</button>
          <img id="ai-modal-img" src="" alt="设计预览" />
          <div class="ai-modal-actions">
            <button class="btn btn-primary" id="ai-apply-design-btn">应用此设计</button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderTextMode(): string {
    return `
      <div class="ai-text-mode" id="ai-text-mode" style="${this.currentMode !== 'text' ? 'display:none' : ''}">
        <div class="ai-input-section">
          <p class="ai-hint">用自然语言描述你想要的视觉风格，AI 会生成 3 个细化方案</p>
          <textarea
            id="ai-description"
            placeholder="例如：科技感深色主题、学术论文风格、杂志排版..."
            rows="3"
          ></textarea>
          <div class="ai-used-prompt-area" id="ai-used-prompt-area" style="display:none;">
            <label>当前 Prompt（可复制修改）</label>
            <div class="ai-prompt-row">
              <textarea id="ai-used-prompt" rows="2" readonly></textarea>
              <button class="ai-copy-btn" data-action="copy-prompt">复制</button>
            </div>
          </div>
          <button class="btn btn-primary ai-generate-btn" id="ai-generate-btn">生成方案</button>
          <div class="ai-loading" id="ai-loading" style="display:none;">
            <span class="ai-spinner"></span>
            <span>AI 思考中...</span>
          </div>
          <div class="ai-error" id="ai-error" style="display:none;"></div>
        </div>

        <div class="ai-schemes-section" id="ai-schemes-section" style="display:none;">
          <h3>方案列表</h3>
          <div class="ai-schemes-list" id="ai-schemes-list"></div>
        </div>
      </div>
    `;
  }

  private renderImageMode(): string {
    return `
      <div class="ai-image-mode" id="ai-image-mode" style="${this.currentMode !== 'image' ? 'display:none' : ''}">
        <div class="ai-input-section">
          <p class="ai-hint">描述你想要的风格，AI 会生成 3 张设计示意图供你选择</p>
          <textarea
            id="ai-image-description"
            placeholder="例如：极简杂志风、科技深色风、温暖复古风..."
            rows="2"
          ></textarea>
          <button class="btn btn-primary ai-generate-images-btn" id="ai-generate-images-btn">
            🎨 生成设计图
          </button>
          <div class="ai-loading" id="ai-image-loading" style="display:none;">
            <span class="ai-spinner"></span>
            <span>正在生成设计图（约 30 秒）...</span>
          </div>
          <div class="ai-error" id="ai-image-error" style="display:none;"></div>
        </div>

        <div class="ai-image-gallery-section" id="ai-image-gallery-section" style="display:none;">
          <h3>设计示意</h3>
          <p class="ai-hint ai-hint-small">点击任意图片预览并应用设计</p>
          <div class="ai-image-gallery" id="ai-image-gallery"></div>
        </div>

        <div class="ai-schemes-section" id="ai-image-schemes-section" style="display:none;">
          <h3>已提取的设计方案</h3>
          <div class="ai-schemes-list" id="ai-image-schemes-list"></div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.container) return;

    // 关闭按钮
    this.container.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.callbacks.onClose();
    });

    // 模式切换
    this.container.querySelectorAll('.ai-mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = (tab as HTMLElement).dataset.mode as 'text' | 'image';
        this.switchMode(mode);
      });
    });

    // 文字模式事件绑定
    this.bindTextModeEvents();

    // 图片模式事件绑定
    this.bindImageModeEvents();

    // 模态框关闭
    this.container.querySelectorAll('[data-action="close-modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal());
    });

    this.container.querySelector('#ai-image-modal')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('ai-modal-backdrop') || target.dataset.action === 'close-modal') {
        this.closeModal();
      }
    });

    // ESC 关闭模态框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeModal();
    });
  }

  private switchMode(mode: 'text' | 'image'): void {
    this.currentMode = mode;

    const textMode = this.container?.querySelector('#ai-text-mode') as HTMLElement | null;
    const imageMode = this.container?.querySelector('#ai-image-mode') as HTMLElement | null;

    if (textMode) textMode.style.display = mode === 'text' ? 'block' : 'none';
    if (imageMode) imageMode.style.display = mode === 'image' ? 'block' : 'none';

    this.container?.querySelectorAll('.ai-mode-tab').forEach(tab => {
      const t = tab as HTMLElement;
      t.classList.toggle('active', t.dataset.mode === mode);
    });
  }

  // ==================== 文字模式 ====================

  private bindTextModeEvents(): void {
    if (!this.container) return;

    // 复制 prompt 按钮
    this.container.querySelector('[data-action="copy-prompt"]')?.addEventListener('click', () => {
      const promptEl = this.container?.querySelector('#ai-used-prompt') as HTMLTextAreaElement;
      if (promptEl) {
        navigator.clipboard.writeText(promptEl.value);
        const btn = this.container?.querySelector('[data-action="copy-prompt"]') as HTMLButtonElement;
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = '已复制';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      }
    });

    // 生成按钮
    this.container.querySelector('#ai-generate-btn')?.addEventListener('click', () => {
      this.handleTextGenerate();
    });

    // 回车提交（Ctrl+Enter）
    const descEl = this.container?.querySelector('#ai-description') as HTMLTextAreaElement;
    descEl?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.handleTextGenerate();
      }
    });
  }

  private async handleTextGenerate(): Promise<void> {
    if (!this.container) return;

    const descEl = this.container.querySelector('#ai-description') as HTMLTextAreaElement;
    const generateBtn = this.container.querySelector('#ai-generate-btn') as HTMLButtonElement;
    const loadingEl = this.container.querySelector('#ai-loading') as HTMLElement;
    const errorEl = this.container.querySelector('#ai-error') as HTMLElement;
    const promptAreaEl = this.container.querySelector('#ai-used-prompt-area') as HTMLElement;
    const promptEl = this.container.querySelector('#ai-used-prompt') as HTMLTextAreaElement;

    const description = descEl?.value.trim() || '';
    if (!description) {
      this.showError('请输入风格描述', 'ai-error');
      return;
    }

    generateBtn.style.display = 'none';
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';

    try {
      const response = await fetch(`${API_BASE}/ai/generate-schemes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description,
          context: '',
          base_prompt: this.usedPrompt || '',
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '生成失败');
      }

      const data: AISchemeResponse = await response.json();

      this.currentSchemes = data.schemes;
      this.usedPrompt = data.used_prompt;

      if (promptEl) promptEl.value = this.usedPrompt;
      if (promptAreaEl) promptAreaEl.style.display = 'block';

      this.renderSchemes();

    } catch (error: any) {
      this.showError(error.message || '生成失败，请检查后端服务是否正常运行', 'ai-error');
    } finally {
      generateBtn.style.display = 'block';
      loadingEl.style.display = 'none';
    }
  }

  // ==================== 图片模式 ====================

  private bindImageModeEvents(): void {
    if (!this.container) return;

    this.container.querySelector('#ai-generate-images-btn')?.addEventListener('click', () => {
      this.handleImageGenerate();
    });
  }

  private async handleImageGenerate(): Promise<void> {
    if (!this.container) return;

    const descEl = this.container.querySelector('#ai-image-description') as HTMLTextAreaElement;
    const generateBtn = this.container.querySelector('#ai-generate-images-btn') as HTMLButtonElement;
    const loadingEl = this.container.querySelector('#ai-image-loading') as HTMLElement;
    const errorEl = this.container.querySelector('#ai-image-error') as HTMLElement;
    const gallerySection = this.container.querySelector('#ai-image-gallery-section') as HTMLElement;

    const description = descEl?.value.trim() || '';
    if (!description) {
      this.showError('请输入风格描述', 'ai-image-error');
      return;
    }

    generateBtn.style.display = 'none';
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    gallerySection.style.display = 'none';

    try {
      const response = await fetch(`${API_BASE}/ai/generate-design-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '生成失败');
      }

      const data: DesignImageResponse = await response.json();
      this.generatedImages = data.images;
      this.renderImageGallery();

    } catch (error: any) {
      this.showError(error.message || '设计图生成失败，请检查 GEMINI_API_KEY 配置', 'ai-image-error');
    } finally {
      generateBtn.style.display = 'block';
      loadingEl.style.display = 'none';
    }
  }

  private renderImageGallery(): void {
    if (!this.container) return;

    const gallerySection = this.container.querySelector('#ai-image-gallery-section') as HTMLElement;
    const galleryEl = this.container.querySelector('#ai-image-gallery') as HTMLElement;

    if (!gallerySection || !galleryEl) return;

    galleryEl.innerHTML = '';
    gallerySection.style.display = 'block';

    this.generatedImages.forEach((img, idx) => {
      const card = document.createElement('div');
      card.className = 'ai-image-card';
      card.innerHTML = `
        <img src="data:image/png;base64,${img.image_base64}" alt="${this.escapeHtml(img.style_name)}" />
        <div class="ai-image-card-label">${this.escapeHtml(img.style_name)}</div>
        <div class="ai-image-card-overlay">
          <span>点击预览</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.openModal(img, idx);
      });

      galleryEl.appendChild(card);
    });
  }

  private openModal(img: DesignImage, idx: number): void {
    if (!this.container) return;

    const modal = this.container.querySelector('#ai-image-modal') as HTMLElement;
    const imgEl = this.container.querySelector('#ai-modal-img') as HTMLImageElement;
    const applyBtn = this.container.querySelector('#ai-apply-design-btn') as HTMLButtonElement;

    if (!modal || !imgEl || !applyBtn) return;

    imgEl.src = `data:image/png;base64,${img.image_base64}`;
    imgEl.alt = img.style_name;
    modal.style.display = 'flex';

    const newBtn = applyBtn.cloneNode(true) as HTMLButtonElement;
    applyBtn.parentNode?.replaceChild(newBtn, applyBtn);
    newBtn.addEventListener('click', () => {
      this.handleApplyDesign(idx);
    });
  }

  private closeModal(): void {
    if (!this.container) return;
    const modal = this.container.querySelector('#ai-image-modal') as HTMLElement;
    if (modal) modal.style.display = 'none';
  }

  private async handleApplyDesign(imageIdx: number): Promise<void> {
    if (!this.container) return;

    const img = this.generatedImages[imageIdx];
    if (!img) return;

    const modal = this.container.querySelector('#ai-image-modal') as HTMLElement;
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'ai-analyzing-overlay';
    loadingOverlay.innerHTML = '<div class="ai-analyzing-box"><span class="ai-spinner"></span><span>正在分析设计...</span></div>';
    modal.appendChild(loadingOverlay);

    try {
      const response = await fetch(`${API_BASE}/ai/analyze-design-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: img.image_base64,
          design_type: 'mixed',
        }),
      });

      loadingOverlay.remove();

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '分析失败');
      }

      const data: AnalyzeImageResponse = await response.json();
      const scheme = data.scheme;

      // 将分析出的方案加入列表
      this.currentSchemes.push(scheme);
      this.selectedScheme = scheme;

      // 关闭模态框
      this.closeModal();

      // 渲染方案列表（图片模式下的）
      this.renderImageSchemes();

      // 同时通知外部应用
      this.callbacks.onSchemeApplied(scheme);

    } catch (error: any) {
      loadingOverlay.remove();
      this.showError(error.message || '设计分析失败', 'ai-image-error');
    }
  }

  private renderImageSchemes(): void {
    if (!this.container) return;

    const sectionEl = this.container.querySelector('#ai-image-schemes-section') as HTMLElement;
    const listEl = this.container.querySelector('#ai-image-schemes-list') as HTMLElement;

    if (!sectionEl || !listEl) return;

    // 只显示从图片分析出来的方案
    const imageSchemes = this.currentSchemes.slice(); // 显示全部（包含文字模式的）

    sectionEl.style.display = 'block';
    listEl.innerHTML = '';

    imageSchemes.forEach((scheme, idx) => {
      const card = document.createElement('div');
      card.className = 'ai-scheme-card' + (scheme === this.selectedScheme ? ' selected' : '');
      card.innerHTML = `
        <div class="ai-scheme-header">
          <span class="ai-scheme-name">${this.escapeHtml(scheme.name)}</span>
          <div class="ai-scheme-actions">
            <button class="ai-action-btn ai-apply-btn" data-action="apply" data-idx="${idx}">应用</button>
          </div>
        </div>
        <p class="ai-scheme-desc">${this.escapeHtml(scheme.description)}</p>
        <div class="ai-scheme-colors">
          <span class="color-swatch" style="background:${scheme.colors.background}" title="背景: ${scheme.colors.background}"></span>
          <span class="color-swatch" style="background:${scheme.colors.text}" title="文字: ${scheme.colors.text}"></span>
          <span class="color-swatch" style="background:${scheme.colors.heading}" title="标题: ${scheme.colors.heading}"></span>
          <span class="color-swatch" style="background:${scheme.colors.link}" title="链接: ${scheme.colors.link}"></span>
          <span class="color-swatch" style="background:${scheme.colors.code_bg}" title="代码: ${scheme.colors.code_bg}"></span>
        </div>
        <div class="ai-scheme-meta">
          <span>字体: ${this.escapeHtml(scheme.typography.body_font.split(',')[0])}</span>
          <span>字号: ${scheme.typography.base_size}</span>
        </div>
      `;

      card.querySelectorAll('[data-action="apply"]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.selectedScheme = scheme;
          this.callbacks.onSchemeApplied(scheme);
          listEl.querySelectorAll('.ai-scheme-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      });

      listEl.appendChild(card);
    });
  }

  // ==================== 通用 ====================

  private showError(msg: string, errorId: string): void {
    if (!this.container) return;
    const errorEl = this.container.querySelector(`#${errorId}`) as HTMLElement;
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  private renderSchemes(): void {
    if (!this.container) return;

    const sectionEl = this.container.querySelector('#ai-schemes-section') as HTMLElement;
    const listEl = this.container.querySelector('#ai-schemes-list') as HTMLElement;

    if (!sectionEl || !listEl) return;

    sectionEl.style.display = 'block';
    listEl.innerHTML = '';

    this.currentSchemes.forEach((scheme, idx) => {
      const card = document.createElement('div');
      card.className = 'ai-scheme-card' + (scheme === this.selectedScheme ? ' selected' : '');
      card.innerHTML = `
        <div class="ai-scheme-header">
          <span class="ai-scheme-name">${this.escapeHtml(scheme.name)}</span>
          <div class="ai-scheme-actions">
            <button class="ai-action-btn" data-action="copy-prompt" data-idx="${idx}">复制 Prompt</button>
            <button class="ai-action-btn ai-apply-btn" data-action="apply" data-idx="${idx}">应用</button>
          </div>
        </div>
        <p class="ai-scheme-desc">${this.escapeHtml(scheme.description)}</p>
        <div class="ai-scheme-prompt">
          <label>Prompt</label>
          <textarea rows="2" readonly>${this.escapeHtml(scheme.prompt)}</textarea>
        </div>
        <div class="ai-scheme-colors">
          <span class="color-swatch" style="background:${scheme.colors.background}" title="背景: ${scheme.colors.background}"></span>
          <span class="color-swatch" style="background:${scheme.colors.text}" title="文字: ${scheme.colors.text}"></span>
          <span class="color-swatch" style="background:${scheme.colors.heading}" title="标题: ${scheme.colors.heading}"></span>
          <span class="color-swatch" style="background:${scheme.colors.link}" title="链接: ${scheme.colors.link}"></span>
          <span class="color-swatch" style="background:${scheme.colors.code_bg}" title="代码: ${scheme.colors.code_bg}"></span>
          <span class="color-swatch" style="background:${scheme.colors.blockquote_border}" title="引用: ${scheme.colors.blockquote_border}"></span>
          <span class="color-swatch" style="background:${scheme.colors.table_border}" title="表格: ${scheme.colors.table_border}"></span>
        </div>
        <div class="ai-scheme-meta">
          <span>字体: ${this.escapeHtml(scheme.typography.body_font.split(',')[0])}</span>
          <span>字号: ${scheme.typography.base_size}</span>
        </div>
      `;

      card.querySelectorAll('[data-action="copy-prompt"]').forEach(btn => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(scheme.prompt);
          const orig = (btn as HTMLButtonElement).textContent;
          (btn as HTMLButtonElement).textContent = '已复制';
          setTimeout(() => { (btn as HTMLButtonElement).textContent = orig; }, 1500);
        });
      });

      card.querySelectorAll('[data-action="apply"]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.selectedScheme = scheme;
          this.callbacks.onSchemeApplied(scheme);
          listEl.querySelectorAll('.ai-scheme-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      });

      listEl.appendChild(card);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getSelectedScheme(): AIScheme | null {
    return this.selectedScheme;
  }

  hasSchemes(): boolean {
    return this.currentSchemes.length > 0;
  }

  getSchemes(): AIScheme[] {
    return this.currentSchemes;
  }
}
