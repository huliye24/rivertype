/**
 * Studio 入口。
 *
 * 除了挂载界面，这里还挂一组 window.__rivertypeStudio 测试钩子 ——
 * 自动化验收脚本靠它拿到「与界面完全一致」的渲染结果，
 * 而不是另写一份 Node 侧的渲染逻辑。少一份重复实现，就少一处可能漂移的地方。
 */

import './studio.css';

import { base64FromBytes, zipRead } from './zip';
import { packProject, unpackProject } from './io';
import { measureOverflow, printDocument } from './render';
import { mobilePage as renderMobilePage } from './mobile';
import { mountStudio } from './ui';

const root = document.getElementById('studio-root');

(window as unknown as Record<string, unknown>).__rivertypeStudioReady = false;

const ready = (async () => {
  if (!root) throw new Error('缺少 #studio-root 挂载点');
  const handle = mountStudio(root);

  const hooks = {
    handle,
    project: () => JSON.parse(JSON.stringify(handle.store.project)),
    setPage: (index: number) => handle.store.setPage(index),
    select: (id: string | null) => handle.store.select(id),
    printHtml: () => printDocument(handle.store.project),
    mobileHtml: () => renderMobilePage(handle.store.project),
    overflow: () => measureOverflow(root, handle.store.project),
    loadDemo: () => {
      const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === '载入演示项目');
      (button as HTMLButtonElement | undefined)?.click();
      return handle.store.project.meta.title;
    },
    /** 单文件 .rtsz 的 base64 */
    packedBase64: () => base64FromBytes(packProject(handle.store.project)),
    /** 规范目录形式的全部文件（project.json / content/*.md / assets/*） */
    exportFiles: async () => {
      const entries = await zipRead(packProject(handle.store.project));
      return entries.map((e) => ({ name: e.name, base64: base64FromBytes(e.data) }));
    },
    /** 保存 → 重开：把 .rtsz 字节喂回来，验证往返不丢信息 */
    openBase64: async (b64: string) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const project = await unpackProject(bytes);
      handle.store.replace(project);
      return {
        title: project.meta.title,
        issue: project.meta.issue,
        pages: project.pages.length,
        blocks: project.pages.reduce((n, p) => n + p.blocks.length, 0),
        textChars: project.pages.reduce(
          (n, p) => n + p.blocks.reduce((m, b) => m + (b.text ? b.text.length : 0), 0),
          0,
        ),
        nfcUrl: project.meta.nfcUrl,
      };
    },
  };

  (window as unknown as Record<string, unknown>).__rivertypeStudio = hooks;
  (window as unknown as Record<string, unknown>).__rivertypeStudioReady = true;
})();

void ready;
