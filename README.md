# GoNow - 2026 News & Lifestyle Portal

GoNow is a high-performance, mobile-first news and lifestyle portal built with **Modern Vanilla JavaScript**, supported by **Firebase** and **RSS Data Synchronization**. It features a clean, professional interface with robust SEO support, real-time updates, and advanced navigation.

## Key Features

- **Real-Time RSS Sync:** Automatic fetching from global news sources every 5 minutes with cache-busting.
- **Deep Story Engagement:** Articles feature 150-350 words excerpts for high value per click.
- **Path-Based Routing:** Clean, SEO-friendly URLs (`/article/id`, `/politics`, etc.) for better indexing.
- **SEO Optimized:** Dynamic meta tags, JSON-LD structured data, and skeleton content for crawlers.
- **Interactive Portal:**
    - **Comments System:** Real-time engagement powered by Firebase.
    - **Pagination:** Navigate through 100+ articles per category.
    - **Related Stories:** Discover more content from the same category instantly.
    - **Saved Items:** Persistent bookmarking across sessions.
- **Admin Dashboard:** Full-featured panel for publishing, managing, and deleting articles.
- **Performance Focused:**
    - **Lazy Loading & Async Decoding:** Optimized image delivery.
    - **Sanitized Content:** XSS protection via DOMPurify.
    - **Dark/Light Mode:** First-class support for user theme preferences.

## Tech Stack

- **Frontend:** Vanilla JS, HTML5, Modern CSS (Flex/Grid).
- **Backend:** Node.js + Express (for routing and dev server).
- **Database/Auth:** Firebase Firestore & Google Auth.
- **Build Tool:** Vite 6.0 for production-grade bundling.

## How to Run Locally

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Dev Server:**
   ```bash
   npm run dev
   ```
   The site will be available on `http://localhost:3000`.

## Configuration

### Environment Variables
Setup your Firebase config in `firebase-applet-config.json` and ensure your server environment has `GEMINI_API_KEY` set if using AI features.

### SEO & Marketing
- **Google Analytics:** Update the `G-XXXXXXXXXX` ID in `index.html`.
- **AdSense:** Update the `ca-pub-XXXXXXXX` client ID in `index.html`.

---
Built with ❤️ by GoNow Team (Spring 2026)
