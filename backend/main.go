package main

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
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

// 类型定义
type RenderRequest struct {
	Markdown   string `json:"markdown"`
	Theme      string `json:"theme"`
	FullPage   bool   `json:"full_page"`
	IncludeToc bool   `json:"include_toc"`
	Title      string `json:"title"`
}

type RenderResponse struct {
	HTML     template.HTML        `json:"html"`
	Toc      []TOCItem            `json:"toc,omitempty"`
	Metadata map[string]any       `json:"metadata"`
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

// 主题CSS
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

	// 健康检查
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	fmt.Println("Server running on http://localhost:8080")
	r.Run(":8080")
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
	fullHTML = renderCleanHTML(html, req.Theme)

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
		WithPaperWidth(210 / 25.4).
		WithPaperHeight(297 / 25.4).
		WithMarginTop(20 / 25.4).
		WithMarginBottom(20 / 25.4).
		WithMarginLeft(20 / 25.4).
		WithMarginRight(20 / 25.4).
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
