import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // Mocked RSS feed for aggregators (would ideally pull from Firestore)
  app.get('/rss', (req, res) => {
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title>GoNow | Latest News, Tech & Football</title>
  <link>https://gonow247.com</link>
  <description>GoNow — your daily dose of news, football scores, tech, and entertainment. Fast, clean, ad-light.</description>
  <item>
    <title>GoNow Portal is Live</title>
    <link>https://gonow247.com/home</link>
    <description>Welcome to the new GoNow portal, powered by real-time streams and clean design.</description>
    <pubDate>${new Date().toUTCString()}</pubDate>
  </item>
</channel>
</rss>`);
  });

  // 2. Vite / Static setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Fallback: Serve index.html for all other routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Handle SPA fallback for dev as well (handled by Vite's middlewareMode: 'spa' usually, 
  // but we enforce it if needed)
  app.get('*', async (req, res, next) => {
    if (req.url.startsWith('/api') || req.url === '/rss') return next();
    
    // For local dev, serve index.html
    try {
      res.sendFile(path.join(process.cwd(), 'index.html'));
    } catch (e) {
      next(e);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoNow App Server running at http://0.0.0.0:${PORT}`);
    console.log(`- RSS Feed: http://0.0.0.0:${PORT}/rss`);
    console.log(`- Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
