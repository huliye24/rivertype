import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  // 现在 public/ 里确实有东西（favicon），配置不再是悬空的
  publicDir: 'public',
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 某些受管环境会把 Node 的 rmSync 换成一个「安全删除」钩子，导致 Vite 清空
    // 输出目录时抛错。产物文件名带 hash，增量覆盖是安全的；需要干净构建时
    // 手动删除 dist/ 即可。
    emptyOutDir: false,
    rollupOptions: {
      input: {
        // legacy Markdown 编辑器
        main: 'index.html',
        // RiverType Studio 工作台
        studio: 'studio.html',
      },
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: {
      // 指向 backend/studio-service.mjs（与 legacy Go 后端同端口，二者不并存运行）
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
    // preview 不会继承 server.proxy，必须单列，否则自动化验收打不到排版服务
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
