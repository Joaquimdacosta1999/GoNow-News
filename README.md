# GoNow - News, Knowledge & Entertainment

GoNow is a high-performance, mobile-first news and lifestyle portal built with pure vanilla HTML, CSS, and JavaScript. It features a clean, modern interface with instant page transitions and a focus on readability.

## Features

- **Vanilla Tech Stack:** No frameworks, no heavy libraries. Just pure web standards.
- **SPA Architecture:** Instant page switching using hash routing.
- **Dark/Light Mode:** Smooth transitions with persistent user preference.
- **5 Categories:** Politics, Football, Entertainment, Tech, and Daily HTML lessons.
- **Grid & List Views:** Toggle between visual grids and quick-reading lists on any category page.
- **Saved Items:** Bookmark your favorite articles and lessons, automatically grouped by category.
- **Daily Digest:** "On This Day" history, daily quotes, and daily lessons.
- **Search:** Instant search across all content.
- **Responsive:** Optimized for mobile, tablet, and desktop.

## How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd gonow
   ```

2. **Open in Browser:**
   Since this is a vanilla project, you can simply open `index.html` in any modern web browser.

3. **Using a Dev Server (Recommended):**
   If you have Node.js installed, you can use `vite` or `live-server`:
   ```bash
   npm install
   npm run dev
   ```

## Deployment to Vercel

1. **Push to GitHub:** Create a new repository on GitHub and push your code.
2. **Connect to Vercel:**
   - Go to [Vercel](https://vercel.com).
   - Click "Add New" -> "Project".
   - Import your GitHub repository.
3. **Configure:**
   - Framework Preset: **Other** or **Vite** (if using the provided package.json).
   - Build Command: `npm run build` (if using Vite) or leave empty for pure static.
   - Output Directory: `dist` (if using Vite) or `.` for pure static.
4. **Deploy:** Click "Deploy". Your site will be live in seconds!

## Customization

### Changing the Logo
The logo is an SVG defined in `index.html`. To change it:
1. Open `index.html`.
2. Find the `<a href="#home" class="logo">` tag.
3. Replace the `<svg>` with your own SVG or an `<img>` tag.

### Changing the Favicon
The favicon is a Data URI SVG in `index.html`. To use a real file:
1. Replace the `<link rel="icon" ...>` tag in `index.html` with:
   ```html
   <link rel="icon" type="image/png" href="/path/to/your/favicon.png">
   ```

## Adding a Real News API
To replace the mock data with real news:
1. Sign up for an API key at [NewsAPI.org](https://newsapi.org) or [GNews.io](https://gnews.io).
2. In `script.js`, create a function to fetch data:
   ```javascript
   async function fetchNews() {
     const response = await fetch('https://newsapi.org/v2/top-headlines?country=us&apiKey=YOUR_KEY');
     const data = await response.json();
     return data.articles;
   }
   ```
3. Update the `renderPage` logic to use the fetched data instead of `newsData`.

---
Built with ❤️ by GoNow Team
