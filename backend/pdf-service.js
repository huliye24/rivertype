const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/export/pdf', async (req, res) => {
  const { html, options } = req.body;
  if (!html) {
    return res.status(400).json({ error: 'html is required' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const defaultOptions = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
    };
    const pdfOptions = { ...defaultOptions, ...options };

    const pdf = await page.pdf(pdfOptions);
    res.set('Content-Type', 'application/pdf');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`PDF service running on http://localhost:${PORT}`);
});
