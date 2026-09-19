package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/gin-gonic/gin"
	"github.com/microcosm-cc/bluemonday"
	"github.com/russross/blackfriday/v2"
)

// ==================== 类型定义 ====================

type RenderRequest struct {
	Markdown   string    `json:"markdown"`
	Theme      string    `json:"theme"`
	FullPage   bool      `json:"full_page"`
	IncludeToc bool      `json:"include_toc"`
	Title      string    `json:"title"`
	Scheme     AIScheme  `json:"scheme"`
}

type RenderResponse struct {
	HTML     template.HTML      `json:"html"`
	Toc      []TOCItem         `json:"toc,omitempty"`
	Metadata map[string]any     `json:"metadata"`
}

type AIColorScheme struct {
	Background      string `json:"background"`
	Text            string `json:"text"`
	Heading         string `json:"heading"`
	Link            string `json:"link"`
	CodeBg          string `json:"code_bg"`
	BlockquoteBorder string `json:"blockquote_border"`
	TableBorder     string `json:"table_border"`
}

type AITypography struct {
	HeadingFont string `json:"heading_font"`
	BodyFont    string `json:"body_font"`
	CodeFont    string `json:"code_font"`
	BaseSize    string `json:"base_size"`
	LineHeight  string `json:"line_height"`
}

type AISpacing struct {
	ParagraphMargin string `json:"paragraph_margin"`
	SectionMargin   string `json:"section_margin"`
}

type AIEffects struct {
	BlockquoteStyle string `json:"blockquote_style"`
	CodeBlockStyle  string `json:"code_block_style"`
	HrStyle         string `json:"hr_style"`
	LinkStyle       string `json:"link_style"`
	TableStyle      string `json:"table_style"`
}

type AIScheme struct {
	Name        string        `json:"name"`
	Description string        `json:"description"`
	Prompt      string        `json:"prompt"`
	Colors      AIColorScheme `json:"colors"`
	Typography  AITypography  `json:"typography"`
	Spacing     AISpacing     `json:"spacing"`
	Effects     AIEffects     `json:"effects"`
	CSS         string        `json:"css"`
}

type AISchemeRequest struct {
	Description string `json:"description"`
	Context     string `json:"context"`
	BasePrompt  string `json:"base_prompt"`
}

type AISchemeResponse struct {
	Schemes   []AIScheme `json:"schemes"`
	UsedPrompt string    `json:"used_prompt"`
}

// ==================== 图片设计相关类型 ====================

type DesignImageRequest struct {
	Description string `json:"description"`
	StyleHints  string `json:"style_hints"`
}

type DesignImageResponse struct {
	Images      []DesignImage `json:"images"`
	UsedPrompt  string       `json:"used_prompt"`
}

type DesignImage struct {
	ImageBase64 string `json:"image_base64"`
	DesignNotes string `json:"design_notes"`
	StyleName   string `json:"style_name"`
}

type AnalyzeImageRequest struct {
	ImageBase64 string `json:"image_base64"`
	DesignType  string `json:"design_type"` // "dark" | "light" | "mixed"
}

type AnalyzeImageResponse struct {
	Scheme    AIScheme `json:"scheme"`
	UsedNotes string   `json:"used_notes"`
}

type TOCItem struct {
	Level  int    `json:"level"`
	Text   string `json:"text"`
	Anchor string `json:"anchor"`
}

type ArticleContext struct {
	Content     template.HTML
	Title       string
	Author      string
	Date        string
	Description string
	Toc         template.HTML
}

var themes = map[string]string{
	"default": `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; }
code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; }
pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 5px; }
blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 1rem; color: #666; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 0.5rem; }
`,
	"github": `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
code { background: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
pre { background: #f6f8fa; padding: 1rem; overflow-x: auto; border-radius: 6px; }
blockquote { border-left: 4px solid #dfe2e5; margin: 0; padding-left: 1rem; color: #6a737d; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #dfe2e5; padding: 0.5rem; }
`,
	"minimal": `
body { font-family: Georgia, serif; line-height: 1.8; max-width: 700px; margin: 0 auto; padding: 2rem; color: #333; }
code { font-family: monospace; background: #f9f9f9; padding: 0.2em 0.4em; }
pre { background: #f9f9f9; padding: 1rem; }
blockquote { font-style: italic; border-left: 2px solid #ccc; margin: 0; padding-left: 1rem; }
`,
}

func main() {
	r := gin.Default()

	// CORS 中间件
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 静态文件
	r.Static("/static", "./static")
	r.StaticFile("/favicon.ico", "./static/favicon.ico")

	// API路由
	r.POST("/api/render", handleRender)
	r.POST("/api/preview", handlePreview)
	r.POST("/api/toc", handleToc)
	r.GET("/api/themes", handleThemes)
	r.POST("/api/export/pdf", handleExportPDF)
	r.POST("/api/export/html", handleExportHTML)

	// AI 路由
	r.POST("/api/ai/generate-schemes", handleAIGenerateSchemes)
	r.POST("/api/ai/render-scheme", handleAIRenderScheme)
	r.POST("/api/ai/generate-design-image", handleAIGenerateDesignImage)
	r.POST("/api/ai/analyze-design-image", handleAIAnalyzeDesignImage)

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	fmt.Println("Server running on http://localhost:3000")
	r.Run(":3000")
}

// ==================== Markdown 解析 ====================

func parseMarkdown(input string) template.HTML {
	// 使用 bluemonday 清理 HTML
	p := bluemonday.UGCPolicy()
	p.AllowElements("h1", "h2", "h3", "h4", "h5", "h6")
	p.AllowAttrs("id").OnElements("h1", "h2", "h3", "h4", "h5", "h6")
	p.AllowAttrs("class").OnElements("pre", "code")

	unsafe := blackfriday.Run([]byte(input))
	html := p.SanitizeBytes(unsafe)
	return template.HTML(html)
}

func parseWithMetadata(input string) (template.HTML, map[string]interface{}) {
	metadata := make(map[string]interface{})
	content := input

	// 提取 YAML front matter
	if strings.HasPrefix(input, "---") {
		parts := strings.SplitN(input, "---", 3)
		if len(parts) >= 3 {
			frontMatter := parts[1]
			content = strings.TrimSpace(parts[2])

			// 简单解析 front matter
			lines := strings.Split(frontMatter, "\n")
			for _, line := range lines {
				if idx := strings.Index(line, ":"); idx > 0 {
					key := strings.TrimSpace(line[:idx])
					value := strings.TrimSpace(line[idx+1:])
					value = strings.Trim(value, "\"")
					metadata[key] = value
				}
			}
		}
	}

	return parseMarkdown(content), metadata
}

func extractTOC(input string) []TOCItem {
	var toc []TOCItem
	lines := strings.Split(input, "\n")

	for _, line := range lines {
		if strings.HasPrefix(line, "#") {
			level := 0
			for _, c := range line {
				if c == '#' {
					level++
				} else {
					break
				}
			}

			if level > 0 && level <= 6 {
				text := strings.TrimSpace(line[level:])
				anchor := makeAnchor(text)
				toc = append(toc, TOCItem{
					Level:  level,
					Text:   text,
					Anchor: anchor,
				})
			}
		}
	}

	return toc
}

func makeAnchor(text string) string {
	// 转小写
	anchor := strings.ToLower(text)
	// 替换空格和特殊字符
	reg := regexp.MustCompile(`[^\w\s-]`)
	anchor = reg.ReplaceAllString(anchor, "")
	anchor = regexp.MustCompile(`[\s_]+`).ReplaceAllString(anchor, "-")
	return anchor
}

// ==================== 主题 ====================

func getCSS(themeName string) string {
	if css, ok := themes[themeName]; ok {
		return css
	}
	return themes["default"]
}

func renderArticle(content template.HTML, themeName string, ctx ArticleContext) string {
	css := getCSS(themeName)

	tmpl := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>
<style>
%s
/* Article styles */
h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
img { max-width: 100%%; height: auto; }
a { color: #0066cc; }
hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
</style>
</head>
<body>
<article>
<header>
<h1>%s</h1>
%s%s%s
<hr>
</header>
%s
</article>
</body>
</html>`, template.HTMLEscapeString(string(ctx.Title)), css,
		template.HTMLEscapeString(string(ctx.Title)),
		formatOptional("Author: ", ctx.Author),
		formatOptional("Date: ", ctx.Date),
		formatOptional("Description: ", ctx.Description),
		content)

	return tmpl
}

func formatOptional(label, value string) string {
	if value != "" {
		return fmt.Sprintf("<p><small>%s%s</small></p>", label, template.HTMLEscapeString(value))
	}
	return ""
}

func renderToc(items []TOCItem) string {
	if len(items) == 0 {
		return ""
	}

	var buf bytes.Buffer
	buf.WriteString("<nav id='toc'><h2>Table of Contents</h2><ul>")

	for _, item := range items {
		indent := (item.Level - 1) * 2
		buf.WriteString(fmt.Sprintf("<li style='margin-left: %dem'><a href='#%s'>%s</a></li>",
			indent, item.Anchor, template.HTMLEscapeString(item.Text)))
	}

	buf.WriteString("</ul></nav>")
	return buf.String()
}

// ==================== 处理器 ====================

func handleRender(c *gin.Context) {
	var req RenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.Theme == "" {
		req.Theme = "default"
	}

	html, metadata := parseWithMetadata(req.Markdown)

	var toc []TOCItem
	if req.IncludeToc {
		toc = extractTOC(req.Markdown)
	}

	if req.FullPage {
		title := "Untitled"
		if t, ok := metadata["title"].(string); ok {
			title = t
		}

		author, _ := metadata["author"].(string)
		date, _ := metadata["date"].(string)
		description, _ := metadata["description"].(string)

		tocHTML := renderToc(toc)

		html = template.HTML(renderArticle(html, req.Theme, ArticleContext{
			Content:    html,
			Title:      title,
			Author:     author,
			Date:       date,
			Description: description,
			Toc:        template.HTML(tocHTML),
		}))
	}

	c.JSON(200, RenderResponse{
		HTML:     html,
		Toc:      toc,
		Metadata: metadata,
	})
}

func handlePreview(c *gin.Context) {
	var req RenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	html := parseMarkdown(req.Markdown)
	c.JSON(200, gin.H{"html": html})
}

func handleToc(c *gin.Context) {
	var req RenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	toc := extractTOC(req.Markdown)
	c.JSON(200, gin.H{"toc": toc})
}

func handleThemes(c *gin.Context) {
	themeList := make([]string, 0, len(themes))
	for name := range themes {
		themeList = append(themeList, name)
	}
	c.JSON(200, gin.H{"themes": themeList})
}

// 纯净HTML导出（用于预览和导出）
func renderCleanHTML(content template.HTML, themeName string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; max-width: 720px; margin: 0 auto; padding: 2rem; color: #333; }
h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.3; }
h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
p { margin: 1em 0; }
a { color: #0066cc; }
code { background: #f4f4f4; padding: 0.2em 0.4em; border-radius: 3px; font-size: 90%%; }
pre { background: #f4f4f4; padding: 1rem; border-radius: 5px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1rem; color: #666; }
img { max-width: 100%%; height: auto; }
hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
table { border-collapse: collapse; width: 100%%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 0.5rem; }
ul, ol { margin: 1em 0; padding-left: 2em; }
li { margin: 0.4em 0; }
</style>
</head>
<body>
%s
</body>
</html>`, content)
}

// AI 方案 HTML 导出
func renderSchemeHTML(content template.HTML, css string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
%s
</style>
</head>
<body>
%s
</body>
</html>`, css, content)
}

func handleExportHTML(c *gin.Context) {
	var req RenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.Theme == "" {
		req.Theme = "default"
	}

	html, metadata := parseWithMetadata(req.Markdown)

	// 获取标题
	title := req.Title
	if title == "" {
		if t, ok := metadata["title"].(string); ok {
			title = t
		} else {
			title = "document"
		}
	}

	// 移除文件名中的非法字符
	title = regexp.MustCompile(`[<>:"/\\|?*]`).ReplaceAllString(title, "_")

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.html", title))

	// 如果有 AI 方案，使用方案 CSS
	if req.Scheme.CSS != "" {
		fullHTML := renderSchemeHTML(html, req.Scheme.CSS)
		c.Data(200, "text/html; charset=utf-8", []byte(fullHTML))
		return
	}

	if req.FullPage {
		author, _ := metadata["author"].(string)
		date, _ := metadata["date"].(string)
		description, _ := metadata["description"].(string)

		tocHTML := ""
		if req.IncludeToc {
			toc := extractTOC(req.Markdown)
			tocHTML = renderToc(toc)
		}

		fullHTML := renderArticle(html, req.Theme, ArticleContext{
			Content:     html,
			Title:       title,
			Author:      author,
			Date:        date,
			Description: description,
			Toc:         template.HTML(tocHTML),
		})
		c.Data(200, "text/html; charset=utf-8", []byte(fullHTML))
	} else {
		// 纯净导出：只有内容和基础样式
		cleanHTML := renderCleanHTML(html, req.Theme)
		c.Data(200, "text/html; charset=utf-8", []byte(cleanHTML))
	}
}

// ==================== chromedp 初始化 ====================

var (
	chromedpBrowserInit sync.Once
	chromedpBrowserCtx  context.Context
	chromedpBrowserCancel context.CancelFunc
)

// initChromedp 初始化浏览器（只执行一次）
func initChromedp() error {
	chromedpBrowserInit.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		chromedpBrowserCancel = cancel

		allocatorCtx, allocatorCancel := chromedp.NewExecAllocator(ctx,
			chromedp.NoFirstRun,
			chromedp.NoDefaultBrowserCheck,
			chromedp.Headless,
			chromedp.Flag("disable-gpu", true),
			chromedp.Flag("enable-unsafe-swiftshader", true),
			chromedp.WindowSize(1200, 900),
		)

		var newCancel context.CancelFunc
		chromedpBrowserCtx, newCancel = chromedp.NewContext(allocatorCtx)
		if chromedpBrowserCtx == nil {
			allocatorCancel()
			newCancel()
			return
		}

		chromedpBrowserCancel = func() {
			newCancel()
			allocatorCancel()
			cancel()
		}
	})
	return nil
}

// ==================== PDF 导出 ====================

func handleExportPDF(c *gin.Context) {
	var req RenderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.Theme == "" {
		req.Theme = "default"
	}

	html, metadata := parseWithMetadata(req.Markdown)

	title := req.Title
	if title == "" {
		if t, ok := metadata["title"].(string); ok {
			title = t
		} else {
			title = "document"
		}
	}
	title = regexp.MustCompile(`[<>:"/\\|?*]`).ReplaceAllString(title, "_")

	// PDF 导出始终使用简洁版，不显示标题
	var fullHTML string
	if req.Scheme.CSS != "" {
		fullHTML = renderSchemeHTML(html, req.Scheme.CSS)
	} else {
		fullHTML = renderCleanHTML(html, req.Theme)
	}

	// 每次请求创建新的浏览器上下文
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	allocatorCtx, allocatorCancel := chromedp.NewExecAllocator(ctx,
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Headless,
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("enable-unsafe-swiftshader", true),
	)
	defer allocatorCancel()

	browserCtx, browserCancel := chromedp.NewContext(allocatorCtx)
	if browserCtx == nil {
		c.JSON(500, gin.H{"error": "无法创建浏览器上下文"})
		return
	}
	defer browserCancel()

	// 写入临时HTML文件
	tmpDir := os.TempDir()
	htmlFile := filepath.Join(tmpDir, fmt.Sprintf("pdf_%d.html", time.Now().UnixNano()))

	if err := os.WriteFile(htmlFile, []byte(fullHTML), 0644); err != nil {
		c.JSON(500, gin.H{"error": "写入临时文件失败: " + err.Error()})
		return
	}
	defer os.Remove(htmlFile)

	// 生成PDF
	var pdfBuf []byte
	fileURL := "file:///" + strings.ReplaceAll(htmlFile, "\\", "/")

	printToPDF := page.PrintToPDF().
		WithPrintBackground(true).
		WithDisplayHeaderFooter(false).
		WithPaperWidth(210 / 25.4).
		WithPaperHeight(297 / 25.4).
		WithMarginTop(0).
		WithMarginBottom(0).
		WithMarginLeft(0).
		WithMarginRight(0).
		WithScale(1.0)

	err := chromedp.Run(browserCtx,
		chromedp.Navigate(fileURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Sleep(300*time.Millisecond),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := printToPDF.Do(ctx)
			if err != nil {
				return err
			}
			pdfBuf = buf
			return nil
		}),
	)

	if err != nil {
		c.JSON(500, gin.H{"error": "PDF生成失败: " + err.Error()})
		return
	}

	if len(pdfBuf) == 0 {
		c.JSON(500, gin.H{"error": "PDF内容为空"})
		return
	}

	c.Header("Content-Type", "application/pdf")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.pdf", title))
	c.Data(200, "application/pdf", pdfBuf)
}

// ==================== AI 设计方案生成 ====================

const systemPrompt = `你是一个专业的 Markdown 文章视觉设计专家。

用户会给你一段风格描述，你需要生成 3 个「细化」的视觉设计方案。
这 3 个方案应该是在同一个风格方向下的不同细化版本，而非随机发散。

每个方案请返回一个完整的 JSON 对象，包含：
- name: 方案名称（中文，简短有力，如「暗夜极客」「商务蓝图」）
- description: 一句话描述设计理念
- prompt: 精确的设计指令文本（用于迭代优化，可以被复制后修改再生成）
- colors: 配色方案，7个颜色均为 #RRGGBB 格式
  - background: 正文背景色
  - text: 正文文字色
  - heading: 标题颜色
  - link: 链接颜色
  - code_bg: 代码块背景色
  - blockquote_border: 引用块边框色
  - table_border: 表格边框色
- typography: 字体方案
  - heading_font: 标题字体（CSS font-family）
  - body_font: 正文字体（CSS font-family）
  - code_font: 代码字体（CSS font-family）
  - base_size: 基础字号（如 "16px"）
  - line_height: 行高（如 "1.8"）
- spacing: 间距方案
  - paragraph_margin: 段落间距
  - section_margin: 章节间距
- effects: 特效描述
  - blockquote_style: 引用块样式描述
  - code_block_style: 代码块样式描述
  - hr_style: 分隔线样式描述
  - link_style: 链接样式描述
  - table_style: 表格样式描述

重要要求：
1. 3 个方案应该色调一致但细节不同（如同一个"科技感深色"方向下的不同实现）
2. colors 中每个颜色值必须是有效的 #RRGGBB 格式
3. prompt 应该是用户可以直接复制使用或修改的设计指令
4. 返回纯 JSON 数组，不要有 markdown 代码块标记，不要有其他解释文字

最终输出格式（严格遵循）：
[
  { "name": "方案1名称", "description": "描述", "prompt": "设计指令", "colors": {...}, "typography": {...}, "spacing": {...}, "effects": {...} },
  { "name": "方案2名称", "description": "描述", "prompt": "设计指令", "colors": {...}, "typography": {...}, "spacing": {...}, "effects": {...} },
  { "name": "方案3名称", "description": "描述", "prompt": "设计指令", "colors": {...}, "typography": {...}, "spacing": {...}, "effects": {...} }
]`

func handleAIGenerateSchemes(c *gin.Context) {
	var req AISchemeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.Description == "" {
		c.JSON(400, gin.H{"error": "description 不能为空"})
		return
	}

	// 构建发给 AI 的 prompt
	userPrompt := req.Description
	if req.BasePrompt != "" {
		userPrompt = fmt.Sprintf("请基于以下设计指令，生成 3 个细化版本。\n\n原设计指令：\n%s\n\n请在保持核心风格的基础上，提供 3 个更精细的不同实现。",
			req.BasePrompt)
	}

	// 构建发送给 Ollama 的完整消息
	messages := []map[string]string{
		{"role": "system", "content": systemPrompt},
		{"role": "user", "content": userPrompt},
	}

	if req.Context != "" {
		markdownPreview := req.Context
		if len(markdownPreview) > 500 {
			markdownPreview = markdownPreview[:500] + "..."
		}
		messages = append(messages, map[string]string{
			"role":    "user",
			"content": fmt.Sprintf("\n\n参考的文章内容片段：\n%s", markdownPreview),
		})
	}

	// Vector Engine API（OpenAI 兼容）
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		apiKey = "sk-LacBrmUT6QV5lYMgYKXUdQlogNzVVmZsEHlIp4ZDfGpCF63r"
	}

	payload := map[string]any{
		"model":       "gpt-4o",
		"messages":    messages,
		"temperature": 0.7,
	}

	payloadBytes, _ := json.Marshal(payload)
	reqHTTP, err := http.NewRequest("POST", "https://api.vectorengine.ai/v1/chat/completions", bytes.NewBuffer(payloadBytes))
	if err != nil {
		c.JSON(500, gin.H{"error": "创建请求失败: " + err.Error()})
		return
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		c.JSON(500, gin.H{"error": "无法连接 Vector Engine API: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		c.JSON(500, gin.H{"error": fmt.Sprintf("Vector Engine API 返回错误状态码: %d, body: %s", resp.StatusCode, string(bodyBytes))})
		return
	}

	var apiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &apiResp); err != nil {
		c.JSON(500, gin.H{"error": "解析 API 响应失败: " + err.Error()})
		return
	}

	if len(apiResp.Choices) == 0 {
		c.JSON(500, gin.H{"error": "API 返回空响应"})
		return
	}

	content := apiResp.Choices[0].Message.Content

	// 去掉可能的 markdown 代码块标记
	content = regexp.MustCompile("^```json\\s*").ReplaceAllString(content, "")
	content = regexp.MustCompile("^```\\s*").ReplaceAllString(content, "")
	content = regexp.MustCompile("\\s*```$").ReplaceAllString(content, "")
	content = strings.TrimSpace(content)

	// 尝试解析 JSON
	var schemes []AIScheme
	if err := json.Unmarshal([]byte(content), &schemes); err != nil {
		// 尝试修复常见问题：去掉开头的非JSON内容
		if idx := strings.Index(content, "["); idx >= 0 {
			trimmed := content[idx:]
			if idx := strings.LastIndex(trimmed, "]"); idx >= 0 {
				trimmed = trimmed[:idx+1]
				if err2 := json.Unmarshal([]byte(trimmed), &schemes); err2 == nil {
					goto parseOK
				}
			}
		}
		c.JSON(500, gin.H{
			"error":   "AI 返回格式解析失败",
			"raw":     content,
			"details": err.Error(),
		})
		return
	}

parseOK:
	// 为每个方案生成 CSS
	for i := range schemes {
		schemes[i].CSS = compileSchemeCSS(schemes[i])
	}

	// 返回使用的完整 prompt
	fullPrompt := userPrompt

	c.JSON(200, AISchemeResponse{
		Schemes:    schemes,
		UsedPrompt: fullPrompt,
	})
}

func compileSchemeCSS(scheme AIScheme) string {
	c := scheme.Colors
	t := scheme.Typography
	s := scheme.Spacing

	return fmt.Sprintf(`body {
  background: %s;
  color: %s;
  font-family: %s;
  font-size: %s;
  line-height: %s;
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem;
}
h1, h2, h3, h4, h5, h6 {
  font-family: %s;
  color: %s;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}
h1 { font-size: 2em; border-bottom: 1px solid %s; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid %s; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
p { margin: %s 0; }
a { color: %s; }
code {
  background: %s;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: %s;
  font-size: 0.9em;
}
pre {
  background: %s;
  padding: 1rem;
  border-radius: 5px;
  overflow-x: auto;
  margin: 1.2em 0;
}
pre code { background: none; padding: 0; }
blockquote {
  border-left: 4px solid %s;
  margin: 1em 0;
  padding-left: 1rem;
  font-style: italic;
  color: %s;
}
img { max-width: 100%%; height: auto; }
hr {
  border: none;
  border-top: 1px solid %s;
  margin: 2rem 0;
}
table { border-collapse: collapse; width: 100%%; margin: 1em 0; }
th, td { border: 1px solid %s; padding: 0.5rem; }
th { background: %s; }
ul, ol { margin: 1em 0; padding-left: 2em; }
li { margin: 0.4em 0; }
`, c.Background, c.Text, t.BodyFont, t.BaseSize, t.LineHeight,
		t.HeadingFont, c.Heading, c.Background, c.Background,
		s.ParagraphMargin, c.Link, c.CodeBg, t.CodeFont,
		c.CodeBg, c.BlockquoteBorder, c.Text, c.Background, c.TableBorder, c.Background)
}

func handleAIRenderScheme(c *gin.Context) {
	var req struct {
		Markdown string    `json:"markdown"`
		Scheme   AIScheme  `json:"scheme"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	html := string(parseMarkdown(req.Markdown))

	// 只返回纯 HTML 内容，前端负责注入到 preview-content 容器中
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(200, html)
}

// ==================== Gemini 图片生成与分析 ====================

// Gemini 图片生成的 Prompt 模板（生成 3 张不同风格）
func buildDesignImagePrompt(description string, styleIndex int) string {
	styleNames := []string{
		"Modern Minimalist",
		"Editorial Classic",
		"Tech Dark Mode",
	}
	styleName := styleNames[styleIndex]

	return fmt.Sprintf(`Create a high-quality design mockup of a Markdown article layout page.
Style: %s

Requirements:
- Show a clean webpage with article typography: a large title/heading, body paragraphs, a code block, a blockquote, and a simple table
- Use elegant typography with clear hierarchy (display the heading in a larger, bolder font; body in a comfortable reading size)
- Color palette should be visually appealing and cohesive
- Background and text must have good contrast for readability
- Use English placeholder text only (e.g., "Article Title", "Lorem ipsum dolor", "Code example here")
- Modern, distinctive design - NOT a generic bland template
- Aspect ratio: 16:9, resolution: 1K
- The page should look like a professional design concept, not a screenshot
- Show the content in a centered reading column (max-width: 720px style), floating on the page
- For the code block, show syntax highlighting style
- For the blockquote, show left border styling
- Include subtle but tasteful decorative elements
`, styleName)
}

// Gemini Vision 分析图片的 Prompt
const analyzeImagePrompt = `You are an expert design analyst. Analyze the provided design mockup image and extract the exact design specifications for a Markdown article typography system.

Extract and return ONLY a valid JSON object with this exact structure:
{
  "name": "A short creative name for this design style (e.g., 'Midnight Editorial', 'Nordic Light', 'Cyber Mono')",
  "description": "One sentence describing the design philosophy",
  "colors": {
    "background": "#RRGGBB",
    "text": "#RRGGBB",
    "heading": "#RRGGBB",
    "link": "#RRGGBB",
    "code_bg": "#RRGGBB",
    "blockquote_border": "#RRGGBB",
    "table_border": "#RRGGBB"
  },
  "typography": {
    "heading_font": "Best matching Google Font family for headings, e.g. 'Playfair Display, Georgia, serif'",
    "body_font": "Best matching Google Font family for body, e.g. 'Source Sans 3, -apple-system, sans-serif'",
    "code_font": "Monospace font, e.g. 'JetBrains Mono, Fira Code, monospace'",
    "base_size": "base font size in px, e.g. '16px'",
    "line_height": "line height ratio, e.g. '1.8'"
  },
  "spacing": {
    "paragraph_margin": "CSS margin for paragraphs, e.g. '1em 0'",
    "section_margin": "CSS margin for sections, e.g. '1.5em 0'"
  },
  "effects": {
    "blockquote_style": "Brief description of blockquote visual treatment",
    "code_block_style": "Brief description of code block visual treatment",
    "hr_style": "Brief description of horizontal rule style",
    "link_style": "Brief description of link styling",
    "table_style": "Brief description of table styling"
  }
}

Critical requirements:
- Return ONLY the JSON object, nothing else before or after
- All color values MUST be valid #RRGGBB format (6 hex digits)
- Fonts must be real, commonly available fonts
- base_size must be a valid CSS pixel value like "16px" or "18px"
- line_height must be a decimal number like "1.8" or "1.6"
- paragraph_margin and section_margin must be valid CSS margin values`

// Gemini API 基础 URL（VectorEngine 中转，支持 OpenAI 兼容格式）
const geminiAPIURL = "https://api.vectorengine.ai/v1/chat/completions"

// Gemini 图片生成模型
const geminiImageModel = "gemini-3.1-flash-image-preview"
const geminiVisionModel = "gemini-2.0-flash"

// VectorEngine API Key（使用已有的中转 key）
func getVectorEngineAPIKey() string {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		apiKey = "sk-LacBrmUT6QV5lYMgYKXUdQlogNzVVmZsEHlIp4ZDfGpCF63r"
	}
	return apiKey
}

// handleAIGenerateDesignImage 生成设计示意图
func handleAIGenerateDesignImage(c *gin.Context) {
	var req DesignImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.Description == "" {
		c.JSON(400, gin.H{"error": "description 不能为空"})
		return
	}

	apiKey := getVectorEngineAPIKey()

	// 生成 3 张不同风格的设计图
	var images []DesignImage
	styleNames := []string{"现代简约", "编辑古典", "科技暗色"}
	usedPrompt := req.Description

	for i := 0; i < 3; i++ {
		prompt := buildDesignImagePrompt(req.Description+" - "+styleNames[i], i)

		imageBase64, err := callGeminiImageAPI(apiKey, prompt)
		if err != nil {
			log.Printf("[AI设计图] 第%d张失败: %v", i+1, err)
			continue
		}

		images = append(images, DesignImage{
			ImageBase64: imageBase64,
			DesignNotes: styleNames[i],
			StyleName:   styleNames[i],
		})
	}

	if len(images) == 0 {
		c.JSON(500, gin.H{"error": "所有设计图生成失败，请检查 API 配置"})
		return
	}

	c.JSON(200, DesignImageResponse{
		Images:     images,
		UsedPrompt: usedPrompt,
	})
}

// callGeminiImageAPI 调用 Gemini 图片生成 API（通过 VectorEngine 中转，OpenAI 兼容格式）
func callGeminiImageAPI(apiKey string, prompt string) (string, error) {
	payload := map[string]any{
		"model": geminiImageModel,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{"type": "text", "text": prompt},
				},
			},
		},
	}

	payloadBytes, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", geminiAPIURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 180 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("API 返回错误: %d - %s", resp.StatusCode, string(bodyBytes))
	}

	// 解析 OpenAI 兼容格式响应
	var apiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(bodyBytes, &apiResp); err != nil {
		return "", fmt.Errorf("解析响应失败: %v，原始: %s", err, string(bodyBytes[:min(300, len(bodyBytes))]))
	}

	if len(apiResp.Choices) == 0 {
		return "", fmt.Errorf("API 返回空响应: %s", string(bodyBytes[:min(300, len(bodyBytes))]))
	}

	content := apiResp.Choices[0].Message.Content

	// 检查是否有 base64 图片（可能在 [images-0] 或其他格式中）
	// VectorEngine Gemini 图片模式可能返回不同的格式，尝试多种解析方式
	// 方式1: 尝试直接返回 base64 字符串
	content = strings.TrimSpace(content)

	// 去掉可能的 markdown 代码块
	content = regexp.MustCompile("^```(?:json)?\\s*").ReplaceAllString(content, "")
	content = regexp.MustCompile("\\s*```$").ReplaceAllString(content, "")

	// 尝试解析为包含 base64 图片的 JSON
	var imgData struct {
		ImageBase64 string `json:"image_base64"`
		Image       string `json:"image"`
		Base64      string `json:"base64"`
		Data        string `json:"data"`
		URL         string `json:"url"`
	}

	if err := json.Unmarshal([]byte(content), &imgData); err == nil {
		if imgData.ImageBase64 != "" {
			return imgData.ImageBase64, nil
		}
		if imgData.Image != "" {
			return imgData.Image, nil
		}
		if imgData.Base64 != "" {
			return imgData.Base64, nil
		}
	}

	// 方式2: 从文本中提取 base64
	base64Re := regexp.MustCompile(`data:image/[\w]+;base64,([A-Za-z0-9+/=]+)`)
	matches := base64Re.FindStringSubmatch(content)
	if len(matches) >= 2 {
		return matches[1], nil
	}

	// 方式3: 尝试直接匹配 base64 字符串（长串）
	directBase64 := regexp.MustCompile(`([A-Za-z0-9+/]{100,}={0,2})`)
	dmatch := directBase64.FindStringSubmatch(content)
	if len(dmatch) >= 2 {
		return dmatch[1], nil
	}

	return "", fmt.Errorf("未找到图片数据，响应内容: %s", content[:min(500, len(content))])
}

// handleAIAnalyzeDesignImage 分析设计图，提取设计规范
func handleAIAnalyzeDesignImage(c *gin.Context) {
	var req AnalyzeImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.ImageBase64 == "" {
		c.JSON(400, gin.H{"error": "image_base64 不能为空"})
		return
	}

	apiKey := getVectorEngineAPIKey()

	// 解码 base64 获取图片数据
	imageData, err := base64.StdEncoding.DecodeString(req.ImageBase64)
	if err != nil {
		c.JSON(400, gin.H{"error": "无效的 base64 图片数据"})
		return
	}

	// 检测图片格式
	mimeType := "image/png"
	if len(imageData) >= 2 {
		if imageData[0] == 0xFF && imageData[1] == 0xD8 {
			mimeType = "image/jpeg"
		}
	}

	scheme, err := callGeminiVisionAPI(apiKey, imageData, mimeType, req.DesignType)
	if err != nil {
		c.JSON(500, gin.H{"error": "图片分析失败: " + err.Error()})
		return
	}

	// 生成 CSS
	scheme.CSS = compileSchemeCSS(scheme)

	c.JSON(200, AnalyzeImageResponse{
		Scheme:    scheme,
		UsedNotes: "通过 Gemini Vision 分析设计图提取",
	})
}

// callGeminiVisionAPI 调用 Gemini Vision 分析图片（通过 VectorEngine 中转，OpenAI 兼容格式）
func callGeminiVisionAPI(apiKey string, imageData []byte, mimeType string, designType string) (AIScheme, error) {
	// 构建 prompt，根据 designType 添加上下文
	userPrompt := analyzeImagePrompt
	if designType != "" {
		userPrompt = fmt.Sprintf("%s\n\nHint: The overall theme is '%s' style.", analyzeImagePrompt, designType)
	}

	// OpenAI 兼容格式：图片用 base64
	payload := map[string]any{
		"model": geminiVisionModel,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "text",
						"text": userPrompt,
					},
					{
						"type":      "image_url",
						"image_url": map[string]string{"url": fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imageData))},
					},
				},
			},
		},
	}

	payloadBytes, _ := json.Marshal(payload)
	httpReq, err := http.NewRequest("POST", geminiAPIURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return AIScheme{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return AIScheme{}, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return AIScheme{}, err
	}

	if resp.StatusCode != 200 {
		return AIScheme{}, fmt.Errorf("API 返回错误: %d - %s", resp.StatusCode, string(bodyBytes))
	}

	// 解析 OpenAI 兼容格式响应
	var apiResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(bodyBytes, &apiResp); err != nil {
		return AIScheme{}, fmt.Errorf("解析响应失败: %v，原始: %s", err, string(bodyBytes[:min(300, len(bodyBytes))]))
	}

	if len(apiResp.Choices) == 0 {
		return AIScheme{}, fmt.Errorf("API 返回空响应: %s", string(bodyBytes[:min(300, len(bodyBytes))]))
	}

	content := apiResp.Choices[0].Message.Content

	// 提取 JSON（去掉可能的 markdown 代码块标记）
	content = regexp.MustCompile("^```(?:json)?\\s*").ReplaceAllString(content, "")
	content = regexp.MustCompile("\\s*```$").ReplaceAllString(content, "")
	content = strings.TrimSpace(content)

	// 解析 JSON
	var scheme AIScheme
	if err := json.Unmarshal([]byte(content), &scheme); err != nil {
		// 尝试修复：找到 JSON 对象的开始和结束
		if idx := strings.Index(content, "{"); idx >= 0 {
			trimmed := content[idx:]
			if endIdx := strings.LastIndex(trimmed, "}"); endIdx >= 0 {
				trimmed = trimmed[:endIdx+1]
				if err2 := json.Unmarshal([]byte(trimmed), &scheme); err2 != nil {
					return AIScheme{}, fmt.Errorf("解析设计规范失败: %v (原始内容: %s)", err2, content[:min(300, len(content))])
				}
				return scheme, nil
			}
		}
		return AIScheme{}, fmt.Errorf("解析设计规范失败: %v", err)
	}

	return scheme, nil
}
