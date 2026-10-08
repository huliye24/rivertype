/**
 * Studio 状态容器：项目 + 选区 + 撤销栈。
 *
 * 所有改动都必须经过 mutate()，因为它是唯一会写快照的地方 ——
 * 于是「撤销/恢复」不需要每个功能各自实现一遍。
 */

import { Block, Page, StudioProject } from './model';

export type StudioListener = (state: StudioState) => void;

export interface StudioState {
  project: StudioProject;
  pageIndex: number;
  selectedId: string | null;
  dirty: boolean;
}

const HISTORY_LIMIT = 80;

export class StudioStore {
  project: StudioProject;
  pageIndex = 0;
  selectedId: string | null = null;
  dirty = false;

  private listeners = new Set<StudioListener>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  /** 合并连续微调（例如拖动滑块）为一次撤销 */
  private coalesceKey: string | null = null;
  private coalesceUntil = 0;

  constructor(project: StudioProject) {
    this.project = project;
  }

  subscribe(fn: StudioListener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): StudioState {
    return {
      project: this.project,
      pageIndex: this.pageIndex,
      selectedId: this.selectedId,
      dirty: this.dirty,
    };
  }

  emit(): void {
    const s = this.snapshot();
    for (const fn of this.listeners) fn(s);
  }

  get page(): Page {
    return this.project.pages[Math.min(this.pageIndex, this.project.pages.length - 1)];
  }

  get selected(): Block | null {
    if (!this.selectedId) return null;
    for (const p of this.project.pages) {
      const b = p.blocks.find((x) => x.id === this.selectedId);
      if (b) return b;
    }
    return null;
  }

  /**
   * 修改项目。coalesceKey 相同且间隔 < 600ms 的连续改动会合并进同一条历史，
   * 这样拖动滑块不会把撤销栈冲爆。
   */
  mutate(fn: (project: StudioProject) => void, options: { history?: boolean; coalesceKey?: string } = {}): void {
    const { history = true, coalesceKey } = options;
    const now = Date.now();
    const coalesce = !!coalesceKey && coalesceKey === this.coalesceKey && now < this.coalesceUntil;

    if (history && !coalesce) {
      this.undoStack.push(JSON.stringify(this.project));
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.coalesceKey = coalesceKey ?? null;
    this.coalesceUntil = now + 600;

    fn(this.project);
    this.dirty = true;
    this.emit();
  }

  replace(project: StudioProject): void {
    this.undoStack.push(JSON.stringify(this.project));
    this.redoStack = [];
    this.project = project;
    this.pageIndex = 0;
    this.selectedId = null;
    this.dirty = false;
    this.emit();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  setPage(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.project.pages.length - 1));
    this.pageIndex = clamped;
    this.selectedId = null;
    this.emit();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(prev);
    this.clampState();
    this.dirty = true;
    this.emit();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.project));
    this.project = JSON.parse(next);
    this.clampState();
    this.dirty = true;
    this.emit();
  }

  private clampState(): void {
    if (this.pageIndex >= this.project.pages.length) this.pageIndex = this.project.pages.length - 1;
    if (this.pageIndex < 0) this.pageIndex = 0;
    if (this.selectedId && !this.selected) this.selectedId = null;
  }
}
