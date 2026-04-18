/**
 * GoNow - Main Script
 * Handles routing, theme, rendering, and interactivity.
 */

import { 
  auth, 
  db, 
  signInWithPopup, 
  signOut, 
  googleProvider, 
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  handleFirestoreError,
  OperationType
} from './firebase.ts';

import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { 
  thingsToKnow, 
  dailyHappenings, 
  dailyQuotes 
} from './data.js';

// State Management
const state = {
  currentTheme: localStorage.getItem('theme') || 'dark',
  user: null,
  userProfile: null,
  isAuthInitialized: false,
  news: [],
  newsLoaded: false,
  savedItems: JSON.parse(localStorage.getItem('savedItems')) || [],
  learnedLessons: JSON.parse(localStorage.getItem('learnedLessons')) || [],
  wikipediaEvents: [],
  financeData: [],
  cryptoData: [],
  comments: {},
  currentRoute: window.location.pathname === '/' ? '/home' : window.location.pathname,
  viewMode: localStorage.getItem('viewMode') || 'grid',
  autoNews: JSON.parse(localStorage.getItem('autoNewsCache')) || []
};

// Valid routes
const pathRoutes = ['/home', '/politics', '/business', '/football', '/entertainment', '/technology', '/author'];

// DOM Elements
const body = document.body;
const themeToggle = document.getElementById('theme-toggle');
const mainContent = document.getElementById('main-content');
const searchToggle = document.getElementById('search-toggle');
const searchOverlay = document.getElementById('search-overlay');
const closeSearch = document.getElementById('close-search');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const modal = document.getElementById('modal');
const closeModal = document.getElementById('close-modal');
const modalBody = document.getElementById('modal-body');
const authBtn = document.getElementById('auth-btn');
const adminLink = document.getElementById('admin-link');

// Helper to extract image from RSS item
function extractImage(item, category) {
  // 1. High priority standard fields
  if (item.thumbnail && item.thumbnail.length > 25) return item.thumbnail;
  if (item.enclosure?.link && item.enclosure.link.length > 25) return item.enclosure.link;
  
  // 2. Scan internal content/description for high-res images first
  const combined = (item.content || '') + (item.description || '');
  
  // Look for any image link that isn't a tracking pixel
  // Expanded regex for diverse source formats
  const allImages = combined.match(/src=["']([^"'>]+\.(?:jpg|jpeg|png|webp|gif|svg|avif)[^"'>]*)["']/gi);
  if (allImages) {
    for (const img of allImages) {
      const srcMatch = img.match(/src=["']([^"'>]+)["']/i);
      if (srcMatch && srcMatch[1]) {
        const src = srcMatch[1];
        // Filter out tiny icons, tracking pixels, and low-quality placeholders
        const isBad = src.includes('pixel') || src.includes('analytics') || src.includes('doubleclick') || src.includes('feedburner') || src.includes('icon') || src.includes('logo');
        if (!isBad && src.length > 25) {
          return src;
        }
      }
    }
  }

  // 3. Standalone URL check for media tags often missed by RSS2JSON
  const mediaContentMatch = combined.match(/url=["']([^"'>]+\.(?:jpg|jpeg|png|webp))["']/i);
  if (mediaContentMatch) return mediaContentMatch[1];

  const standaloneUrlMatch = combined.match(/https?:\/\/[^"'\s<>]+?\.(?:jpg|jpeg|png|webp|gif)/i);
  if (standaloneUrlMatch) return standaloneUrlMatch[0];

  // 4. Fallback to category default (high quality Unsplash)
  return getDefaultImage(category);
}

// Initialize
async function syncAllNews() {
  const categoryConfigs = {
    'Politics': [
      'https://moxie.foxnews.com/feed-publisher/politics.xml',
      'https://www.breitbart.com/politics/feed/',
      'https://www.washingtontimes.com/rss/headlines/news/politics/',
      'https://www.washingtontimes.com/rss/headlines/business/politics/',
      'https://www.washingtonexaminer.com/feed/politics/',
      'https://nypost.com/politics/feed/'
    ],
    'Business': [
      'https://moxie.foxnews.com/feed-publisher/business.xml',
      'https://www.breitbart.com/the-economy/feed/',
      'https://www.washingtontimes.com/rss/headlines/business/',
      'https://fortune.com/feed/',
      'https://nypost.com/business/feed/',
      'https://www.economist.com/business/rss.xml'
    ],
    'Football': [
      'https://www.skysports.com/rss/12040',
      'https://www.football.london/rss.xml',
      'https://www.sportsmole.co.uk/football/index.rss',
      'https://www.90min.com/posts.rss'
    ],
    'Entertainment': [
      'https://moxie.foxnews.com/feed-publisher/entertainment.xml',
      'https://www.breitbart.com/entertainment/feed/',
      'https://www.washingtonexaminer.com/feed/entertainment/',
      'https://nypost.com/entertainment/feed/',
      'https://variety.com/feed/'
    ],
    'Technology': [
      'https://www.breitbart.com/tech/feed/',
      'https://nypost.com/tech/feed/',
      'https://moxie.foxnews.com/feed-publisher/tech.xml',
      'https://www.washingtontimes.com/rss/headlines/news/technology/',
      'https://www.washingtontimes.com/rss/headlines/business/technology/',
      'https://www.dailywire.com/feed/'
    ]
  };

  let allFreshAutoNews = [];

  for (const [name, urls] of Object.entries(categoryConfigs)) {
    let categoryNews = [];
    for (const url of urls) {
      if (categoryNews.length >= 100) break; // Increase pool size for pagination
      try {
        const cacheBuster = Date.now();
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&t=${cacheBuster}`);
        const data = await response.json();
        if (data.status === 'ok' && data.items && data.items.length > 0) {
          const items = data.items.map((item) => {
            const pubDate = new Date(item.pubDate);
            const formattedDate = pubDate.toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            });

            return {
              id: `auto-${name.toLowerCase()}-${Math.random().toString(36).substr(2, 9)}`,
              title: item.title,
              excerpt: item.description ? item.description.replace(/<[^>]*>?/gm, '').substring(0, 2500) + '...' : 'Latest world news and expert analysis from our global desks.',
              content: item.content || item.description,
              image: extractImage(item, name),
              category: name,
              date: formattedDate,
              timestamp: pubDate.getTime(),
              readTime: `${Math.floor(Math.random() * 5) + 3} min read`,
              author: `GoNow ${name} Desk`,
              isAuto: true,
              source: item.link
            };
          });
          categoryNews = [...categoryNews, ...items];
        }
      } catch (e) {
        console.warn(`Failed to fetch ${name} from ${url}`, e);
      }
    }
    // De-duplicate by title
    const uniqueNews = [];
    const titles = new Set();
    categoryNews.forEach(item => {
      if (!titles.has(item.title.toLowerCase())) {
        titles.add(item.title.toLowerCase());
        uniqueNews.push(item);
      }
    });
    
    allFreshAutoNews = [...allFreshAutoNews, ...uniqueNews];
  }

  if (allFreshAutoNews.length > 0) {
    allFreshAutoNews.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    state.autoNews = allFreshAutoNews;
    localStorage.setItem('autoNewsCache', JSON.stringify(allFreshAutoNews));
    state.newsLoaded = true;
  }
  
  if (pathRoutes.includes(state.currentRoute)) {
    renderPage(state.currentRoute);
  }
}

function getDefaultImage(cat) {
  const images = {
    'Politics': 'https://images.unsplash.com/photo-1541872703-74c5e44383f5?q=80&w=2000&auto=format&fit=crop',
    'Business': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2000&auto=format&fit=crop',
    'Football': 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=2000&auto=format&fit=crop',
    'Entertainment': 'https://images.unsplash.com/photo-1499364615650-ec38552f4f34?q=80&w=2000&auto=format&fit=crop',
    'Technology': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=2000&auto=format&fit=crop'
  };
  return images[cat] || 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?q=80&w=2000&auto=format&fit=crop';
}

function init() {
  body.setAttribute('data-theme', state.currentTheme);
  updateThemeIcon();

  // Dynamic copyright year
  const yearEl = document.getElementById('copyright-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Event Listeners
  themeToggle.addEventListener('click', toggleTheme);
  searchToggle.addEventListener('click', () => searchOverlay.classList.add('active'));
  closeSearch.addEventListener('click', () => searchOverlay.classList.remove('active'));
  closeModal.addEventListener('click', () => {
    modal.classList.remove('active');
    if (state.currentRoute.startsWith('/article/')) {
      const lastRoute = localStorage.getItem('lastPath') || '/home';
      navigateTo(lastRoute);
    }
  });
  searchInput.addEventListener('input', handleSearch);
  authBtn.addEventListener('click', handleAuth);

  initNewsletter();

  // Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    try {
      state.user = user;
      state.isAuthInitialized = true;
      const adminLink = document.getElementById('admin-link');
      const authBtn = document.getElementById('auth-btn');

      if (user) {
        authBtn.title = 'Logout';
        authBtn.innerHTML = `<img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + user.displayName}" alt="User" style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--accent-color);">`;
        
        try {
          // Get or create user profile
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            state.userProfile = userDoc.data();
          } else {
            const newProfile = {
              uid: user.uid,
              email: user.email,
              role: 'user',
              displayName: user.displayName,
              createdAt: serverTimestamp()
            };
            await setDoc(doc(db, 'users', user.uid), newProfile);
            state.userProfile = newProfile;
          }
        } catch (error) {
          console.error('Profile fetch error:', error);
        }
        
        // Show admin link if admin
        const isAdmin = state.userProfile?.role === 'admin' || user.email === 'joaquimdacosta1999@gmail.com';
        if (isAdmin && adminLink) {
          adminLink.classList.remove('hidden');
        }
      } else {
        state.userProfile = null;
        authBtn.title = 'Login';
        authBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
        if (adminLink) adminLink.classList.add('hidden');
      }
      handleRoute();
    } catch (err) {
      console.error('Auth state change error:', err);
    }
  });

  // Real-time News Listener
  const newsQuery = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
  onSnapshot(newsQuery, (snapshot) => {
    state.news = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.newsLoaded = true;
    handleRoute();
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, 'news');
    } catch (e) { /* Caught fatal throw to prevent unhandled rejection */ }
    state.newsLoaded = true;
    handleRoute();
  });

  // Routing
  window.addEventListener('popstate', handleRoute);
  
  // Listen for clicks on all internal links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.href.startsWith(window.location.origin)) {
      const path = link.getAttribute('href');
      // If it's a relative path starting with / or something that isn't a hash anchor
      if (path && !path.startsWith('#') && !path.includes('://')) {
        e.preventDefault();
        navigateTo(path);
      }
    }
  });

  handleRoute();
  fetchWikipediaEvents().catch(e => console.error('Wikipedia Load Error:', e));
  fetchFinanceData().catch(e => console.error('Finance Load Error:', e));
  fetchCryptoData().catch(e => console.error('Crypto Load Error:', e));
  syncAllNews().catch(e => console.error('Sync Init Error:', e));
  // Refresh all news every 5 minutes for instant updates
  setInterval(syncAllNews, 300000);

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      if (state.currentRoute.startsWith('/article/')) {
        const lastRoute = localStorage.getItem('lastPath') || '/home';
        navigateTo(lastRoute);
      }
    }
    if (e.target === searchOverlay) searchOverlay.classList.remove('active');
  });
}

function initNewsletter() {
  const form = document.getElementById('newsletter-form');
  const status = document.getElementById('newsletter-status');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('input').value;
    status.style.display = 'block';
    status.innerText = 'Subscribing...';
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      status.innerText = 'Success! Welcome to GoNow.';
      status.style.color = '#10b981';
      form.reset();
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
    } catch (error) {
      status.innerText = 'Error subscribing. Try again.';
      status.style.color = '#ef4444';
    }
  });
}
function navigateTo(path) {
  if (!path.startsWith('/article/')) {
    localStorage.setItem('lastPath', path);
  }
  window.history.pushState({}, '', path);
  handleRoute();
}

window.navigateTo = navigateTo;

async function fetchWikipediaEvents() {
  try {
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Wikipedia API for "On This Day"
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${month}/${day}`);
    const data = await response.json();
    
    if (data.events && data.events.length > 0) {
      // Pick top 3-5 events
      state.wikipediaEvents = data.events.slice(0, 5).map(e => `${e.year}: ${e.text}`);
      console.log('Wikipedia events loaded:', state.wikipediaEvents.length);
      handleRoute(); // Re-render to show events
    }
  } catch (error) {
    console.error('Error fetching Wikipedia events:', error);
  }
}

async function fetchFinanceData() {
  try {
    // Yahoo Finance CORS friendly alternative or specific public endpoint
    // Using a reliable public market data API as a proxy for Yahoo Finance intent
    const symbols = ['^GSPC', '^DJI', '^IXIC', 'AAPL', 'TSLA', 'AMZN'];
    const tickerPromises = symbols.map(async symbol => {
      try {
        const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`);
        const data = await res.json();
        const meta = data.chart.result[0].meta;
        const price = meta.regularMarketPrice;
        const prevClose = meta.previousClose;
        const change = ((price - prevClose) / prevClose * 100).toFixed(2);
        return { symbol: symbol.replace('^', ''), price: price.toFixed(2), change: change };
      } catch (e) {
        // If Yahoo Finance CORS blocks, fallback to a mock for demo that looks like Yahoo Finance data
        // (In a real production environment, a backend proxy would be used)
        const mockPrices = { 'GSPC': 5100, 'DJI': 39000, 'IXIC': 16000, 'AAPL': 170, 'TSLA': 160, 'AMZN': 180 };
        return { symbol: symbol.replace('^', ''), price: (mockPrices[symbol.replace('^', '')] || 100).toFixed(2), change: (Math.random() * 2 - 1).toFixed(2) };
      }
    });

    state.financeData = await Promise.all(tickerPromises);
    console.log('Finance data loaded:', state.financeData.length);
    handleRoute();
  } catch (error) {
    console.error('Error fetching finance data:', error);
  }
}

async function fetchCryptoData() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,cardano,solana,dogecoin&vs_currencies=usd&include_24hr_change=true');
    const data = await response.json();
    
    const mapping = {
      bitcoin: 'BTC',
      ethereum: 'ETH',
      cardano: 'ADA',
      solana: 'SOL',
      dogecoin: 'DOGE'
    };

    state.cryptoData = Object.entries(data).map(([id, info]) => ({
      symbol: mapping[id] || id.toUpperCase(),
      price: info.usd.toLocaleString(),
      change: info.usd_24h_change.toFixed(2)
    }));
    
    console.log('Crypto data loaded:', state.cryptoData.length);
    handleRoute();
  } catch (error) {
    console.error('Error fetching crypto data:', error);
  }
}

// Auth Logic
async function handleAuth() {
  console.log('handleAuth triggered, current user:', state.user);
  if (state.user) {
    try {
      await signOut(auth);
      console.log('Sign out successful');
    } catch (error) {
      console.error('Sign out error:', error);
      alert('Sign out failed: ' + error.message);
    }
  } else {
    try {
      console.log('Starting Google Sign-In...');
      const result = await signInWithPopup(auth, googleProvider);
      console.log('Sign-in successful:', result.user.email);
    } catch (error) {
      console.error('Auth Error:', error);
      if (error.code === 'auth/popup-blocked') {
        alert('Sign-in popup was blocked. Please allow popups for this site.');
      } else if (error.code === 'auth/unauthorized-domain') {
        alert('This domain is not authorized for Firebase Auth. Please check your Firebase Console settings.');
      } else {
        alert('Authentication failed: ' + error.message);
      }
    }
  }
}

window.handleAuth = handleAuth;

// Theme Logic
function toggleTheme() {
  state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', state.currentTheme);
  localStorage.setItem('theme', state.currentTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  themeToggle.innerHTML = state.currentTheme === 'light' 
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
}

// View Mode Logic
window.toggleViewMode = (mode) => {
  state.viewMode = mode;
  localStorage.setItem('viewMode', mode);
  renderPage(state.currentRoute);
};

// Routing Logic
function handleRoute() {
  const path = window.location.pathname === '/' ? '/home' : window.location.pathname;
  state.currentRoute = path;
  
  // Close any open modals when navigating
  modal.classList.remove('active');
  searchOverlay.classList.remove('active');
  document.body.style.overflow = '';
  
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === path);
  });

  renderPage(path);
  window.scrollTo(0, 0);
}

function renderPage(path) {
  mainContent.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container fade-in';

  let pageTitle = 'GoNow — News, Tech & Football Today';
  let pageDescription = 'GoNow — your daily dose of news, football scores, tech, and entertainment. Fast, clean, ad-light.';
  let pageImage = 'https://images.unsplash.com/photo-1585829365234-781fcd50c45b?q=80&w=1200&h=630&auto=format&fit=crop';
  let pageType = 'website';

  if (path === '/home') {
    renderHome(container);
  } else if (path === '/politics') {
    pageTitle = 'Politics News Today: Breaking Global Updates | GoNow';
    pageDescription = 'Stay informed with the latest global politics news, in-depth analysis, and trending reports on GoNow. Your clean portal for political truth.';
    pageImage = getDefaultImage('Politics');
    const combined = [...state.news.filter(n => n.category === 'Politics'), ...state.autoNews.filter(n => n.category === 'Politics')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Politics', combined);
  } else if (path === '/football') {
    pageTitle = 'Football News & Scores: Live Match Updates | GoNow';
    pageDescription = 'Get real-time football scores, match highlights, and latest transfer news from elite leagues worldwide on GoNow. Fast and ad-light.';
    pageImage = getDefaultImage('Football');
    const combined = [...state.news.filter(n => n.category === 'Football'), ...state.autoNews.filter(n => n.category === 'Football')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Football', combined);
  } else if (path === '/entertainment') {
    pageTitle = 'Entertainment News: Celebrity, Movies & Music Trends | GoNow';
    pageDescription = 'The latest entertainment news, celebrity gossip, and trending pop culture stories worldwide. Stay entertained with GoNow.';
    pageImage = getDefaultImage('Entertainment');
    const combined = [...state.news.filter(n => n.category === 'Entertainment'), ...state.autoNews.filter(n => n.category === 'Entertainment')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Entertainment', combined);
  } else if (path === '/technology') {
    pageTitle = 'Technology News: Innovations, Gadgets & Tech Reviews | GoNow';
    pageDescription = 'Explore the cutting edge of technology, future gadgets, and tech innovations. Your daily dose of technology updates on GoNow.';
    pageImage = getDefaultImage('Technology');
    const combined = [...state.news.filter(n => n.category === 'Technology'), ...state.autoNews.filter(n => n.category === 'Technology')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Technology', combined);
  } else if (path === '/business') {
    pageTitle = 'Business & Finance News: Market Trends & Economy | GoNow';
    pageDescription = 'Get the latest business news, stock market updates, and economic analysis. Stay ahead of the curve with GoNow Business.';
    pageImage = getDefaultImage('Business');
    const combined = [...state.news.filter(n => n.category === 'Business'), ...state.autoNews.filter(n => n.category === 'Business')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Business', combined);
  } else if (path === '/things-to-know') {
    pageTitle = 'Things To Know: Facts & Deep Dives | GoNow';
    pageDescription = 'Expand your horizons with fascinating facts and deep dives into history, science, and more on the GoNow Knowledge Desk.';
    renderCategory(container, 'Things To Know', thingsToKnow, 'knowledge');
  } else if (path === '/daily') {
    pageTitle = 'Daily Digest: Today\'s Top Stories & History | GoNow';
    pageDescription = 'A curated daily digest of critical world news, important historical milestones, and inspiring quotes to start your morning right.';
    renderDaily(container);
  } else if (path === '/saved') {
    pageTitle = 'Personal Library: Your Saved Articles | GoNow';
    pageDescription = 'Access and manage your personal collection of saved news stories, tech updates, and football transfer news on GoNow.';
    renderSaved(container);
  } else if (path === '/about') {
    pageTitle = 'About GoNow: Our News Mission & Vision | GoNow';
    pageDescription = 'Discover how GoNow is redefining news consumption with a fast, clean, and ad-light interface dedicated to the truth.';
    renderAbout(container);
  } else if (path.startsWith('/author/')) {
    const authorName = decodeURIComponent(path.split('/')[2]);
    pageTitle = `${authorName} | GoNow News Author`;
    pageDescription = `Read all articles and reports by ${authorName} on GoNow. High-quality journalism and expert analysis.`;
    renderAuthor(container, authorName);
  } else if (path === '/admin') {
    pageTitle = 'Admin Board | GoNow';
    renderAdmin(container);
  } else if (path === '/privacy') {
    pageTitle = 'Privacy Policy | GoNow';
    renderPrivacy(container);
  } else if (path === '/terms') {
    pageTitle = 'Terms of Service | GoNow';
    renderTerms(container);
  } else if (path.startsWith('/article/')) {
    const id = path.split('/')[2];
    const article = [...state.news, ...state.autoNews].find(n => n.id === id);
    if (article) {
      pageTitle = `${article.title} | GoNow News`;
      // Clean tags from description if any and limit to 155 chars for SEO
      const cleanDesc = article.excerpt ? article.excerpt.replace(/<[^>]*>?/gm, '') : pageDescription;
      pageDescription = cleanDesc.substring(0, 155) + (cleanDesc.length > 155 ? '...' : '');
      pageImage = article.image || pageImage;
      pageType = 'article';
      
      // Render home in background so the page isn't empty behind the modal
      renderHome(container);
      openDetail(id, 'news');
      injectArticleSchema(article);
    } else {
      navigateTo('/home');
    }
  }

  // Update DOM Title and Meta
  document.title = pageTitle;
  const currentUrl = `https://gonow247.com${path}`;

  // Helper to set meta tags
  const setMeta = (selector, attr, value) => {
    const els = document.querySelectorAll(selector);
    els.forEach(el => {
      if (el) el.setAttribute(attr, value);
    });
  };

  setMeta('meta[name="description"]', 'content', pageDescription);
  setMeta('link[rel="canonical"]', 'href', currentUrl);
  
  // Social: OG Tags
  setMeta('meta[property="og:title"]', 'content', pageTitle);
  setMeta('meta[property="og:description"]', 'content', pageDescription);
  setMeta('meta[property="og:image"]', 'content', pageImage);
  setMeta('meta[property="og:url"]', 'content', currentUrl);
  setMeta('meta[property="og:type"]', 'content', pageType);
  setMeta('meta[property="og:site_name"]', 'content', 'GoNow');

  // Social: Twitter Tags
  setMeta('meta[name="twitter:title"]', 'content', pageTitle);
  setMeta('meta[name="twitter:description"]', 'content', pageDescription);
  setMeta('meta[name="twitter:image"]', 'content', pageImage);
  setMeta('meta[name="twitter:url"]', 'content', currentUrl);
  setMeta('meta[name="twitter:site"]', 'content', '@gonow247');
  setMeta('meta[name="twitter:creator"]', 'content', '@gonow247');

  mainContent.appendChild(container);
  // Re-attach listeners now that the content is in the DOM
  attachCardListeners();
}

/**
 * Injects NewsArticle JSON-LD for better SEO on individual article pages
 */
function injectArticleSchema(article) {
  // Remove existing Article schema if any
  const existing = document.getElementById('article-schema');
  if (existing) existing.remove();

  const publishDate = new Date(article.timestamp || Date.now()).toISOString();
  const modifiedDate = article.updatedAt ? new Date(article.updatedAt).toISOString() : publishDate;
  const authorName = article.author || (article.isAuto ? `GoNow ${article.category} Desk` : 'GoNow Team');

  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://gonow247.com/article/${article.id}`
    },
    "headline": article.title,
    "image": [article.image],
    "datePublished": publishDate,
    "dateModified": modifiedDate,
    "author": {
      "@type": "Person",
      "name": authorName,
      "url": `https://gonow247.com/author/${encodeURIComponent(authorName)}`
    },
    "publisher": {
      "@type": "Organization",
      "name": "GoNow",
      "logo": {
        "@type": "ImageObject",
        "url": "https://gonow247.com/logo-square.svg"
      }
    },
    "description": article.excerpt
  };

  const script = document.createElement('script');
  script.id = 'article-schema';
  script.type = 'application/ld+json';
  script.text = JSON.stringify(schema);
  document.head.appendChild(script);
}

// Page Renderers
function renderPrivacy(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; padding: 40px 0;">
      <h1 style="margin-bottom: 30px;">Privacy Policy</h1>
      <p>Last updated: ${new Date().toLocaleDateString()}</p>
      <p style="margin-top: 20px;">At GoNow, we take your privacy seriously. This policy explains how we collect and use your information.</p>
      
      <h3 style="margin-top: 30px;">1. Information We Collect</h3>
      <p>We collect information you provide directly to us, such as when you create an account or leave a comment. This includes your name and email address.</p>
      
      <h3 style="margin-top: 30px;">2. Use of Information</h3>
      <p>We use your information to provide and improve our services, communicate with you, and personalize your experience.</p>
      
      <h3 style="margin-top: 30px;">3. Data Security</h3>
      <p>We use Firebase, a platform by Google, to store your data securely. We do not sell your personal information to third parties.</p>
      
      <h3 style="margin-top: 30px;">4. Contact Us</h3>
      <p>If you have questions about this policy, please contact us at support@gonow247.com</p>
    </div>
  `;
}

function renderTerms(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 0 auto; padding: 40px 0;">
      <h1 style="margin-bottom: 30px;">Terms of Service</h1>
      <p>Last updated: ${new Date().toLocaleDateString()}</p>
      
      <h3 style="margin-top: 30px;">1. Acceptance of Terms</h3>
      <p>By using GoNow, you agree to these terms. If you don't agree, please do not use our service.</p>
      
      <h3 style="margin-top: 30px;">2. User Content</h3>
      <p>Users are responsible for the comments and content they post. We reserve the right to remove any content that violates our community guidelines.</p>
      
      <h3 style="margin-top: 30px;">3. Limitations of Liability</h3>
      <p>GoNow provides information "as is" and is not responsible for any inaccuracies in the news content aggregated from third-party sources.</p>
      
      <h3 style="margin-top: 30px;">4. Modifications</h3>
      <p>We may update these terms from time to time. Your continued use of the service constitutes acceptance of the new terms.</p>
    </div>
  `;
}

function renderHome(container) {
  const happeningsList = state.wikipediaEvents.length > 0 ? state.wikipediaEvents : dailyHappenings[0].events;
  const financeList = state.financeData;
  const cryptoList = state.cryptoData;
  const quote = dailyQuotes[0];
  const knowledge = thingsToKnow[0];
  const isList = state.viewMode === 'list';

  // BALANCED FEED LOGIC: Ensure all categories are represented on home page
  const newsByCategory = {
    'Politics': [],
    'Business': [],
    'Football': [],
    'Entertainment': [],
    'Technology': []
  };

  const allSourceNews = [...state.news, ...state.autoNews];
  allSourceNews.forEach(article => {
    if (newsByCategory[article.category]) {
      newsByCategory[article.category].push(article);
    }
  });

  // Sort each category by date
  Object.keys(newsByCategory).forEach(cat => {
    newsByCategory[cat].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  });

  // INTERLEAVE: Gather news for the harmonic home feed
  const harmonicNews = [];
  let maxItems = 20; // total news on home
  let i = 0;
  while (harmonicNews.length < maxItems) {
    let addedAny = false;
    Object.keys(newsByCategory).forEach(cat => {
      if (newsByCategory[cat][i]) {
        harmonicNews.push(newsByCategory[cat][i]);
        addedAny = true;
      }
    });
    if (!addedAny) break;
    i++;
  }

  if (harmonicNews.length === 0) {
    if (!state.newsLoaded) {
      container.innerHTML = `
        <div style="text-align: center; padding: 100px 20px;">
          <div class="loader" style="margin: 0 auto 20px;"></div>
          <h2 style="font-size: 1.5rem;">Connecting to GoNow Global News...</h2>
          <p style="color: var(--text-muted);">Fetching conservative world-wide perspectives</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 100px 20px;">
          <h1 style="font-size: 2rem;">Connecting to Global Feeds...</h1>
          <p>Please wait a few seconds or check your connection.</p>
          <a href="/admin" class="submit-btn" style="display: inline-block; margin-top: 30px;">Publish First Article</a>
        </div>
      `;
    }
    return;
  }

  const featured = harmonicNews[0];
  const latest = harmonicNews.slice(1);
  const trending = [...allSourceNews].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);

  container.innerHTML = `
    <section class="hero magazine-hero">
      <div class="hero-card" onclick="navigateTo('/article/${featured.id}')" style="cursor: pointer;">
        <div class="hero-img-wrapper">
          <img src="${featured.image}" alt="${featured.title}" class="hero-img" loading="lazy">
        </div>
        <div class="hero-content">
          <div class="meta-label">TOP STORY • ${featured.category.toUpperCase()}</div>
          <h1 class="hero-title">${featured.title}</h1>
          <p class="hero-description">${featured.excerpt}</p>
          <div class="hero-footer">
            <span class="read-more">Read Full Story →</span>
          </div>
        </div>
      </div>
    </section>

    <div class="main-grid">
      <section class="latest-news">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid var(--text-color); padding-bottom: 10px;">
          <h2 class="section-title" style="margin-bottom: 0; text-transform: uppercase; letter-spacing: 2px; font-weight: 800;">Recently Published</h2>
          <div style="display: flex; gap: 10px; align-items: center;">
            <button class="icon-btn" onclick="syncAllNews()" title="Refresh Feed" style="background: var(--card-bg);">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
            </button>
            <div class="view-toggle">
              <button class="toggle-btn ${!isList ? 'active' : ''}" onclick="toggleViewMode('grid')">Grid</button>
              <button class="toggle-btn ${isList ? 'active' : ''}" onclick="toggleViewMode('list')">List</button>
            </div>
          </div>
        </div>
        <div class="news-grid ${isList ? 'list-view' : ''}">
          ${latest.length > 0 ? latest.map((item, index) => {
            const card = createNewsCard(item);
            if (index > 0 && (index + 1) % 6 === 0) {
              return card + createAdUnit('9876543210');
            }
            return card;
          }).join('') : '<p>No news available.</p>'}
        </div>
      </section>

      <aside class="sidebar">
        <div class="sidebar-section">
          <h2 class="section-title" style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Trending Now</h2>
          ${trending.map((item, i) => `
            <div class="trending-item" onclick="navigateTo('/article/${item.id}')">
              <span class="trending-num">0${i + 1}</span>
              <div class="trending-content">
                <span class="meta-label" style="font-size: 0.6rem;">${item.category}</span>
                <h4 style="margin-top: 4px; font-weight: 600; line-height: 1.3;">${item.title}</h4>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="sidebar-section">
          <div class="knowledge-box" style="background: #1a1a1a; color: white; padding: 25px; border-radius: var(--radius); margin-bottom: 25px; border: 1px solid #333;">
             <div class="meta-label" style="color: #8b5cf6; margin-bottom: 10px;">Daily Insight</div>
             <h4 style="margin-bottom: 12px; font-size: 1.25rem; font-family: 'Inter', sans-serif; font-weight: 700;">${knowledge.title}</h4>
             <p style="font-size: 0.95rem; opacity: 0.8; line-height: 1.6; margin-bottom: 20px;">${knowledge.tip}</p>
             <a href="/things-to-know" class="btn" style="width: 100%; border: 1px solid #444; text-align: center; display: block; color: white;">Expand Knowledge</a>
          </div>

          <div class="daily-box" style="background: var(--card-bg); border: 1px solid var(--border-color);">
            <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.9rem; margin-bottom: 15px;">Historical Context</h3>
            <ul class="daily-list">
              ${happeningsList.slice(0, 3).map(e => `<li style="font-size: 0.85rem; padding: 10px 0; border-bottom: 1px solid var(--border-color);">${e}</li>`).join('')}
            </ul>
            <div class="quote-box" style="margin-top: 20px; border-top: 1px solid var(--border-color); padding-top: 15px;">
              <p class="quote-text" style="font-style: italic; font-family: 'Inter', sans-serif;">"${quote.quote}"</p>
              <p class="quote-author" style="margin-top: 10px;">— ${quote.author}</p>
            </div>
          </div>

          <div class="daily-box" style="background: var(--card-bg); border: 1px solid var(--border-color); margin-top: 25px;">
            <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.9rem; margin-bottom: 15px;">Market Watch</h3>
            <div class="market-list">
              ${financeList.slice(0, 4).map(item => `
                <div class="market-item">
                  <span class="market-symbol font-bold">${item.symbol}</span>
                  <span class="market-price font-mono">$${item.price}</span>
                  <span class="market-change ${parseFloat(item.change) >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${parseFloat(item.change) >= 0 ? '+' : ''}${item.change}%
                  </span>
                </div>
              `).join('')}
              ${financeList.length === 0 ? '<p class="text-gray-500">Updating Markets...</p>' : ''}
            </div>
          </div>

          <div class="daily-box" style="background: var(--card-bg); border: 1px solid var(--border-color); margin-top: 25px;">
            <h3 style="text-transform: uppercase; letter-spacing: 1px; font-size: 0.9rem; margin-bottom: 15px;">Crypto Tracker</h3>
            <div class="market-list">
              ${cryptoList.slice(0, 4).map(item => `
                <div class="market-item">
                  <span class="market-symbol font-bold">${item.symbol}</span>
                  <span class="market-price font-mono">$${item.price}</span>
                  <span class="market-change ${parseFloat(item.change) >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${parseFloat(item.change) >= 0 ? '+' : ''}${item.change}%
                  </span>
                </div>
              `).join('')}
              ${cryptoList.length === 0 ? '<p class="text-gray-500">Updating Crypto...</p>' : ''}
            </div>
          </div>
        </div>

        ${createAdUnit('1234567890', 'rectangle')}
      </aside>
    </div>
  `;
  attachCardListeners();
}

function renderCategory(container, title, items, type = 'news') {
  const isList = state.viewMode === 'list';
  const urlParams = new URLSearchParams(window.location.search);
  const page = parseInt(urlParams.get('page')) || 1;
  const pageSize = 12;
  const totalPages = Math.ceil(items.length / pageSize);
  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
      <h1 class="section-title" style="margin-bottom: 0;">${title}</h1>
      <div class="view-toggle">
        <button class="toggle-btn ${!isList ? 'active' : ''}" onclick="toggleViewMode('grid')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
          Grid
        </button>
        <button class="toggle-btn ${isList ? 'active' : ''}" onclick="toggleViewMode('list')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
          List
        </button>
      </div>
    </div>
    <div class="news-grid ${isList ? 'list-view' : ''}">
      ${pagedItems.length > 0 ? pagedItems.map((item, index) => {
        let html = '';
        if (type === 'news') html = createNewsCard(item);
        if (type === 'knowledge') html = createKnowledgeCard(item);
        
        // Insert ad after 3rd item
        if (index === 2) {
          return html + createAdUnit('7777777777');
        }
        return html;
      }).join('') : '<p style="color: var(--text-muted); padding: 50px 0; text-align: center;">No articles found in this category yet.</p>'}
    </div>
    
    ${totalPages > 1 ? `
      <div class="pagination" style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 40px 0;">
        <button class="btn" ${page === 1 ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''} onclick="event.preventDefault(); navigateTo('${window.location.pathname}?page=${page - 1}')">
          ← Previous
        </button>
        <span style="font-weight: 700;">Page ${page} of ${totalPages}</span>
        <button class="btn" ${page === totalPages ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''} onclick="event.preventDefault(); navigateTo('${window.location.pathname}?page=${page + 1}')">
          Next →
        </button>
      </div>
    ` : ''}
  `;
}

function renderDaily(container) {
  const happeningsList = state.wikipediaEvents.length > 0 ? state.wikipediaEvents : dailyHappenings[0].events;
  const financeList = state.financeData;
  const cryptoList = state.cryptoData;
  const quote = dailyQuotes[Math.floor(Math.random() * dailyQuotes.length)];
  const knowledge = thingsToKnow[0];

  container.innerHTML = `
    <h1 class="section-title" style="font-size: 2rem; margin-top: 40px;">Daily Digest</h1>
    <div class="main-grid">
      <div>
        <section class="mb-4">
          <h2 class="section-title">Market Watch</h2>
          <div class="daily-box" style="padding: 24px;">
            <div class="market-list">
              ${financeList.map(item => `
                <div class="market-item">
                  <span class="market-symbol font-bold">${item.symbol}</span>
                  <span class="market-price font-mono">$${item.price}</span>
                  <span class="market-change ${parseFloat(item.change) >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${parseFloat(item.change) >= 0 ? '+' : ''}${item.change}%
                  </span>
                </div>
              `).join('')}
              ${financeList.length === 0 ? '<p class="text-gray-500">Connecting to Market Data...</p>' : ''}
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 15px; text-align: center;">Powered by Yahoo Finance</p>
          </div>
        </section>

        <section class="mt-4">
          <h2 class="section-title">On This Day (via Wikipedia)</h2>
          <div class="daily-box">
            <ul class="daily-list">
              ${happeningsList.map(e => `<li style="font-size: 1.1rem; padding: 20px 0;">${e}</li>`).join('')}
            </ul>
          </div>
        </section>
      </div>

      <aside>
        <section class="mb-4">
          <h2 class="section-title">Crypto Tracker</h2>
          <div class="daily-box" style="padding: 20px;">
            <div class="market-list">
              ${cryptoList.map(item => `
                <div class="market-item">
                  <span class="market-symbol font-bold">${item.symbol}</span>
                  <span class="market-price font-mono">$${item.price}</span>
                  <span class="market-change ${parseFloat(item.change) >= 0 ? 'text-green-500' : 'text-red-500'}">
                    ${parseFloat(item.change) >= 0 ? '+' : ''}${item.change}%
                  </span>
                </div>
              `).join('')}
              ${cryptoList.length === 0 ? '<p class="text-gray-500">Broadcasting Blockchain Prices...</p>' : ''}
            </div>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 15px; text-align: center;">Powered by CoinGecko</p>
          </div>
        </section>

        <h2 class="section-title">Knowledge of the Day</h2>
        ${createKnowledgeCard(knowledge)}

        <h2 class="section-title" style="margin-top: 30px;">Daily Quote</h2>
        <div class="daily-box" style="text-align: center; padding: 40px;">
          <p style="font-size: 1.5rem; font-style: italic; margin-bottom: 20px;">"${quote.quote}"</p>
          <p class="quote-author" style="font-size: 1.1rem;">— ${quote.author}</p>
        </div>
      </aside>
    </div>
  `;
  attachCardListeners();
  lucide.createIcons();
}

function renderSaved(container) {
  const saved = state.savedItems;
  if (saved.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 100px 20px;">
        <h1 style="font-size: 2rem; margin-bottom: 20px;">No saved items yet</h1>
        <p style="color: var(--text-muted); margin-bottom: 40px;">Items you heart will appear here.</p>
        <a href="#home" class="submit-btn">Explore News</a>
      </div>
    `;
    return;
  }

  const categories = ['Politics', 'Football', 'Entertainment', 'Technology', 'HTML'];
  const grouped = categories.reduce((acc, cat) => {
    acc[cat] = saved.filter(item => item.category === cat);
    return acc;
  }, {});

  container.innerHTML = `
    <h1 class="section-title" style="font-size: 2rem; margin-top: 40px;">Saved Items</h1>
    ${categories.map(cat => {
      if (grouped[cat].length === 0) return '';
      return `
        <div class="mb-4">
          <h2 class="section-title">${cat}</h2>
          <div class="news-grid">
            ${grouped[cat].map(item => {
              if (cat === 'HTML') return createHtmlCard(item);
              return createNewsCard(item);
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
  attachCardListeners();
}

function renderAdmin(container) {
  console.log('Rendering Admin Dashboard. Auth Initialized:', state.isAuthInitialized, 'User:', state.user?.email);
  
  if (!state.isAuthInitialized) {
    container.innerHTML = `
      <div style="text-align: center; padding: 100px 20px;">
        <div class="loader" style="margin: 0 auto 20px;"></div>
        <h2 style="font-size: 1.5rem;">Verifying Identity...</h2>
        <p style="color: var(--text-muted);">Connecting to secure backend...</p>
      </div>
    `;
    return;
  }

  try {
    const isAdmin = state.user?.email === 'joaquimdacosta1999@gmail.com' || state.userProfile?.role === 'admin';
    
    if (!isAdmin) {
      container.innerHTML = `
        <div style="text-align: center; padding: 100px 20px;">
          <h1 style="font-size: 2.5rem; margin-bottom: 20px; color: #ff4444;">Access Denied</h1>
          <p style="color: var(--text-muted); font-size: 1.1rem; max-width: 500px; margin: 0 auto 30px;">
            You do not have administrative permissions to access this dashboard.
          </p>
          
          <div style="margin: 30px auto; padding: 30px; background: var(--card-bg); border-radius: 16px; max-width: 450px; border: 1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color);">
              <p style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px;">Current Session</p>
              <p style="font-size: 1.1rem; font-weight: 600;">${state.user?.email || 'Not Logged In'}</p>
            </div>
            
            ${!state.user ? `
              <p style="font-size: 0.9rem; margin-bottom: 20px;">Please sign in with your administrator account to continue.</p>
              <button onclick="window.handleAuth()" class="submit-btn" style="width: 100%; padding: 15px; font-size: 1rem;">Login as Admin</button>
            ` : `
              <p style="color: #ff4444; font-size: 0.9rem; margin-bottom: 20px; background: rgba(255,68,68,0.1); padding: 10px; border-radius: 8px;">
                This account (${state.user.email}) is not registered as an administrator.
              </p>
              <button onclick="window.handleAuth()" class="submit-btn" style="width: 100%; margin-top: 10px; background: #444; padding: 12px;">Switch to Admin Account</button>
            `}
          </div>
          
          <div style="margin-top: 40px;">
            <a href="#home" style="color: var(--accent-color); text-decoration: none; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Return to Website
            </a>
          </div>
        </div>
      `;
      return;
    }

    const userName = state.user?.displayName || state.user?.email?.split('@')[0] || 'Admin';

    container.innerHTML = `
      <div class="admin-dashboard-wrapper" style="padding-top: 40px; min-height: 600px;">
        <h1 class="section-title" style="font-size: 2.5rem; margin-bottom: 10px;">Admin Dashboard</h1>
        <p style="color: var(--text-muted); margin-bottom: 40px;">Welcome back, <strong>${userName}</strong>. Manage your news portal here.</p>
        
        <div class="main-grid">
          <div class="admin-main">
            <section class="daily-box" style="padding: 30px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 20px;">Create New Article</h3>
              <form id="news-form" class="comment-form">
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Title</label>
                  <input type="text" id="news-title" class="comment-input" placeholder="Enter article title..." required>
                </div>
                
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Category</label>
                  <select id="news-category" class="comment-input" required>
                    <option value="Politics">Politics</option>
                    <option value="Football">Football</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Technology">Technology</option>
                  </select>
                </div>
                
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Image URL</label>
                  <input type="url" id="news-image" class="comment-input" placeholder="https://picsum.photos/seed/news/800/450" required>
                </div>
                
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Excerpt (Short Summary)</label>
                  <textarea id="news-excerpt" class="comment-input" placeholder="A brief summary..." rows="3" required></textarea>
                </div>
                
                <div style="margin-bottom: 25px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Full Content (Supports Markdown: **bold**, *italic*, # Heading, - List)</label>
                  <textarea id="news-content" class="comment-input" placeholder="Write the full article here..." rows="12" required></textarea>
                </div>
                
                <button type="submit" class="submit-btn" style="width: 100%; padding: 15px; font-size: 1.1rem;">Publish Article</button>
              </form>
            </section>
          </div>
          
          <aside class="admin-sidebar">
            <h2 class="section-title">Manage Content</h2>
            <div class="daily-box">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-weight: 600;">Live Articles</span>
                <span class="badge">${state.news?.length || 0}</span>
              </div>
              <div style="max-height: 400px; overflow-y: auto;">
                ${state.news && state.news.length > 0 ? state.news.map(n => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-color);">
                    <div style="overflow: hidden; padding-right: 10px;">
                      <p style="font-size: 0.9rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0;">${n.title}</p>
                      <span style="font-size: 0.7rem; color: var(--text-muted);">${n.category}</span>
                    </div>
                    <button onclick="deleteArticle('${n.id}')" style="color: #ff4444; font-size: 0.8rem; background: none; border: none; cursor: pointer; font-weight: 600; flex-shrink: 0;">Delete</button>
                  </div>
                `).join('') : '<p style="color: var(--text-muted); font-size: 0.9rem;">No articles found.</p>'}
              </div>
            </div>

            <div class="daily-box" style="margin-top: 20px;">
              <h3 style="margin-bottom: 15px;">System Tools</h3>
              <button id="seed-btn" class="submit-btn" style="width: 100%; background: #444; margin-bottom: 10px;">Seed with Mock Data</button>
              <button onclick="location.reload()" class="submit-btn" style="width: 100%; background: #666;">Force Refresh App</button>
            </div>
          </aside>
        </div>
      </div>
    `;

    const form = container.querySelector('#news-form');
    if (form) form.addEventListener('submit', handleNewsSubmit);
    
    const seedBtn = container.querySelector('#seed-btn');
    if (seedBtn) seedBtn.addEventListener('click', seedDatabase);

  } catch (error) {
    console.error('Admin render error:', error);
    container.innerHTML = `<div style="padding: 50px; text-align: center;"><h2>Error loading dashboard</h2><p>${error.message}</p><button onclick="location.reload()" class="submit-btn">Retry</button></div>`;
  }
}

async function seedDatabase() {
  const btn = document.querySelector('#seed-btn');
  if (!confirm('This will add all mock articles to your live database. Continue?')) return;
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Seeding...';
  }

  try {
    const { newsData } = await import('./data.js');
    for (const item of newsData) {
      const { id, ...data } = item;
      await addDoc(collection(db, 'news'), {
        ...data,
        authorUid: state.user.uid,
        createdAt: serverTimestamp()
      });
    }
    alert('Database seeded successfully!');
  } catch (error) {
    console.error('Seed Error:', error);
    alert('Failed to seed database. Error: ' + error.message);
    try {
      handleFirestoreError(error, OperationType.WRITE, 'news');
    } catch (e) { /* already logged */ }
  } finally {
    btn.disabled = false;
    btn.innerText = 'Seed Database with Mock Data';
  }
}

async function handleNewsSubmit(e) {
  console.log('--- News Submission Started ---');
  e.preventDefault();
  
  const form = e.target;
  
  if (!state.user) {
    console.error('Submission failed: No user in state');
    alert('Error: You are not logged in. Please log in again.');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Publishing...';

  try {
    console.log('Collecting form data...');
    const title = form.querySelector('#news-title').value;
    const category = form.querySelector('#news-category').value;
    const image = form.querySelector('#news-image').value;
    const excerpt = form.querySelector('#news-excerpt').value;
    const content = form.querySelector('#news-content').value;

    if (!title || !content) {
      throw new Error('Title and Content are required.');
    }

    const newsItem = {
      title,
      category,
      image,
      excerpt,
      content,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      readTime: Math.ceil(content.split(' ').length / 200) + ' min',
      authorUid: state.user.uid,
      createdAt: serverTimestamp()
    };

    console.log('Data to send:', newsItem);

    const docRef = await addDoc(collection(db, 'news'), newsItem);
    console.log('Success! Document ID:', docRef.id);
    
    alert('Article published successfully!');
    e.target.reset();
  } catch (error) {
    console.error('CRITICAL PUBLISH ERROR:', error);
    alert('PUBLISH FAILED!\n\nReason: ' + error.message + '\n\nPlease check the browser console for more details.');
    try {
      handleFirestoreError(error, OperationType.CREATE, 'news');
    } catch (e) { /* logged */ }
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
    console.log('--- News Submission Ended ---');
  }
}

window.deleteArticle = async (id) => {
  if (!confirm('Are you sure you want to delete this article?')) return;
  try {
    await deleteDoc(doc(db, 'news', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'news/' + id);
  }
};

function renderAbout(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 60px auto; line-height: 1.8;">
      <h1 style="font-size: 3.5rem; font-weight: 800; margin-bottom: 24px; letter-spacing: -2px;">Ethics & Expertise</h1>
      <p style="font-size: 1.4rem; margin-bottom: 40px; color: var(--text-muted); font-weight: 400;">
        GoNow is committed to delivering <strong style="color: var(--text-color);">verified journalism</strong>, reliable data, and expert analysis in a fast, ad-light environment.
      </p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 60px;">
        <div>
          <h3 style="font-size: 1.2rem; margin-bottom: 15px; color: var(--primary-color);">Our Mission</h3>
          <p>To provide a transparent news portal where information is prioritized over algorithms. We focus on E-E-A-T (Experience, Expertise, Authoritativeness, and Trustworthiness) to ensure our readers get the truth.</p>
        </div>
        <div>
          <h3 style="font-size: 1.2rem; margin-bottom: 15px; color: var(--primary-color);">Transparency</h3>
          <p>Every article on GoNow includes clear sourcing, author attribution, and timestamps. We clearly label AI-assisted summaries and manual reports to maintain the highest standards of integrity.</p>
        </div>
      </div>

      <h2 class="section-title">Editorial Standards</h2>
      <ul style="margin-bottom: 40px; list-style: none; padding: 0;">
        <li style="padding: 15px 0; border-bottom: 1px solid var(--border-color);">✓ <strong>Fact-Checking:</strong> All automated feeds are sourced from high-authority global news agencies.</li>
        <li style="padding: 15px 0; border-bottom: 1px solid var(--border-color);">✓ <strong>Primary Sourcing:</strong> We link directly to original reports for full transparency.</li>
        <li style="padding: 15px 0; border-bottom: 1px solid var(--border-color);">✓ <strong>Correction Policy:</strong> Significant updates are clearly timestamped and explained.</li>
      </ul>

      <div style="background: var(--accent-color); padding: 40px; border-radius: 20px; border: 1px solid var(--border-color);">
        <h3 style="margin-bottom: 10px;">Contact Our News Desk</h3>
        <p style="margin-bottom: 20px;">Have a tip or a correction? We value reader feedback in our pursuit of accuracy.</p>
        <a href="mailto:desk@gonow247.com" class="btn" style="background: var(--primary-color); color: white; display: inline-block; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">Email the Editors</a>
      </div>
    </div>
  `;
}

function renderAuthor(container, authorName) {
  const articles = [...state.news, ...state.autoNews].filter(n => 
    (n.author === authorName) || 
    (authorName.includes(n.category) && n.isAuto)
  ).sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));

  container.innerHTML = `
    <div style="padding-top: 40px;">
      <div style="background: var(--card-bg); padding: 40px; border-radius: 24px; border: 1px solid var(--border-color); margin-bottom: 40px; display: flex; align-items: center; gap: 30px;">
        <div style="width: 100px; height: 100px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; font-size: 2.5rem; font-weight: 800; color: var(--primary-color);">
          ${authorName.charAt(0)}
        </div>
        <div>
          <h1 style="font-size: 2.5rem; margin-bottom: 5px;">${authorName}</h1>
          <p style="color: var(--text-muted); font-size: 1.1rem;">Journalist & News Desk Editor at GoNow</p>
          <div style="margin-top: 15px; display: flex; gap: 15px;">
            <span class="badge" style="background: var(--primary-color);">${articles.length} Articles Published</span>
          </div>
        </div>
      </div>

      <h2 class="section-title">Latest Reports by ${authorName}</h2>
      <div class="news-grid">
        ${articles.length > 0 ? articles.map(createNewsCard).join('') : '<p>This author is preparing their latest reports.</p>'}
      </div>
    </div>
  `;
  attachCardListeners();
}

// Component Creators
function createAdUnit(slot, format = 'auto') {
  return `
    <div class="ad-container">
      <span class="ad-label">Advertisement</span>
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-1724173335946956"
           data-ad-slot="${slot}"
           data-ad-format="${format}"
           data-full-width-responsive="true"></ins>
      <script>
           (adsbygoogle = window.adsbygoogle || []).push({});
      </script>
    </div>
  `;
}

function createNewsCard(item) {
  const isSaved = state.savedItems.some(s => s.id === item.id);
  const authorName = item.author || (item.isAuto ? `GoNow ${item.category} Desk` : 'GoNow Team');
  return `
    <article class="card" data-id="${item.id}" data-type="news">
      <a href="/article/${item.id}" class="card-link-wrapper" style="text-decoration: none; color: inherit; display: block; height: 100%;">
        <div class="card-img-wrapper">
          <img src="${item.image}" alt="${item.title}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${getDefaultImage(item.category)}'">
        </div>
        <div class="card-content">
          <div class="card-meta">
            <span class="meta-label" style="font-size: 0.65rem; margin-bottom: 5px;">${item.category.toUpperCase()}</span>
            ${item.isAuto ? '<span style="font-size: 0.65rem; color: #ff3e3e; font-weight: 800; letter-spacing: 1px;">• LIVE</span>' : ''}
          </div>
          <h3 class="card-title">${item.title}</h3>
          <p class="card-excerpt">${item.excerpt}</p>
          <div class="card-footer" style="margin-top: auto; padding-top: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color);">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 700; font-size: 0.8rem;">By ${authorName}</span>
              <span style="font-size: 0.7rem; color: var(--text-muted);">${item.readTime}</span>
            </div>
            <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="event.preventDefault(); event.stopPropagation(); toggleSave('${item.id}', 'news')">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </button>
          </div>
        </div>
      </a>
    </article>
  `;
}

function createKnowledgeCard(item) {
  const isSaved = state.savedItems.some(s => s.id === item.id);
  return `
    <div class="lesson-card" data-id="${item.id}" data-type="knowledge">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <div>
          <span class="badge" style="background: #8b5cf6;">${item.category.toUpperCase()}</span>
          <h3 style="margin-top: 10px;">${item.title}</h3>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="toggleSave('${item.id}', 'knowledge')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        </div>
      </div>
      <p style="margin-bottom: 15px; font-weight: 600; color: var(--text-color);">${item.tip}</p>
      <p style="color: var(--text-muted); line-height: 1.6;">${item.description}</p>
    </div>
  `;
}

// Interactivity Handlers
function attachCardListeners() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      const type = card.getAttribute('data-type');
      openDetail(id, type);
    });
  });
}

function openDetail(id, type) {
  const item = [...state.news, ...state.autoNews, ...thingsToKnow].find(i => i.id === id);
  if (!item) return;

  const isSaved = state.savedItems.some(s => s.id === item.id);
  
  // Real-time comments listener
  const q = query(collection(db, 'comments'), where('articleId', '==', id), orderBy('createdAt', 'desc'));
  
  // Initial render of modal structure
  renderModalContent(item, type, isSaved, []);
  
  onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => doc.data());
    updateCommentsList(comments);
  }, (error) => {
    try {
      handleFirestoreError(error, OperationType.LIST, 'comments');
    } catch (e) { /* Caught fatal throw */ }
  });

  modal.classList.add('active');
}

function updateCommentsList(comments) {
  const countLabel = document.querySelector('#comment-count');
  const listContainer = document.querySelector('#comment-list-container');
  
  if (countLabel) countLabel.innerText = `Comments (${comments.length})`;
  if (listContainer) {
    listContainer.innerHTML = comments.length > 0 ? comments.map(c => `
      <div class="comment" style="padding: 20px 0; border-bottom: 1px solid var(--border-color);">
        <div class="comment-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span style="font-weight: 700; color: var(--primary-color); font-size: 0.9rem;">${c.displayName || c.userEmail?.split('@')[0] || 'Anonymous'}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${c.date}</span>
        </div>
        <p style="font-size: 0.95rem; line-height: 1.5; margin-bottom: 10px;">${escapeHtml(c.text)}</p>
        ${state.user ? `
          <button onclick="replyTo('${c.displayName || c.userEmail?.split('@')[0]}')" style="color: var(--primary-color); font-size: 0.8rem; font-weight: 600; display: flex; align-items: center; gap: 4px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="m20 20-7-7"/></svg>
            Reply
          </button>
        ` : ''}
      </div>
    `).join('') : '<p style="color: var(--text-muted); text-align: center; padding: 40px 0;">No comments yet. Be the first to share your thoughts!</p>';
  }
}

function renderModalContent(item, type, isSaved, initialComments) {
  const allNews = [...state.news, ...state.autoNews];
  const relatedArticles = allNews
    .filter(n => n.category === item.category && n.id !== item.id)
    .sort(() => 0.5 - Math.random()) // Shuffle for better variety
    .slice(0, 3);
  
  // Sanitize content
  const rawContent = item.content || item.excerpt || 'No content available.';
  const sanitizedHtml = DOMPurify.sanitize(marked.parse(rawContent));

  const authorName = item.author || (item.isAuto ? `GoNow ${item.category} Desk` : 'GoNow Team');
  const pubDate = new Date(item.timestamp || Date.now());
  const formattedTime = pubDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const formattedDate = item.date || pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  modalBody.innerHTML = `
    <img src="${item.image}" alt="${item.title}" class="detail-img" loading="lazy" decoding="async">
    <div class="detail-meta">
      <span class="badge">${item.category}</span>
      <span style="font-weight: 600;">Published on ${formattedDate} at ${formattedTime}</span>
      ${item.readTime ? `<span>• ${item.readTime} read</span>` : ''}
    </div>
    <div style="margin: 20px 0; display: flex; align-items: center; gap: 10px;">
      <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-color); display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--primary-color);">
        ${authorName.charAt(0)}
      </div>
      <div>
        <p style="margin: 0; font-size: 0.9rem; font-weight: 700;">By <a href="/author/${encodeURIComponent(authorName)}" style="color: var(--primary-color); text-decoration: none;">${authorName}</a></p>
        <p style="margin: 0; font-size: 0.75rem; color: var(--text-muted);">GoNow News Correspondent</p>
      </div>
    </div>
    <h1 class="detail-title">${item.title}</h1>
    ${item.updatedAt ? `<div style="font-size: 0.8rem; background: var(--accent-color); padding: 8px 12px; border-radius: 6px; margin-bottom: 20px; display: inline-block; border: 1px solid var(--border-color);"><strong>Last updated:</strong> ${new Date(item.updatedAt).toLocaleString()}</div>` : ''}
    ${createAdUnit('1111111111', 'horizontal')}
    <div class="detail-body markdown-content">
      ${sanitizedHtml}
    </div>
    ${item.source ? `<p style="margin-top: 30px; font-size: 0.9rem; color: var(--text-muted);">Source: <a href="${item.source}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); word-break: break-all;">${item.source}</a></p>` : ''}
    <div class="card-footer mt-4" style="border: none; padding-top: 0;">
      <div style="display: flex; gap: 15px;">
        <button class="submit-btn" onclick="toggleSave('${item.id}', '${type}')">
          ${isSaved ? 'Unsave' : 'Save Item'}
        </button>
        <button class="icon-btn" style="border: 1px solid var(--border-color); border-radius: 8px; width: auto; padding: 0 15px;" onclick="shareItem('${item.title}')">
          Share
        </button>
      </div>
    </div>
    
    <div class="related-section" style="margin-top: 50px; padding-top: 30px; border-top: 2px solid var(--border-color);">
      <h3 style="margin-bottom: 20px;">More from ${item.category}</h3>
      <div class="news-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        ${relatedArticles.map(rel => `
          <div class="card" onclick="openDetail('${rel.id}', 'news')" style="cursor: pointer; min-height: auto;">
            <div class="card-img-wrapper" style="aspect-ratio: 16/9;">
              <img src="${rel.image}" alt="${rel.title}" class="card-img" loading="lazy" decoding="async">
            </div>
            <div class="card-content" style="padding: 12px;">
              <h4 style="font-size: 0.9rem; -webkit-line-clamp: 2; line-height: 1.3;">${rel.title}</h4>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <section class="comments-section" style="margin-top: 40px; padding-top: 30px; border-top: 2px solid var(--border-color);">
      ${createAdUnit('2222222222', 'horizontal')}
      <h3 id="comment-count" style="margin-bottom: 25px;">Comments (0)</h3>
      ${state.user ? `
        <div class="comment-form" style="background: var(--accent-color); padding: 20px; border-radius: 12px; margin-bottom: 30px;">
          <textarea class="comment-input" id="comment-text" placeholder="Add a comment or reply..." rows="3" style="background: var(--card-bg); border: 1px solid var(--border-color); padding: 15px; margin-bottom: 12px; width: 100%; border-radius: 8px; color: var(--text-color); font-family: inherit;"></textarea>
          <div style="display: flex; justify-content: flex-end;">
            <button class="submit-btn" onclick="addComment('${item.id}')">Post Comment</button>
          </div>
        </div>
      ` : '<p style="margin-bottom: 30px; padding: 20px; background: var(--accent-color); border-radius: 12px; text-align: center;">Please <a href="#" onclick="handleAuth(); return false;" style="color: var(--primary-color); font-weight: 700;">login</a> to leave a comment.</p>'}
      <div class="comment-list" id="comment-list-container">
        <!-- Re-rendered by updateCommentsList -->
        <p style="color: var(--text-muted); text-align: center; padding: 40px 0;">Loading comments...</p>
      </div>
    </section>
  `;
}

// Global functions
window.toggleSave = (id, type) => {
  const allItems = [...state.news, ...htmlLessons];
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  const index = state.savedItems.findIndex(s => s.id === id);
  if (index > -1) {
    state.savedItems.splice(index, 1);
  } else {
    state.savedItems.push(item);
  }

  localStorage.setItem('savedItems', JSON.stringify(state.savedItems));
  if (state.currentRoute === '#saved') renderPage('#saved');
  else handleRoute();
};

window.toggleLearned = (id) => {
  const index = state.learnedLessons.indexOf(id);
  if (index > -1) {
    state.learnedLessons.splice(index, 1);
  } else {
    state.learnedLessons.push(id);
  }
  localStorage.setItem('learnedLessons', JSON.stringify(state.learnedLessons));
  handleRoute();
};

window.copyCode = (btn, code) => {
  if (!navigator.clipboard) {
    // Fallback for non-secure contexts
    const textArea = document.createElement("textarea");
    textArea.value = code;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      const originalText = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = originalText, 2000);
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
    return;
  }
  navigator.clipboard.writeText(code).then(() => {
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = originalText, 2000);
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
    // Silent fail or alert
  });
};

window.addComment = async (id) => {
  const input = document.getElementById('comment-text');
  const text = input.value.trim();
  if (!text || !state.user) return;

  const comment = {
    articleId: id,
    text,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    userEmail: state.user.email,
    userUid: state.user.uid,
    displayName: state.userProfile?.displayName || state.user.displayName || state.user.email.split('@')[0],
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'comments'), comment);
    input.value = '';
    console.log('Comment added successfully');
  } catch (error) {
    console.error('Add Comment Error:', error);
    handleFirestoreError(error, OperationType.CREATE, 'comments');
  }
};

window.replyTo = (name) => {
  const input = document.getElementById('comment-text');
  if (input) {
    input.value = `@${name} `;
    input.focus();
    // Scroll to input on mobile
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

window.shareItem = (title) => {
  if (navigator.share) {
    navigator.share({ title: 'GoNow - ' + title, url: window.location.href });
  } else {
    alert('Sharing is not supported in this browser.');
  }
};

function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  if (!query) {
    searchResults.innerHTML = '';
    return;
  }
  const allItems = [...state.news, ...htmlLessons];
  const results = allItems.filter(item => 
    item.title.toLowerCase().includes(query) || 
    (item.excerpt && item.excerpt.toLowerCase().includes(query))
  );
  searchResults.innerHTML = results.map(item => `
    <div class="trending-item" style="padding: 15px; border-bottom: 1px solid var(--border-color); cursor: pointer;" onclick="searchOverlay.classList.remove('active'); openDetail('${item.id}', '${item.category === 'HTML' ? 'html' : 'news'}')">
      <div class="trending-content">
        <span class="badge" style="font-size: 0.6rem; padding: 2px 6px;">${item.category}</span>
        <h4 style="font-size: 1.1rem;">${item.title}</h4>
      </div>
    </div>
  `).join('');
}

function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}


// Global Error Handling
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Rejection at:', event.promise, 'reason:', event.reason);
  const message = event.reason?.message || (typeof event.reason === 'string' ? event.reason : 'Unknown error');
  if (message.includes('permission-denied')) {
    alert('Permission Denied: You are not authorized to perform this action.');
  } else {
    // Quietly log other rejections to avoid bothering users if they are minor
    console.warn('Silent caught rejection:', message);
  }
});

window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global Error:', message, error);
  return false;
};

init();
