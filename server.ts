import express from 'express';
import path from 'path';
import fs from 'fs';
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

  // Explicitly serve SEO files from public directory
  const publicPath = path.join(process.cwd(), 'public');
  
  app.get('/robots.txt', (req, res) => {
    res.sendFile(path.join(publicPath, 'robots.txt'));
  });

  // Dynamic Sitemap Generation
  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = 'https://gonow247.com';
    const categories = ['home', 'politics', 'business', 'football', 'entertainment', 'technology', 'things-to-know', 'about', 'contribute'];
    
    // We'll import data.js dynamically or just use the IDs we know
    // Since we're in server.ts (Node), we can try to require it if it was CJS, but it's ESM.
    // To keep it simple and robust, I'll define the core articles or just the categories here.
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Add Categories
    categories.forEach(cat => {
      xml += `
  <url>
    <loc>${baseUrl}/${cat}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${cat === 'home' ? '1.0' : '0.8'}</priority>
  </url>`;
    });

    // Add Articles placeholder (In a real app, you'd fetch all Firestore IDs)
    // For now, I'll add the IDs from data.js as a starting point
    const articleIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'f1', 'f2', 'f3', 'f4', 'f5', 'e1', 'e2', 'e3', 'e4', 'e5', 't1', 't2', 't3', 't4', 't5'];
    articleIds.forEach(id => {
      xml += `
  <url>
    <loc>${baseUrl}/article/${id}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    xml += '\n</urlset>';
    res.set('Content-Type', 'text/xml');
    res.send(xml);
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

  // Redirect root to /home
  app.get('/', (req, res) => {
    res.redirect('/home');
  });

  // 2. SEO & META INJECTION MIDDLEWARE
  app.get('*', async (req, res, next) => {
    // Skip API, RSS, Sitemap, Robots, Ads, and assets with extensions
    if (req.url.startsWith('/api') || req.url === '/rss' || req.url === '/sitemap.xml' || req.url === '/robots.txt' || req.url === '/ads.txt' || req.url.includes('.')) {
      return next();
    }
    
    try {
      const isProd = process.env.NODE_ENV === 'production';
      const templatePath = isProd ? path.join(process.cwd(), 'dist', 'index.html') : path.join(process.cwd(), 'index.html');
      
      // Check if file exists to prevent crash
      if (!fs.existsSync(templatePath)) {
        return next();
      }

      let html = fs.readFileSync(templatePath, 'utf8');
      
      // Determine Meta Tags based on path
      const pathUrl = req.path;
      let title = 'GoNow | Latest News, Tech & Football';
      let description = 'GoNow — your daily dose of news, football scores, tech, and entertainment. Fast, clean, ad-light.';
      let image = 'https://images.unsplash.com/photo-1585829365234-781fcd50c45b?q=80&w=1200&h=630&auto=format&fit=crop';

      if (pathUrl === '/politics') {
        title = 'Global Politics News: Breaking Updates | GoNow';
        description = 'Stay informed with the latest global politics news, in-depth analysis, and trending reports on GoNow Intelligence.';
      } else if (pathUrl === '/football') {
        title = 'Football Central: Live Scores & Transfer News | GoNow';
        description = 'Get real-time football scores, match highlights, and latest transfer news from elite leagues worldwide on GoNow.';
      } else if (pathUrl === '/entertainment') {
        title = 'Pop Culture & Entertainment: Celebrity & Movie Trends | GoNow';
        description = 'The latest entertainment news, celebrity gossip, and trending pop culture stories worldwide. GoNow Entertainment.';
      } else if (pathUrl === '/technology') {
        title = 'Tech Innovation: Future Gadgets & Innovations | GoNow';
        description = 'Explore the cutting edge of technology, future gadgets, and tech innovations. GoNow Tech Innovation Desk.';
      } else if (pathUrl === '/business') {
        title = 'Business Journal: Market Trends & Finance | GoNow';
        description = 'Get the latest business news, stock market updates, and economic analysis. GoNow Business Journal.';
      } else if (pathUrl === '/things-to-know') {
        title = 'Things To Know: Facts & Deep Dives | GoNow';
        description = 'Expand your horizons with fascinating facts and deep dives into history, science, and more on the GoNow Knowledge Desk.';
      } else if (pathUrl === '/about') {
        title = 'About GoNow: Our News Mission & Vision | GoNow';
        description = 'Discover how GoNow is redefining news consumption with a fast, clean, and ad-light interface dedicated to the truth.';
      } else if (pathUrl === '/contribute') {
        title = 'Support GoNow Intelligence: Reader Revenue | GoNow';
        description = 'Help support independent, verified journalism. Your contributions help GoNow maintain high-authority reporting and ad-light experiences.';
      } else if (pathUrl === '/privacy') {
        title = 'Privacy Trust & Data Ethics | GoNow Intelligence';
        description = 'Learn about our commitment to user privacy, data security, and transparent journalism standards.';
      } else if (pathUrl === '/terms') {
        title = 'Terms of Service & Full Disclosure | GoNow';
        description = 'Understanding the terms of use for GoNow news portal and our content attribution standards.';
      } else if (pathUrl.startsWith('/article/')) {
        const id = pathUrl.split('/')[2];
        title = `Special Report: ${id.toUpperCase()} | GoNow Intelligence`;
        description = 'Read the full report and in-depth analysis on GoNow News.';
      }

      // Inject into HTML with more robust replacement (case-insensitive and tolerant of minification)
      html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
      html = html.replace(/<meta\s+name="description"\s+content=".*?"\/?>/i, `<meta name="description" content="${description}">`);
      
      // Social/OG Injection
      html = html.replace(/property="og:title"\s+content=".*?"/gi, `property="og:title" content="${title}"`);
      html = html.replace(/property="og:description"\s+content=".*?"/gi, `property="og:description" content="${description}"`);
      html = html.replace(/property="og:image"\s+content=".*?"/gi, `property="og:image" content="${image}"`);
      html = html.replace(/property="og:url"\s+content=".*?"/gi, `property="og:url" content="https://gonow247.com${pathUrl}"`);

      // Twitter Injection
      html = html.replace(/name="twitter:title"\s+content=".*?"/gi, `name="twitter:title" content="${title}"`);
      html = html.replace(/name="twitter:description"\s+content=".*?"/gi, `name="twitter:description" content="${description}"`);
      html = html.replace(/name="twitter:image"\s+content=".*?"/gi, `name="twitter:image" content="${image}"`);

      // Canonical
      html = html.replace(/link\s+rel="canonical"\s+href=".*?"/gi, `<link rel="canonical" href="https://gonow247.com${pathUrl}">`);
      
      return res.send(html);
    } catch (e) {
      console.error('Meta injection error:', e);
      return next();
    }
  });

  // 3. Static setup
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
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GoNow App Server running at http://0.0.0.0:${PORT}`);
    console.log(`- RSS Feed: http://0.0.0.0:${PORT}/rss`);
    console.log(`- Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
