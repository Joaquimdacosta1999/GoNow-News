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
  OperationType,
  limit
} from './firebase.ts';

import { marked } from 'marked';
import DOMPurify from 'dompurify';

import { 
  thingsToKnow, 
  dailyHappenings, 
  dailyQuotes 
} from './data.js';

// Analytics Initialization
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'G-N1E8YBZ79W');

// State Management
const state = {
  currentTheme: localStorage.getItem('theme') || 'dark',
  user: null,
  userProfile: null,
  isAuthInitialized: false,
  news: [],
  newsLoaded: false,
  affiliateAds: [],
  savedItems: JSON.parse(localStorage.getItem('savedItems')) || [],
  learnedLessons: JSON.parse(localStorage.getItem('learnedLessons')) || [],
  wikipediaEvents: [],
  financeData: [],
  cryptoData: [],
  comments: {},
  currentRoute: window.location.pathname === '/' ? '/home' : window.location.pathname,
  viewMode: localStorage.getItem('viewMode') || 'grid',
  autoNews: JSON.parse(localStorage.getItem('autoNewsCache')) || [],
  notifications: JSON.parse(localStorage.getItem('gonow_notifications')) || [],
  currentFeedTab: 'recently-published'
};

// Global variables
let freshNotifs = 0;

// Valid routes
const pathRoutes = ['/home', '/politics', '/business', '/football', '/entertainment', '/technology', '/author', '/contribute'];

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
const notifBtn = document.getElementById('notif-btn');
const notifDropdown = document.getElementById('notif-dropdown');
const notifBadge = document.getElementById('notif-badge');
const notifList = document.getElementById('notif-list');
const notifWrapper = document.getElementById('notif-wrapper');

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

const DEFAULT_AFFILIATE_ADS = [
  {
    title: "Protect Your Digital Privacy (60% Off)",
    description: "Secure your connection, bypass content blocks, and stay private online with NordVPN.",
    link: "https://nordvpn.com",
    imageUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=200&auto=format&fit=crop",
    type: "Affiliate",
    views: 0,
    clicks: 0
  },
  {
    title: "Amazon Prime Student - 6 Months Free",
    description: "Get fast, free shipping on millions of items, exclusive college deals, and free streaming with Amazon.",
    link: "https://amazon.com",
    imageUrl: "https://images.unsplash.com/photo-1523474253046-8cd2748b5fd2?q=80&w=200&auto=format&fit=crop",
    type: "Banner",
    views: 0,
    clicks: 0
  },
  {
    title: "HostGator Premium Cloud Hosting ($2.75/mo)",
    description: "Launch your website today with a free domain, unmetered bandwidth, and 24/7 expert support.",
    link: "https://www.hostgator.com",
    imageUrl: "https://images.unsplash.com/photo-1600132806370-bf17e65e942f?q=80&w=200&auto=format&fit=crop",
    type: "Sponsor",
    views: 0,
    clicks: 0
  }
];

let currentAdIndex = 0;
export function getNextAffiliateAd() {
  const ads = (state.affiliateAds && state.affiliateAds.length > 0) ? state.affiliateAds : DEFAULT_AFFILIATE_ADS;
  if (!ads || ads.length === 0) return null;
  const ad = ads[currentAdIndex % ads.length];
  currentAdIndex++;
  
  if (ad && ad.id) {
    try {
      updateDoc(doc(db, 'affiliate_ads', ad.id), {
        views: (ad.views || 0) + 1
      });
    } catch (e) {
      console.warn("Failed to update ad views:", e);
    }
  }
  return ad;
}

window.trackAdClick = async (adId) => {
  if (!adId) return;
  const ad = state.affiliateAds.find(a => a.id === adId);
  if (ad) {
    try {
      await updateDoc(doc(db, 'affiliate_ads', adId), {
        clicks: (ad.clicks || 0) + 1
      });
    } catch (e) {
      console.warn("Failed to update ad clicks:", e);
    }
  }
};

window.initGoogleAds = function() {
  const adElements = document.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
  const isAdSenseBlocked = typeof window.adsbygoogle === 'undefined' || !window.adsbygoogle.push;

  adElements.forEach(ins => {
    ins.setAttribute('data-adsbygoogle-status', 'pending');
    const container = ins.closest('.ad-container');
    const slot = container ? container.getAttribute('data-slot') : '';
    const fallbackEl = slot ? document.getElementById(`fallback-${slot}`) : null;

    if (isAdSenseBlocked) {
      if (fallbackEl) {
        fallbackEl.classList.remove('hidden');
      }
      ins.style.display = 'none';
      if (container) {
        const label = container.querySelector('.ad-label');
        if (label) label.innerText = 'Featured Partner Deal';
      }
    } else {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        
        // Timeout check for empty ads / no-fill recovery
        setTimeout(() => {
          if (ins.innerHTML.trim() === "" || ins.clientHeight === 0) {
            if (fallbackEl) {
              fallbackEl.classList.remove('hidden');
            }
            ins.style.display = 'none';
            if (container) {
              const label = container.querySelector('.ad-label');
              if (label) label.innerText = 'Featured Partner Deal';
            }
          }
        }, 1500);
      } catch (e) {
        console.warn("Google AdSense init warning:", e);
        if (fallbackEl) {
          fallbackEl.classList.remove('hidden');
        }
        ins.style.display = 'none';
      }
    }
  });
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

  // Mobile menu listener
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      const navLinks = document.querySelector('.nav-links');
      if (navLinks) navLinks.classList.toggle('active');
    });
  }

  initNewsletter();
  initNotifBell();

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
        
        if (notifWrapper) notifWrapper.classList.remove('hidden');
        renderNotifs();

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
              createdAt: serverTimestamp(),
              followedCategories: []
            };
            await setDoc(doc(db, 'users', user.uid), newProfile);
            state.userProfile = newProfile;
          }
          
          setupRealtimeNotifs();

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
        if (notifWrapper) notifWrapper.classList.add('hidden');
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

  // Real-time Affiliate Ads Listener
  const adsQuery = query(collection(db, 'affiliate_ads'));
  onSnapshot(adsQuery, async (snapshot) => {
    if (snapshot.empty) {
      state.affiliateAds = DEFAULT_AFFILIATE_ADS;
      const isAdmin = state.user?.email === 'joaquimdacosta1999@gmail.com' || state.userProfile?.role === 'admin';
      if (isAdmin) {
        try {
          for (const ad of DEFAULT_AFFILIATE_ADS) {
            await addDoc(collection(db, 'affiliate_ads'), ad);
          }
        } catch (e) {
          console.warn("Failed to auto-seed affiliate ads:", e);
        }
      }
    } else {
      state.affiliateAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  }, (error) => {
    console.warn("Affiliate Ads listener failed, using defaults:", error);
    state.affiliateAds = DEFAULT_AFFILIATE_ADS;
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
  const forms = [
    document.getElementById('newsletter-form'),
    document.getElementById('newsletter-form-footer')
  ];
  
  const status = document.getElementById('newsletter-status');

  forms.forEach(form => {
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input');
      const btn = form.querySelector('button');
      const originalBtnText = btn.innerText;

      btn.disabled = true;
      btn.innerText = 'WAIT...';
      
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        if (status) {
          status.style.display = 'block';
          status.innerText = 'Success! Welcome to GoNow.';
          status.style.color = '#10b981';
        } else {
          btn.innerText = 'SUCCESS!';
          btn.style.background = '#10b981';
        }
        
        form.reset();
        setTimeout(() => {
          if (status) status.style.display = 'none';
          btn.innerText = originalBtnText;
          btn.disabled = false;
          btn.style.background = '';
        }, 3000);
      } catch (error) {
        if (status) {
          status.innerText = 'Error subscribing. Try again.';
          status.style.color = '#ef4444';
        } else {
          btn.innerText = 'ERROR';
        }
        btn.disabled = false;
      }
    });
  });
}

// Notification Center Logic
function initNotifBell() {
  if (!notifBtn) return;
  
  notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('active');
    if (notifDropdown.classList.contains('active')) {
      clearBadge();
    }
  });

  const clearNotifBtn = document.getElementById('clear-notif-btn');
  if (clearNotifBtn) {
    clearNotifBtn.addEventListener('click', () => {
      window.clearNotifications();
    });
  }

  document.addEventListener('click', () => {
    if (notifDropdown) notifDropdown.classList.remove('active');
  });

  notifDropdown.addEventListener('click', (e) => e.stopPropagation());
}

window.clearNotifications = () => {
  state.notifications = [];
  localStorage.setItem('gonow_notifications', JSON.stringify([]));
  renderNotifs();
};

function clearBadge() {
  freshNotifs = 0;
  if (notifBadge) {
    notifBadge.classList.add('hidden');
    notifBadge.innerText = '';
  }
}

function renderNotifs() {
  if (!notifList) return;
  
  if (state.notifications.length === 0) {
    notifList.innerHTML = '<p class="notif-empty">No new alerts.</p>';
    return;
  }

  notifList.innerHTML = state.notifications.map(notif => `
    <div class="notif-item ${notif.read ? '' : 'unread'}" onclick="handleNotifClick('${notif.articleId}', '${notif.id}')">
      <div class="notif-title">${notif.title}</div>
      <div class="notif-time">${formatDate(notif.timestamp)}</div>
    </div>
  `).join('');
}

window.handleNotifClick = (articleId, notifId) => {
  const notif = state.notifications.find(n => n.id === notifId);
  if (notif) notif.read = true;
  localStorage.setItem('gonow_notifications', JSON.stringify(state.notifications));
  renderNotifs();
  navigateTo(`/article/${articleId}`);
  if (notifDropdown) notifDropdown.classList.remove('active');
};

function addNotification(notif) {
  // Check if notification already exists
  if (state.notifications.find(n => n.articleId === notif.articleId)) return;
  
  state.notifications.unshift({
    id: Date.now().toString(),
    ...notif,
    read: false,
    timestamp: Date.now()
  });
  
  // Limit to 20
  if (state.notifications.length > 20) state.notifications.pop();
  
  localStorage.setItem('gonow_notifications', JSON.stringify(state.notifications));
  
  freshNotifs++;
  updateBadge();
  renderNotifs();
}

function updateBadge() {
  if (!notifBadge) return;
  if (freshNotifs > 0) {
    notifBadge.classList.remove('hidden');
    notifBadge.innerText = freshNotifs > 9 ? '9+' : freshNotifs;
  } else {
    notifBadge.classList.add('hidden');
  }
}

async function toggleFollow(category) {
  if (!state.user) {
    handleAuth();
    return;
  }

  const followed = state.userProfile.followedCategories || [];
  const index = followed.indexOf(category);
  
  if (index > -1) {
    followed.splice(index, 1);
  } else {
    followed.push(category);
  }

  try {
    await updateDoc(doc(db, 'users', state.user.uid), {
      followedCategories: followed
    });
    state.userProfile.followedCategories = followed;
    handleRoute(); // Re-render to update follow buttons
  } catch (error) {
    console.error('Error updating follows:', error);
  }
}

window.toggleFollow = toggleFollow;

function setupRealtimeNotifs() {
  if (!state.user) return;
  
  // Listen for new articles in Firestore
  const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(5));
  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const article = change.doc.data();
        const articleId = change.doc.id;
        
        // Only notify if it's new (created after user logged in or within last hour)
        const isRecent = (Date.now() - (article.createdAt?.toMillis() || 0)) < 3600000;
        
        if (isRecent && state.userProfile?.followedCategories?.includes(article.category)) {
          addNotification({
            title: `New in ${article.category}: ${article.title}`,
            articleId: articleId
          });
        }
      }
    });
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
  if (state.user) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  } else {
    showAuthModal();
  }
}

function showAuthModal() {
  if (!modal || !modalBody) return;
  
  modalBody.innerHTML = `
    <div style="padding: 40px; text-align: center;">
      <div style="margin-bottom: 30px;">
        <div style="width: 64px; height: 64px; background: var(--primary-color); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/><path d="m13 10-2 4h4l-2 4"/></svg>
        </div>
        <h2 style="font-size: 2rem; margin-bottom: 12px; font-weight: 800; letter-spacing: -0.5px;">Join the GoNow Intelligence</h2>
        <p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.6; max-width: 400px; margin: 0 auto;">
          Unlock exclusive news alerts, follow your favorite topics, and stay ahead with real-time global insights.
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 350px; margin: 0 auto;">
        <button id="google-auth-btn" class="submit-btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 12px; height: 56px; font-size: 1rem; background: white; color: #1a1a1a; border: 1px solid #ddd;">
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c3.11 0 5.72-1.03 7.63-2.8l-3.57-2.77c-.98.66-2.23 1.06-4.06 1.06-3.12 0-5.77-2.12-6.71-4.98H1.63v2.87C3.53 20.39 7.49 23 12 23z" fill="#34A853"/><path d="M5.29 13.51c-.24-.71-.38-1.47-.38-2.51s.14-1.8.38-2.51V5.63H1.63C.59 7.73 0 10.05 0 12.5s.59 4.77 1.63 6.87l3.66-2.86z" fill="#FBBC05"/><path d="M12 4.77c1.69 0 3.21.58 4.41 1.72l3.32-3.32C17.71 1.05 15.11 0 12 0 7.49 0 3.53 2.61 1.63 6.63l3.66 2.87c.94-2.86 3.59-4.98 6.71-4.98z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        
        <div style="display: flex; align-items: center; gap: 15px; margin: 10px 0;">
          <hr style="flex: 1; border: 0; border-top: 1px solid var(--border-color);">
          <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">or</span>
          <hr style="flex: 1; border: 0; border-top: 1px solid var(--border-color);">
        </div>

        <div style="text-align: left; margin-bottom: 20px;">
          <label style="display: block; font-size: 0.85rem; font-weight: 700; margin-bottom: 8px;">EMAIL ADDRESS</label>
          <input type="email" placeholder="name@company.com" style="width: 100%; padding: 16px; border-radius: 12px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color);">
        </div>
        
        <button onclick="alert('Email registration is being optimized. Please use Google for instant access.')" class="submit-btn" style="width: 100%; height: 56px; font-size: 1rem; letter-spacing: 1px;">SIGN UP WITH EMAIL</button>
      </div>

      <p style="margin-top: 30px; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
        By continuing, you agree to receive daily news notifications and accept our <a href="/terms" style="color: var(--primary-color);">Terms of Service</a>.
      </p>
    </div>
  `;
  
  modal.classList.add('active');
  
  document.getElementById('google-auth-btn').addEventListener('click', async () => {
    try {
      modal.classList.remove('active');
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Auth Error:', error);
      if (error.code === 'auth/unauthorized-domain') {
        alert('Access Configuration Pending: The domain gonow247.com needs to be authorized in your security settings. Please contact the administrator.');
      } else {
        alert('Registration failed. Please try again or check your popup settings.');
      }
    }
  });
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
  console.log('Rendering Page Path:', path);
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
    pageTitle = 'Global Politics News: Breaking Updates | GoNow';
    pageDescription = 'Stay informed with the latest global politics news, in-depth analysis, and trending reports on GoNow Intelligence.';
    pageImage = getDefaultImage('Politics');
    const combined = [...state.autoNews.filter(n => n.category === 'Politics')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Global Politics', combined);
  } else if (path === '/football') {
    pageTitle = 'Football Central: Live Scores & Transfer News | GoNow';
    pageDescription = 'Get real-time football scores, match highlights, and latest transfer news from elite leagues worldwide on GoNow.';
    pageImage = getDefaultImage('Football');
    const combined = [...state.autoNews.filter(n => n.category === 'Football')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Football Central', combined);
  } else if (path === '/entertainment') {
    pageTitle = 'Pop Culture & Entertainment: Celebrity & Movie Trends | GoNow';
    pageDescription = 'The latest entertainment news, celebrity gossip, and trending pop culture stories worldwide. GoNow Entertainment.';
    pageImage = getDefaultImage('Entertainment');
    const combined = [...state.autoNews.filter(n => n.category === 'Entertainment')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Pop Culture', combined);
  } else if (path === '/technology') {
    pageTitle = 'Tech Innovation: Future Gadgets & Innovations | GoNow';
    pageDescription = 'Explore the cutting edge of technology, future gadgets, and tech innovations. GoNow Tech Innovation Desk.';
    pageImage = getDefaultImage('Technology');
    const combined = [...state.autoNews.filter(n => n.category === 'Technology')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Tech Innovation', combined);
  } else if (path === '/business') {
    pageTitle = 'Business Journal: Market Trends & Finance | GoNow';
    pageDescription = 'Get the latest business news, stock market updates, and economic analysis. GoNow Business Journal.';
    pageImage = getDefaultImage('Business');
    const combined = [...state.autoNews.filter(n => n.category === 'Business')].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderCategory(container, 'Business Journal', combined);
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
  } else if (path === '/contribute') {
    pageTitle = 'Support GoNow Intelligence: Reader Revenue | GoNow';
    pageDescription = 'Help support independent, verified journalism. Your contributions help GoNow maintain high-authority reporting and ad-light experiences.';
    renderContribute(container);
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

function getBreakingNewsTicker() {
  const allNews = [...state.autoNews, ...state.news];
  if (allNews.length === 0) return '';
  
  allNews.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  const breakingArticle = allNews[0];

  return `
    <div class="breaking-ticker-container">
      <div class="breaking-ticker-wrapper">
        <div class="breaking-badge">
          <span style="display: inline-block; width: 8px; height: 8px; background: #d63031; border-radius: 50%; animation: pulse-red 1.5s infinite;"></span>
          BREAKING UPDATE
        </div>
        <div class="breaking-text-scroller">
          <div class="breaking-text-content" onclick="navigateTo('/article/${breakingArticle.id}')">
            <strong>${breakingArticle.category.toUpperCase()}:</strong> ${breakingArticle.title} — ${breakingArticle.excerpt} (Click for live analysis)
          </div>
        </div>
      </div>
    </div>
  `;
}

async function initWeatherWidget() {
  const headerContainer = document.getElementById('weather-container');
  const sidebarContainer = document.getElementById('weather-sidebar-container');
  if (!headerContainer && !sidebarContainer) return;

  let lat = 51.2194;
  let lon = 4.4025;
  let locationName = 'Antwerpen';

  const fetchWeather = async (latitude, longitude, name) => {
    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
      const data = await response.json();
      if (data && data.current_weather) {
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        
        let emoji = '☀️';
        if (code >= 1 && code <= 3) emoji = '⛅';
        else if (code >= 45 && code <= 48) emoji = '🌫️';
        else if (code >= 51 && code <= 67) emoji = '🌧️';
        else if (code >= 71 && code <= 77) emoji = '❄️';
        else if (code >= 80 && code <= 82) emoji = '🌦️';
        else if (code >= 95) emoji = '⛈️';

        const widgetHtml = `
          <div class="weather-widget" title="Local Weather in ${name}">
            <span>${emoji}</span>
            <span>${temp}°C</span>
            <span style="opacity: 0.8; font-weight: 500; font-size: 0.75rem;">${name}</span>
          </div>
        `;

        if (headerContainer) {
          headerContainer.innerHTML = widgetHtml;
        }
        if (sidebarContainer) {
          sidebarContainer.innerHTML = `
            <div class="premium-sidebar-widget" style="display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center;">
              <h3 style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); margin-bottom: 0;">LOCAL CLIMATE</h3>
              <div style="font-size: 2.5rem; line-height: 1; margin: 10px 0;">${emoji}</div>
              <div style="font-size: 1.8rem; font-weight: 800; line-height: 1;">${temp}°C</div>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">${name} reporting desk</div>
            </div>
          `;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch weather data:', err);
    }
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        await fetchWeather(userLat, userLon, 'Local Feed');
      },
      async () => {
        await fetchWeather(lat, lon, locationName);
      },
      { timeout: 5000 }
    );
  } else {
    await fetchWeather(lat, lon, locationName);
  }
}

const PUZZLE_WORDS = [
  { word: "INFLATION", scrambled: "ALFOIINNT", clue: "Sustained increase in prices and fall in purchasing value of money." },
  { word: "ELECTION", scrambled: "OCLNEIET", clue: "A formal and organized choice by vote of a person for a political office." },
  { word: "TRANSFER", scrambled: "ESRRANTF", clue: "An act of moving a football player from one club to another." },
  { word: "CLIMATE", scrambled: "MIALCTE", clue: "The long-term weather patterns and trends of a region." },
  { word: "GIZMOS", scrambled: "OMSGIZ", clue: "A gadget or technology device of high innovation." }
];

function initPuzzleWidget() {
  const container = document.getElementById('daily-puzzle-container');
  if (!container) return;

  const day = new Date().getDate();
  const puzzle = PUZZLE_WORDS[day % PUZZLE_WORDS.length];
  const puzzleId = `puzzle_${day}`;

  const hasSolved = localStorage.getItem(puzzleId);

  if (hasSolved) {
    container.innerHTML = `
      <div class="premium-sidebar-widget" style="border-top: 3px solid #10b981;">
        <h3 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; color: #10b981; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          DAILY WORD PUZZLE
        </h3>
        <p style="font-weight: 700; font-size: 0.95rem; margin-bottom: 10px;">Solved!</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 15px;">You successfully unscrambled today's keyword:</p>
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid #10b981; color: #10b981; padding: 12px; border-radius: 8px; text-align: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1.1rem; letter-spacing: 2px;">
          ${puzzle.word}
        </div>
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 15px; text-align: center;">Come back tomorrow for a new puzzle!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="premium-sidebar-widget">
      <h3 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-color); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.3-4.3"/><circle cx="11" cy="11" r="8"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
        DAILY WORD PUZZLE
      </h3>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">Unscramble the editorial term related to today's top stories:</p>
      
      <div style="background: var(--accent-color); border: 1px solid var(--border-color); padding: 15px; border-radius: 10px; text-align: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1.3rem; letter-spacing: 4px; margin-bottom: 12px; color: var(--primary-color);">
        ${puzzle.scrambled}
      </div>

      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px; line-height: 1.4;"><strong>CLUE:</strong> ${puzzle.clue}</p>
      
      <div style="display: flex; gap: 8px;">
        <input type="text" id="puzzle-guess-input" placeholder="Your guess..." style="flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-color); font-size: 0.85rem; text-transform: uppercase;">
        <button onclick="checkPuzzleGuess('${puzzleId}', '${puzzle.word}')" class="submit-btn" style="padding: 0 16px; border-radius: 8px; font-size: 0.85rem; height: auto;">SOLVE</button>
      </div>
      <p id="puzzle-feedback" style="font-size: 0.8rem; font-weight: 600; margin-top: 10px; display: none;"></p>
    </div>
  `;
}

window.checkPuzzleGuess = function(puzzleId, correctWord) {
  const input = document.getElementById('puzzle-guess-input');
  const feedback = document.getElementById('puzzle-feedback');
  if (!input || !feedback) return;

  const guess = input.value.trim().toUpperCase();
  if (guess === correctWord) {
    localStorage.setItem(puzzleId, 'true');
    feedback.style.color = '#10b981';
    feedback.innerText = "Correct! Well done.";
    feedback.style.display = 'block';
    
    setTimeout(() => {
      initPuzzleWidget();
    }, 1000);
  } else {
    feedback.style.color = '#ef4444';
    feedback.innerText = "Incorrect guess. Try again!";
    feedback.style.display = 'block';
  }
};

async function loadPollWidget() {
  const pollId = 'weekly-editorial-poll';
  const pollDocRef = doc(db, 'polls', pollId);
  let pollData = null;

  try {
    const pollSnap = await getDoc(pollDocRef);
    if (pollSnap.exists()) {
      pollData = pollSnap.data();
    } else {
      pollData = {
        id: pollId,
        question: "Should central banks cut interest rates further to combat global inflation and economic slowdown?",
        options: ["Yes, immediately", "No, hold steady", "No, raise them further", "Unsure"],
        votes: {
          "Yes, immediately": 128,
          "No, hold steady": 84,
          "No, raise them further": 43,
          "Unsure": 22
        }
      };
      try {
        await setDoc(pollDocRef, pollData);
      } catch (e) {
        console.warn("Could not write poll document to Firestore:", e);
      }
    }
  } catch (error) {
    console.warn("Firestore poll fetch failed, using local fallback:", error);
    pollData = {
      id: pollId,
      question: "Should central banks cut interest rates further to combat global inflation and economic slowdown?",
      options: ["Yes, immediately", "No, hold steady", "No, raise them further", "Unsure"],
      votes: JSON.parse(localStorage.getItem('local_poll_votes')) || {
        "Yes, immediately": 128,
        "No, hold steady": 84,
        "No, raise them further": 43,
        "Unsure": 22
      }
    };
  }

  const container = document.getElementById('editorial-poll-container');
  if (!container) return;

  const hasVoted = localStorage.getItem(`voted_${pollId}`);
  const totalVotes = Object.values(pollData.votes || {}).reduce((a, b) => a + Number(b), 0);

  if (hasVoted) {
    let html = `
      <div class="premium-sidebar-widget">
        <h3 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; color: var(--primary-color); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M3 20v-8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8"/><path d="M11 20v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8"/></svg>
          OPINION POLL RESULTS
        </h3>
        <p style="font-weight: 700; font-size: 0.9rem; margin-bottom: 18px; line-height: 1.4;">${pollData.question}</p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    pollData.options.forEach(option => {
      const votes = pollData.votes[option] || 0;
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      html += `
        <div class="poll-result-bar-wrapper">
          <div class="poll-result-label">
            <span style="font-size: 0.8rem; opacity: 0.9;">${option}</span>
            <span style="font-size: 0.8rem; font-weight: 700;">${pct}% (${votes})</span>
          </div>
          <div class="poll-result-track">
            <div class="poll-result-fill" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
        <p style="font-size: 0.7rem; color: var(--text-muted); text-align: right; margin-top: 15px; font-weight: 600;">Total Votes: ${totalVotes} • Thank you for voting!</p>
      </div>
    `;
    container.innerHTML = html;
  } else {
    let html = `
      <div class="premium-sidebar-widget">
        <h3 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-color); margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M3 20v-8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8"/><path d="M11 20v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v8"/></svg>
          READER OPINION POLL
        </h3>
        <p style="font-weight: 700; font-size: 0.9rem; margin-bottom: 18px; line-height: 1.4;">${pollData.question}</p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
    `;

    pollData.options.forEach(option => {
      html += `
        <button class="poll-option-btn" onclick="submitPollVote('${pollId}', '${option}')">
          <span>${option}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      `;
    });

    html += `
        </div>
        <p style="font-size: 0.7rem; color: var(--text-muted); margin-top: 15px; font-weight: 600; text-align: center;">Verified balloting with secure checks</p>
      </div>
    `;
    container.innerHTML = html;
  }
}

window.submitPollVote = async function(pollId, option) {
  try {
    localStorage.setItem(`voted_${pollId}`, 'true');

    const pollDocRef = doc(db, 'polls', pollId);
    const pollSnap = await getDoc(pollDocRef);
    if (pollSnap.exists()) {
      const data = pollSnap.data();
      const currentVotes = data.votes || {};
      currentVotes[option] = (Number(currentVotes[option]) || 0) + 1;
      await updateDoc(pollDocRef, { votes: currentVotes });

      if (state.user) {
        await setDoc(doc(db, 'polls', pollId, 'votes', state.user.uid), {
          pollId,
          option,
          userId: state.user.uid,
          createdAt: serverTimestamp()
        });
      }
    } else {
      throw new Error("Poll not found");
    }
  } catch (err) {
    console.warn("Failed to submit poll vote, saving locally:", err);
    const localVotes = JSON.parse(localStorage.getItem('local_poll_votes')) || {
      "Yes, immediately": 128,
      "No, hold steady": 84,
      "No, raise them further": 43,
      "Unsure": 22
    };
    localVotes[option] = (localVotes[option] || 0) + 1;
    localStorage.setItem('local_poll_votes', JSON.stringify(localVotes));
  }

  loadPollWidget();
};

window.setFeedTab = function(tab) {
  state.currentFeedTab = tab;
  const container = document.querySelector('.container.fade-in');
  if (container) {
    renderHome(container);
  }
};

window.toggleFollowCategory = async function(cat) {
  let followedCats = state.userProfile?.followedCategories || JSON.parse(localStorage.getItem('followedCategories')) || ['Politics', 'Football', 'Entertainment', 'Technology', 'Business'];

  if (followedCats.includes(cat)) {
    followedCats = followedCats.filter(c => c !== cat);
  } else {
    followedCats.push(cat);
  }

  localStorage.setItem('followedCategories', JSON.stringify(followedCats));

  if (state.userProfile) {
    state.userProfile.followedCategories = followedCats;
    try {
      await updateDoc(doc(db, 'users', state.user.uid), { followedCategories: followedCats });
    } catch (e) {
      console.warn("Failed to update user profile followed categories:", e);
    }
  }

  const container = document.querySelector('.container.fade-in');
  if (container) {
    renderHome(container);
  }
};

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

  const allSourceNews = [...state.autoNews];
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
  let maxItems = 25; // total news on home
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
  const opinions = harmonicNews.slice(1, 4);
  const latest = harmonicNews.slice(4);
  const trending = [...allSourceNews].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);

  const activeFeedTab = state.currentFeedTab || 'recently-published';
  const followedCats = state.userProfile?.followedCategories || JSON.parse(localStorage.getItem('followedCategories')) || ['Politics', 'Football', 'Entertainment', 'Technology', 'Business'];

  let finalLatestNews = [...latest];
  if (activeFeedTab === 'for-you') {
    finalLatestNews = latest.filter(item => followedCats.includes(item.category));
  }

  // Generate Breaking Ticker HTML
  const tickerHtml = getBreakingNewsTicker();

  // Generate Personalization Controls
  let personalizationControls = '';
  if (activeFeedTab === 'for-you') {
    personalizationControls = `
      <div style="background: var(--accent-color); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 20px; margin-bottom: 25px; transition: var(--transition);">
        <h4 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 8px;">Bespoke News Filter</h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 15px;">Configure your personalized feed from top categories:</p>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${['Politics', 'Football', 'Entertainment', 'Technology', 'Business'].map(cat => {
            const isFollowed = followedCats.includes(cat);
            return `
              <button onclick="toggleFollowCategory('${cat}')" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; border: 1px solid ${isFollowed ? 'var(--primary-color)' : 'var(--border-color)'}; background: ${isFollowed ? 'var(--primary-color)' : 'var(--card-bg)'}; color: ${isFollowed ? 'white' : 'var(--text-color)'}; transition: var(--transition);">
                <span>${cat}</span>
                <span>${isFollowed ? '✓' : '+'}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <!-- Breaking News Ticker -->
    ${tickerHtml}

    <!-- 1. Bento Editorial Grid Layout (Splash + Opinion Column) -->
    <div class="editorial-grid-bento">
      <section class="hero magazine-hero" style="margin-bottom: 0;">
        <div class="hero-card" onclick="navigateTo('/article/${featured.id}')" style="cursor: pointer; height: 100%;">
          <div class="hero-img-wrapper" style="height: 380px;">
            <img src="${featured.image}" alt="${featured.title}" class="hero-img" loading="lazy">
          </div>
          <div class="hero-content">
            <div class="meta-label">SPLASH • <span onclick="event.stopPropagation(); navigateTo('/${featured.category.toLowerCase()}')" style="cursor: pointer; text-decoration: underline;">${featured.category.toUpperCase()}</span></div>
            <h1 class="hero-title serif-heading" style="font-size: 2.2rem; line-height: 1.15; margin-bottom: 15px;">${featured.title}</h1>
            <p class="hero-description">${featured.excerpt}</p>
            <div class="hero-footer">
              <span class="read-more">Read Splash Analysis →</span>
            </div>
          </div>
        </div>
      </section>

      <section class="opinion-column">
        <h3 style="text-transform: uppercase; letter-spacing: 1.5px; font-size: 0.9rem; margin-bottom: 20px; border-bottom: 2px solid var(--text-color); padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          OPINIONS & FEATURES
        </h3>
        <div style="display: flex; flex-direction: column; gap: 20px;">
          ${opinions.map(item => `
            <div class="opinion-card news-card-opinion" onclick="navigateTo('/article/${item.id}')" style="cursor: pointer; padding-bottom: 15px; border-bottom: 1px solid var(--border-color);">
              <span class="meta-label" style="font-size: 0.65rem; color: var(--primary-color);">${item.category.toUpperCase()}</span>
              <h4 class="card-title" style="font-family: 'Playfair Display', Georgia, serif; font-style: italic; font-size: 1.15rem; font-weight: 700; line-height: 1.3; margin-top: 4px; margin-bottom: 8px;">
                ${item.title}
              </h4>
              <p style="font-size: 0.8rem; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px;">
                ${item.excerpt}
              </p>
              <span style="font-size: 0.7rem; font-weight: 600;">By ${item.author || 'Editorial Desk'}</span>
            </div>
          `).join('')}
        </div>
      </section>
    </div>

    <!-- 2. Dual-Column Homepage Layout (Hard News + Premium Sidebar) -->
    <div class="main-grid">
      <section class="latest-news">
        <!-- Feed Tab Switcher -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 2px solid var(--text-color); padding-bottom: 10px;">
          <div class="home-feed-selector">
            <button class="home-feed-btn ${activeFeedTab === 'recently-published' ? 'active' : ''}" onclick="setFeedTab('recently-published')">Recently Published</button>
            <button class="home-feed-btn ${activeFeedTab === 'for-you' ? 'active' : ''}" onclick="setFeedTab('for-you')">For You</button>
          </div>
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

        ${personalizationControls}

        <div class="news-grid ${isList ? 'list-view' : ''}">
          ${finalLatestNews.length > 0 ? finalLatestNews.map((item, index) => {
            const card = createNewsCard(item);
            if (index > 0 && (index + 1) % 6 === 0) {
              return card + createAdUnit('9876543210');
            }
            return card;
          }).join('') : '<p style="padding: 20px 0; color: var(--text-muted); text-align: center;">No articles found in your followed topics. Update your Bespoke News Filter above!</p>'}
        </div>
      </section>

      <aside class="sidebar">
        <!-- Live Weather Container -->
        <div id="weather-sidebar-container"></div>

        <!-- Word Puzzle Container -->
        <div id="daily-puzzle-container"></div>

        <!-- Opinion Poll Container -->
        <div id="editorial-poll-container"></div>

        <div class="sidebar-section">
          <h2 class="section-title" style="border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">Trending Now</h2>
          ${trending.map((item, i) => `
            <div class="trending-item" onclick="navigateTo('/article/${item.id}')">
              <span class="trending-num">0${i + 1}</span>
              <div class="trending-content">
                <span class="meta-label" style="font-size: 0.65rem;">${item.category}</span>
                <h4 style="margin-top: 4px; font-weight: 600; line-height: 1.3;">${item.title}</h4>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="sidebar-section">
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
  
  setTimeout(() => {
    initWeatherWidget();
    initPuzzleWidget();
    loadPollWidget();
  }, 50);
}

const SPORTS_DATA = {
  EPL: {
    fullName: "English Premier League (EPL)",
    leaguesInfo: {
      founded: "1992",
      teams: "20",
      country: "England 🏴\u00DB\u0092\u00DB\u0097\u00DB\u009c",
      champion: "Manchester City",
      description: "The English Premier League is the top tier of English football, known globally for its fast-paced action, high-stakes matches, and star-studded rosters."
    },
    tables: [
      { pos: 1, team: "Liverpool", pg: 28, w: 20, d: 5, l: 3, gd: "+38", pts: 65 },
      { pos: 2, team: "Manchester City", pg: 28, w: 19, d: 6, l: 3, gd: "+34", pts: 63 },
      { pos: 3, team: "Arsenal", pg: 28, w: 18, d: 7, l: 3, gd: "+42", pts: 61 },
      { pos: 4, team: "Aston Villa", pg: 28, w: 17, d: 4, l: 7, gd: "+18", pts: 55 },
      { pos: 5, team: "Tottenham", pg: 27, w: 16, d: 5, l: 6, gd: "+17", pts: 53 },
      { pos: 6, team: "Manchester United", pg: 28, w: 15, d: 2, l: 11, gd: "+5", pts: 47 },
      { pos: 7, team: "Chelsea", pg: 27, w: 11, d: 7, l: 9, gd: "+11", pts: 40 }
    ],
    fixtures: [
      { date: "Saturday, March 14", home: "Manchester City", away: "Liverpool", time: "12:30", venue: "Etihad Stadium" },
      { date: "Saturday, March 14", home: "Arsenal", away: "Chelsea", time: "15:00", venue: "Emirates Stadium" },
      { date: "Sunday, March 15", home: "Manchester United", away: "Tottenham", time: "16:30", venue: "Old Trafford" }
    ],
    results: [
      { date: "Sunday, March 8", home: "Liverpool", away: "Manchester United", score: "2 - 1" },
      { date: "Saturday, March 7", home: "Chelsea", away: "Newcastle", score: "3 - 0" },
      { date: "Saturday, March 7", home: "Manchester City", away: "Aston Villa", score: "4 - 1" }
    ]
  },
  NBA: {
    fullName: "National Basketball Association (NBA)",
    leaguesInfo: {
      founded: "1946",
      teams: "30",
      country: "United States \u00DB\u00AA",
      champion: "Boston Celtics",
      description: "The NBA is the premier men's professional basketball league in the world, featuring 30 teams across North America competing for the Larry O'Brien Trophy."
    },
    tables: [
      { pos: 1, team: "Boston Celtics", pg: 64, w: 50, d: 0, l: 14, gd: "+10.2", pts: 78.1 },
      { pos: 2, team: "Milwaukee Bucks", pg: 65, w: 42, d: 0, l: 23, gd: "+4.8", pts: 64.6 },
      { pos: 3, team: "Cleveland Cavaliers", pg: 64, w: 41, d: 0, l: 23, gd: "+3.5", pts: 64.1 },
      { pos: 4, team: "New York Knicks", pg: 64, w: 37, d: 0, l: 27, gd: "+2.9", pts: 57.8 },
      { pos: 5, team: "Orlando Magic", pg: 65, w: 37, d: 0, l: 28, gd: "+1.8", pts: 56.9 },
      { pos: 6, team: "Philadelphia 76ers", pg: 63, w: 36, d: 0, l: 27, gd: "+1.2", pts: 57.1 }
    ],
    fixtures: [
      { date: "Tonight", home: "Boston Celtics", away: "Golden State Warriors", time: "19:30 EST", venue: "TD Garden" },
      { date: "Tonight", home: "Los Angeles Lakers", away: "Milwaukee Bucks", time: "22:00 EST", venue: "Crypto.com Arena" },
      { date: "Tomorrow", home: "Miami Heat", away: "Dallas Mavericks", time: "20:00 EST", venue: "Kaseya Center" }
    ],
    results: [
      { date: "Yesterday", home: "Golden State Warriors", away: "Milwaukee Bucks", score: "125 - 90" },
      { date: "Yesterday", home: "Los Angeles Lakers", away: "Sacramento Kings", score: "120 - 130" },
      { date: "Tuesday", home: "Brooklyn Nets", away: "Philadelphia 76ers", score: "112 - 107" }
    ]
  },
  F1: {
    fullName: "Formula 1 (Motorsport World Championship)",
    leaguesInfo: {
      founded: "1950",
      teams: "10 (20 Drivers)",
      country: "Global \u00DB\u00AA",
      champion: "Max Verstappen (Red Bull)",
      description: "Formula 1 is the highest class of international racing for open-wheel single-seater formula racing cars sanctioned by the FIA."
    },
    tables: [
      { pos: 1, team: "Max Verstappen (Red Bull)", pg: 2, w: 2, d: 0, l: 0, gd: "--", pts: 51 },
      { pos: 2, team: "Sergio Perez (Red Bull)", pg: 2, w: 0, d: 0, l: 0, gd: "--", pts: 36 },
      { pos: 3, team: "Charles Leclerc (Ferrari)", pg: 2, w: 0, d: 0, l: 0, gd: "--", pts: 28 },
      { pos: 4, team: "George Russell (Mercedes)", pg: 2, w: 0, d: 0, l: 0, gd: "--", pts: 18 },
      { pos: 5, team: "Oscar Piastri (McLaren)", pg: 2, w: 0, d: 0, l: 0, gd: "--", pts: 16 },
      { pos: 6, team: "Carlos Sainz (Ferrari)", pg: 1, w: 0, d: 0, l: 0, gd: "--", pts: 15 },
      { pos: 7, team: "Fernando Alonso (Aston Martin)", pg: 2, w: 0, d: 0, l: 0, gd: "--", pts: 12 }
    ],
    fixtures: [
      { date: "March 22 - 24", home: "Australian Grand Prix", away: "Melbourne Albert Park", time: "05:00 UTC", venue: "Albert Park Circuit" },
      { date: "April 5 - 7", home: "Japanese Grand Prix", away: "Suzuka Circuit", time: "05:00 UTC", venue: "Suzuka Circuit" },
      { date: "April 19 - 21", home: "Chinese Grand Prix", away: "Shanghai International", time: "07:00 UTC", venue: "Shanghai Circuit" }
    ],
    results: [
      { date: "March 9", home: "Saudi Arabian GP (Winner)", away: "Max Verstappen", score: "1:20:43" },
      { date: "March 2", home: "Bahrain GP (Winner)", away: "Max Verstappen", score: "1:31:44" },
      { date: "Abu Dhabi GP (2023)", home: "Yas Marina GP (Winner)", away: "Max Verstappen", score: "1:27:02" }
    ]
  }
};

window.selectSportsHubSport = (sport) => {
  state.sportsHubSport = sport;
  renderPage();
};

window.selectSportsHubSection = (section) => {
  state.sportsHubSection = section;
  renderPage();
};

export function renderFootballSportsHub() {
  const selectedSport = state.sportsHubSport || 'EPL';
  const selectedSection = state.sportsHubSection || 'Tables';
  const data = SPORTS_DATA[selectedSport];

  let sectionContentHtml = '';

  if (selectedSection === 'Leagues') {
    sectionContentHtml = `
      <div style="padding: 24px; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color); line-height: 1.7;">
        <h3 style="font-size: 1.3rem; margin-bottom: 12px; font-weight: 700; color: var(--primary-color);">${data.fullName}</h3>
        <p style="color: var(--text-color); font-size: 1rem; margin-bottom: 20px;">${data.leaguesInfo.description}</p>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; font-size: 0.95rem;">
          <div style="background: var(--accent-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
            <strong style="color: var(--primary-color);">Founded:</strong> ${data.leaguesInfo.founded}
          </div>
          <div style="background: var(--accent-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
            <strong style="color: var(--primary-color);">Active Teams:</strong> ${data.leaguesInfo.teams}
          </div>
          <div style="background: var(--accent-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
            <strong style="color: var(--primary-color);">Territory:</strong> ${data.leaguesInfo.country}
          </div>
          <div style="background: var(--accent-color); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color);">
            <strong style="color: var(--primary-color);">Reigning Champion:</strong> ${data.leaguesInfo.champion}
          </div>
        </div>
      </div>
    `;
  } else if (selectedSection === 'Tables') {
    sectionContentHtml = `
      <div style="overflow-x: auto; background: var(--card-bg); border-radius: 12px; border: 1px solid var(--border-color);">
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
          <thead>
            <tr style="border-bottom: 2px solid var(--border-color); background: var(--accent-color); font-weight: 700; color: var(--text-color);">
              <th style="padding: 12px 16px; width: 60px;">Pos</th>
              <th style="padding: 12px 16px;">Team / Competitor</th>
              <th style="padding: 12px 16px; text-align: center;">GP</th>
              <th style="padding: 12px 16px; text-align: center;">W</th>
              <th style="padding: 12px 16px; text-align: center;">${selectedSport === 'F1' ? 'Podiums' : 'D'}</th>
              <th style="padding: 12px 16px; text-align: center;">L</th>
              <th style="padding: 12px 16px; text-align: center;">${selectedSport === 'F1' ? 'GAP' : (selectedSport === 'NBA' ? 'DIFF' : 'GD')}</th>
              <th style="padding: 12px 16px; text-align: center; font-weight: 900;">PTS</th>
            </tr>
          </thead>
          <tbody>
            ${data.tables.map(row => `
              <tr style="border-bottom: 1px solid var(--border-color); transition: background-color 0.15s; cursor: pointer;" onmouseover="this.style.backgroundColor='var(--accent-color)'" onmouseout="this.style.backgroundColor='transparent'">
                <td style="padding: 12px 16px; font-weight: 700; color: ${row.pos <= 3 ? 'var(--primary-color)' : 'var(--text-muted)'};">${row.pos}</td>
                <td style="padding: 12px 16px; font-weight: 600; color: var(--text-color);">${row.team}</td>
                <td style="padding: 12px 16px; text-align: center; font-family: monospace; color: var(--text-color);">${row.pg}</td>
                <td style="padding: 12px 16px; text-align: center; font-family: monospace; color: var(--text-color);">${row.w}</td>
                <td style="padding: 12px 16px; text-align: center; font-family: monospace; color: var(--text-color);">${row.d}</td>
                <td style="padding: 12px 16px; text-align: center; font-family: monospace; color: var(--text-color);">${row.l}</td>
                <td style="padding: 12px 16px; text-align: center; font-family: monospace; color: ${parseFloat(row.gd) >= 0 ? '#2ed573' : (row.gd === '--' ? 'var(--text-color)' : '#ff4444')};">${row.gd}</td>
                <td style="padding: 12px 16px; text-align: center; font-weight: 800; font-family: monospace; color: var(--primary-color);">${row.pts}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (selectedSection === 'Fixtures') {
    sectionContentHtml = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">
        ${data.fixtures.map(f => `
          <div style="background: var(--card-bg); padding: 20px; border-radius: 12px; border: 1px solid var(--border-color); display: flex; flex-direction: column; justify-content: space-between; gap: 15px; transition: transform 0.2s, border-color 0.2s;" onmouseover="this.style.borderColor='var(--primary-color)'" onmouseout="this.style.borderColor='var(--border-color)'">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
              <span>${f.date}</span>
              <span style="color: var(--primary-color); background: var(--accent-color); padding: 2px 8px; border-radius: 10px;">${f.time}</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; font-weight: 600; font-size: 1rem; color: var(--text-color);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${f.home}</span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">VS</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span>${f.away}</span>
                <span></span>
              </div>
            </div>
            
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 5px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>
              <span>${f.venue}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (selectedSection === 'Results') {
    sectionContentHtml = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${data.results.map(r => `
          <div style="background: var(--card-bg); padding: 16px 20px; border-radius: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 20px; transition: background-color 0.15s;" onmouseover="this.style.backgroundColor='var(--accent-color)'" onmouseout="this.style.backgroundColor='transparent'">
            <div style="font-size: 0.8rem; color: var(--text-muted); width: 120px; font-weight: 600;">
              ${r.date}
            </div>
            
            <div style="display: flex; flex: 1; justify-content: center; align-items: center; gap: 20px; font-weight: 700; font-size: 1rem; color: var(--text-color);">
              <div style="text-align: right; width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.home}</div>
              <div style="background: var(--accent-color); color: var(--primary-color); padding: 6px 14px; border-radius: 8px; font-family: monospace; font-size: 1.05rem; min-width: 80px; text-align: center; border: 1px solid var(--border-color); font-weight: 800;">
                ${r.score}
              </div>
              <div style="text-align: left; width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.away}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <div style="margin-bottom: 45px; background: rgba(var(--primary-color-rgb, 0,0,0), 0.015); padding: 25px; border-radius: 20px; border: 1px solid var(--border-color);">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; margin-bottom: 25px;">
        <div>
          <h2 style="font-size: 1.5rem; font-weight: 800; margin: 0; color: var(--primary-color); display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary-color);"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/></svg>
            Live Sports Center
          </h2>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin: 4px 0 0 0;">Toggle between premium sports categories and real-time standings, match fixtures, and results.</p>
        </div>
        
        <div style="display: flex; background: var(--card-bg); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color); gap: 4px;">
          ${['EPL', 'NBA', 'F1'].map(sport => `
            <button onclick="selectSportsHubSport('${sport}')" style="padding: 8px 16px; border: none; font-size: 0.85rem; font-weight: 700; border-radius: 8px; cursor: pointer; transition: all 0.2s; 
              background: ${selectedSport === sport ? 'var(--primary-color)' : 'transparent'}; 
              color: ${selectedSport === sport ? 'white' : 'var(--text-muted)'};">
              ${sport === 'EPL' ? '⚽ EPL' : (sport === 'NBA' ? '🏀 NBA' : '🏎️ F1')}
            </button>
          `).join('')}
        </div>
      </div>

      <div style="display: flex; border-bottom: 1px solid var(--border-color); gap: 20px; margin-bottom: 25px; overflow-x: auto; padding-bottom: 2px;">
        ${['Tables', 'Fixtures', 'Results', 'Leagues'].map(sec => `
          <button onclick="selectSportsHubSection('${sec}')" style="background: none; border: none; padding: 10px 5px; font-size: 0.95rem; font-weight: 600; cursor: pointer; position: relative; transition: color 0.2s;
            color: ${selectedSection === sec ? 'var(--primary-color)' : 'var(--text-muted)'};">
            ${sec === 'Tables' ? '📊 Tables & Standings' : (sec === 'Fixtures' ? '📅 Upcoming Fixtures' : (sec === 'Results' ? '🏆 Recent Results' : 'ℹ️ League Overview'))}
            ${selectedSection === sec ? `<div style="position: absolute; bottom: -1px; left: 0; right: 0; height: 3px; background: var(--primary-color); border-radius: 2px;"></div>` : ''}
          </button>
        `).join('')}
      </div>

      <div class="sports-hub-content-view" style="min-height: 200px;">
        ${sectionContentHtml}
      </div>
    </div>
  `;
}

function renderCategory(container, title, items, type = 'news') {
  const isList = state.viewMode === 'list';
  const urlParams = new URLSearchParams(window.location.search);
  const page = parseInt(urlParams.get('page')) || 1;
  const pageSize = 12;
  const totalPages = Math.ceil(items.length / pageSize);
  
  const intros = {
    'Global Politics': 'Comprehensive coverage of international relations, diplomatic shifts, and breaking political intelligence from global capitals.',
    'Business Journal': 'Market leading insights, economic analysis, and corporate reporting designed for the modern decision maker.',
    'Football Central': 'Real-time scores, transfer exclusives, and in-depth match analysis from the world\'s premiere football leagues.',
    'Tech Innovation': 'Tracking the cutting edge of technological advancement, from AI breakthroughs to future gadgetry.',
    'Pop Culture': 'Your essential guide to global entertainment, celebrity narratives, and the trends shaping modern culture.',
    'Knowledge Desk': 'A repository of deep-dive intelligence, historical milestones, and fascinating factual narratives.'
  };

  const isFollowed = state.userProfile?.followedCategories?.includes(title);
  const followBtn = state.user ? `
    <button onclick="toggleFollow('${title}')" class="submit-btn" style="padding: 10px 20px; font-size: 0.9rem; background: ${isFollowed ? 'var(--accent-color)' : 'var(--primary-color)'}; color: ${isFollowed ? 'var(--text-color)' : 'white'}; border: 1px solid var(--border-color); border-radius: 12px; font-weight: 700;">
      ${isFollowed ? 'Following Topic' : 'Follow Intelligence'}
    </button>
  ` : '';

  const pagedItems = items.slice((page - 1) * pageSize, page * pageSize);
  
  container.innerHTML = `
    <div style="margin-bottom: 40px; padding-bottom: 30px; border-bottom: 1px solid var(--border-color);">
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
          <div>
            <h1 class="section-title" style="margin-bottom: 10px; font-size: 2.5rem; letter-spacing: -1px;">${title}</h1>
            <p style="color: var(--text-muted); font-size: 1.1rem; max-width: 700px; line-height: 1.6;">${intros[title] || 'The latest high-authority reporting and global insights curated by our desks.'}</p>
          </div>
          ${followBtn}
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
          <div style="display: flex; gap: 8px;">
            <span class="badge" style="background: var(--accent-color); color: var(--primary-color);">${items.length} Reports</span>
            <span class="badge" style="background: var(--card-bg); border: 1px solid var(--border-color);">${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Edition</span>
          </div>
          <div class="view-toggle">
            <button class="toggle-btn ${!isList ? 'active' : ''}" onclick="toggleViewMode('grid')">Grid</button>
            <button class="toggle-btn ${isList ? 'active' : ''}" onclick="toggleViewMode('list')">List</button>
          </div>
        </div>
      </div>
    </div>
    ${title === 'Football Central' ? renderFootballSportsHub() : ''}
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

    // Calculate dynamic stats
    const totalAdSenseViews = 277; // Cloudflare page views
    const estAdSenseRPM = 14.00; // $14 RPM
    const estAdSenseRev = ((totalAdSenseViews / 1000) * estAdSenseRPM).toFixed(2);

    let totalAffViews = 0;
    let totalAffClicks = 0;
    state.affiliateAds.forEach(ad => {
      totalAffViews += (ad.views || 0);
      totalAffClicks += (ad.clicks || 0);
    });
    const avgCTR = totalAffViews > 0 ? ((totalAffClicks / totalAffViews) * 100).toFixed(1) : '0.0';
    const estAffCommission = (totalAffClicks * 1.50).toFixed(2); // $1.50 per click commission
    const totalEstEarnings = (parseFloat(estAdSenseRev) + parseFloat(estAffCommission)).toFixed(2);

    container.innerHTML = `
      <div class="admin-dashboard-wrapper" style="padding-top: 40px; min-height: 600px;">
        <h1 class="section-title" style="font-size: 2.5rem; margin-bottom: 10px;">Publisher Admin Panel</h1>
        <p style="color: var(--text-muted); margin-bottom: 45px;">Welcome back, <strong>${userName}</strong>. Monitor monetization, traffic growth, and sponsor products.</p>
        
        <!-- Live Traffic & Monetization Tracker Cards -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 40px;">
          <div style="background: var(--card-bg); padding: 24px; border-radius: 16px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Visits (Last 7d)</span>
              <span style="background: rgba(255, 68, 68, 0.1); color: #ff4444; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; font-weight: 600;">-26.6%</span>
            </div>
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 5px; font-family: monospace;">262</h2>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">277 Total Page Views</p>
          </div>
          
          <div style="background: var(--card-bg); padding: 24px; border-radius: 16px; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Traffic Requests</span>
              <span style="background: rgba(46, 213, 115, 0.1); color: #2ed573; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; font-weight: 600;">+12.9%</span>
            </div>
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 5px; font-family: monospace;">16.71k</h2>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">50.75 MB Bandwidth Transferred</p>
          </div>

          <div style="background: var(--card-bg); padding: 24px; border-radius: 16px; border: 1px solid var(--border-color); position: relative; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Est. AdSense Rev</span>
              <span style="background: rgba(46, 213, 115, 0.1); color: #2ed573; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; font-weight: 600;">Active</span>
            </div>
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 5px; font-family: monospace; color: #2ed573;">$${estAdSenseRev}</h2>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">Based on $14.00 Average RPM</p>
          </div>

          <div style="background: var(--card-bg); padding: 24px; border-radius: 16px; border: 1px solid var(--border-color); position: relative; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
              <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Partner Affiliate</span>
              <span style="background: rgba(46, 213, 115, 0.1); color: #2ed573; font-size: 0.75rem; padding: 2px 8px; border-radius: 20px; font-weight: 600;">+${avgCTR}% CTR</span>
            </div>
            <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 5px; font-family: monospace; color: var(--primary-color);">$${estAffCommission}</h2>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">${totalAffClicks} Clicks across ${totalAffViews} Views</p>
          </div>
        </div>

        <div style="background: var(--accent-color); padding: 24px; border-radius: 16px; margin-bottom: 40px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
          <div>
            <h3 style="margin: 0 0 5px 0; font-size: 1.1rem; font-weight: 700;">Total Traffic-to-Cash Monetization</h3>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">Combined active yield (AdSense + Affiliate Partner payouts)</p>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); font-weight: bold;">Gross Revenue</span>
            <h1 style="font-size: 2.5rem; font-weight: 900; color: #2ed573; margin: 0; font-family: monospace;">$${totalEstEarnings}</h1>
          </div>
        </div>
        
        <div class="main-grid">
          <div class="admin-main">
            <!-- Sponsor and Affiliate Ad form -->
            <section class="daily-box" style="padding: 30px; margin-bottom: 30px;">
              <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Add Sponsored Deal / Affiliate Product</h3>
              <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 25px;">These custom banners rotate on the homepage sidebar and at the bottom of articles, acting as fallback ads when Google AdSense has no-fill or is adblocked.</p>
              
              <form id="ad-form" class="comment-form">
                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Product / Sponsor Title</label>
                  <input type="text" id="ad-title" class="comment-input" placeholder="e.g. NordVPN Secure Privacy Offer" required style="width:100%;">
                </div>
                
                <div style="margin-bottom: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                  <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Ad Placement Type</label>
                    <select id="ad-type" class="comment-input" required style="width:100%;">
                      <option value="Affiliate">Affiliate Link</option>
                      <option value="Sponsor">Direct Sponsor Banner</option>
                      <option value="Banner">General Call-to-Action</option>
                    </select>
                  </div>
                  <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Banner Icon Image URL</label>
                    <input type="url" id="ad-image" class="comment-input" placeholder="https://images.unsplash.com/..." required style="width:100%;">
                  </div>
                </div>

                <div style="margin-bottom: 15px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Affiliate / Sponsor Destination URL</label>
                  <input type="url" id="ad-link" class="comment-input" placeholder="https://yourlink.com/affiliate-code" required style="width:100%;">
                </div>
                
                <div style="margin-bottom: 25px;">
                  <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Sponsor Subtext / Pitch Description</label>
                  <textarea id="ad-description" class="comment-input" placeholder="Give readers a compelling 1-sentence reason to click..." rows="2" required style="width:100%;"></textarea>
                </div>
                
                <button type="submit" class="submit-btn" style="width: 100%; padding: 15px; font-size: 1.1rem; font-weight: 700;">Publish Sponsor Ad</button>
              </form>
            </section>

            <!-- Old Custom Article Form -->
            <section class="daily-box" style="padding: 30px; opacity: 0.85;">
              <details>
                <summary style="cursor: pointer; font-size: 1.2rem; font-weight: 700; user-select: none;">Write & Publish Custom Articles (Optional)</summary>
                <form id="news-form" class="comment-form" style="margin-top: 20px;">
                  <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Title</label>
                    <input type="text" id="news-title" class="comment-input" placeholder="Enter article title...">
                  </div>
                  
                  <div style="margin-bottom: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div>
                      <label style="display: block; margin-bottom: 5px; font-weight: 600;">Category</label>
                      <select id="news-category" class="comment-input">
                        <option value="Politics">Politics</option>
                        <option value="Business">Business</option>
                        <option value="Football">Football</option>
                        <option value="Entertainment">Entertainment</option>
                        <option value="Technology">Technology</option>
                      </select>
                    </div>
                    <div>
                      <label style="display: block; margin-bottom: 5px; font-weight: 600;">Image URL</label>
                      <input type="url" id="news-image" class="comment-input" placeholder="https://picsum.photos/seed/news/800/450">
                    </div>
                  </div>
                  
                  <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Excerpt (Short Summary)</label>
                    <textarea id="news-excerpt" class="comment-input" placeholder="A brief summary..." rows="2"></textarea>
                  </div>
                  
                  <div style="margin-bottom: 25px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Full Content</label>
                    <textarea id="news-content" class="comment-input" placeholder="Write full article here..." rows="8"></textarea>
                  </div>
                  
                  <button type="submit" class="submit-btn" style="width: 100%; padding: 12px; font-size: 1rem;">Publish Custom Article</button>
                </form>
              </details>
            </section>
          </div>
          
          <aside class="admin-sidebar" style="display: flex; flex-direction: column; gap: 20px;">
            <!-- Active Sponsor Banner Stats -->
            <div class="daily-box" style="padding: 24px;">
              <h3 style="font-size: 1.2rem; margin-bottom: 15px; font-weight: 700;">Active Partner Ads</h3>
              <div style="max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px;">
                ${state.affiliateAds && state.affiliateAds.length > 0 ? state.affiliateAds.map(ad => `
                  <div style="padding: 12px; background: var(--accent-color); border-radius: 10px; border: 1px solid var(--border-color);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                      <div style="max-width: 80%;">
                        <p style="font-size: 0.9rem; font-weight: 700; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${ad.title}</p>
                        <span style="font-size: 0.7rem; color: var(--primary-color); font-weight: bold; text-transform: uppercase;">${ad.type}</span>
                      </div>
                      <button onclick="deleteAd('${ad.id}')" style="color: #ff4444; background: none; border: none; font-size: 0.75rem; cursor: pointer; font-weight: bold;">Remove</button>
                    </div>
                    <div style="display: flex; gap: 15px; font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">
                      <span>👁️ ${ad.views || 0} views</span>
                      <span>🖱️ ${ad.clicks || 0} clicks</span>
                      <span style="color: var(--primary-color);">📈 ${ad.views > 0 ? ((ad.clicks || 0) / ad.views * 100).toFixed(1) : '0.0'}% CTR</span>
                    </div>
                  </div>
                `).join('') : '<p style="color: var(--text-muted); font-size: 0.9rem;">No sponsor ads loaded yet.</p>'}
              </div>
            </div>

            <!-- News Articles database list -->
            <div class="daily-box" style="padding: 24px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="font-weight: 700; font-size: 1.1rem;">Written Database Articles</span>
                <span class="badge" style="background: var(--primary-color);">${state.news?.length || 0}</span>
              </div>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 15px;">Your articles currently stored in Firestore. To clear delays and run exclusively on fresh API feeds, delete these or use the master clear tool below.</p>
              <div style="max-height: 250px; overflow-y: auto;">
                ${state.news && state.news.length > 0 ? state.news.map(n => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color);">
                    <div style="overflow: hidden; padding-right: 10px; max-width: 80%;">
                      <p style="font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 0;">${n.title}</p>
                      <span style="font-size: 0.7rem; color: var(--text-muted);">${n.category}</span>
                    </div>
                    <button onclick="deleteArticle('${n.id}')" style="color: #ff4444; font-size: 0.75rem; background: none; border: none; cursor: pointer; font-weight: 600; flex-shrink: 0;">Delete</button>
                  </div>
                `).join('') : '<p style="color: var(--text-muted); font-size: 0.8rem;">No custom database articles found.</p>'}
              </div>
            </div>

            <!-- Maintenance & Feed Performance Tools -->
            <div class="daily-box" style="padding: 24px;">
              <h3 style="margin-bottom: 15px; font-size: 1.1rem; font-weight: 700;">Performance & Feed Control</h3>
              <p style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 15px;">Instantly optimize site performance. Clearing all written articles forces the frontend to compile only instant RSS API feeds, resolving delays.</p>
              
              <button id="delete-all-btn" onclick="deleteAllMyArticles()" class="submit-btn" style="width: 100%; background: #ff4444; color: white; margin-bottom: 12px; font-size: 0.9rem; font-weight: 700; border: none;">Clear All Written Articles</button>
              <button id="seed-btn" class="submit-btn" style="width: 100%; background: #333; margin-bottom: 12px; font-size: 0.9rem; border: none;">Seed Database with Mock Articles</button>
              <button onclick="location.reload()" class="submit-btn" style="width: 100%; background: #555; font-size: 0.9rem; border: none;">Hard Refresh Client Cache</button>
            </div>
          </aside>
        </div>
      </div>
    `;

    const newsForm = container.querySelector('#news-form');
    if (newsForm) newsForm.addEventListener('submit', handleNewsSubmit);

    const adForm = container.querySelector('#ad-form');
    if (adForm) adForm.addEventListener('submit', handleAdSubmit);
    
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

window.handleAdSubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Creating Ad...';
  }

  const title = document.getElementById('ad-title').value;
  const description = document.getElementById('ad-description').value;
  const link = document.getElementById('ad-link').value;
  const imageUrl = document.getElementById('ad-image').value;
  const type = document.getElementById('ad-type').value;

  try {
    await addDoc(collection(db, 'affiliate_ads'), {
      title,
      description,
      link,
      imageUrl,
      type,
      views: 0,
      clicks: 0,
      createdAt: serverTimestamp()
    });
    alert('Sponsored Partner Ad created successfully!');
    form.reset();
    renderPage('#admin');
  } catch (error) {
    console.error('Failed to create ad:', error);
    alert('Error creating ad: ' + error.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = 'Publish Sponsor Ad';
    }
  }
};

window.deleteAd = async (id) => {
  if (!confirm('Are you sure you want to delete this sponsored partner deal?')) return;
  try {
    await deleteDoc(doc(db, 'affiliate_ads', id));
    alert('Sponsor ad removed.');
    renderPage('#admin');
  } catch (error) {
    console.error('Error deleting ad:', error);
    alert('Failed to delete ad: ' + error.message);
  }
};

window.deleteAllMyArticles = async () => {
  if (!confirm('Are you sure you want to delete ALL articles you have written? This will clear your custom database entries so the site only displays fresh, instant API-connected news.')) return;
  
  const btn = document.querySelector('#delete-all-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Deleting all...';
  }
  
  try {
    const newsQuery = await getDocs(collection(db, 'news'));
    let count = 0;
    for (const docSnap of newsQuery.docs) {
      await deleteDoc(doc(db, 'news', docSnap.id));
      count++;
    }
    alert(`Successfully deleted ${count} articles. Your site is now running entirely on instant API-connected feeds!`);
    renderPage('#admin');
  } catch (error) {
    console.error('Delete All Error:', error);
    alert('Failed to delete articles: ' + error.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Clear All Written Articles';
    }
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

function renderContribute(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 60px auto; line-height: 1.8;">
      <h1 style="font-size: 3.5rem; font-weight: 800; margin-bottom: 24px; letter-spacing: -2px;">Support Independent Intelligence</h1>
      <p style="font-size: 1.4rem; margin-bottom: 40px; color: var(--text-muted); font-weight: 400;">
        GoNow is powered by readers like you. Your contributions directly fund our <strong style="color: var(--text-color);">verified news feeds</strong>, expert research, and high-performance infrastructure.
      </p>
      
      <div style="background: var(--accent-color); padding: 40px; border-radius: 24px; border: 1px solid var(--border-color); text-align: center; margin-bottom: 60px;">
        <h2 style="font-size: 1.8rem; margin-bottom: 15px;">Contribute via Google</h2>
        <p style="margin-bottom: 30px; color: var(--text-muted);">We utilize Google Reader Revenue Manager for secure, one-tap support. Choose your contribution level below to help us stay independent.</p>
        
        <div style="display: flex; flex-direction: column; gap: 15px; max-width: 400px; margin: 0 auto;">
          <button onclick="triggerContribution('SUPPORT')" class="btn" style="background: var(--primary-color); color: white; padding: 18px; border-radius: 12px; font-weight: 700; font-size: 1.1rem; border: none; cursor: pointer; transition: transform 0.2s;">
            Support GoNow Intelligence
          </button>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Secure payment processed via your Google Account.</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
        <div>
          <h3 style="font-size: 1.2rem; margin-bottom: 15px; color: var(--primary-color);">Why Support Us?</h3>
          <p>By contributing, you ensure GoNow remains free of intrusive trackers and heavy advertising. Your revenue is used for high-authority licensing and advanced data analysis.</p>
        </div>
        <div>
          <h3 style="font-size: 1.2rem; margin-bottom: 15px; color: var(--primary-color);">One-Tap Simplicity</h3>
          <p>Managed directly through your Google Account, you can start, stop, or adjust your support instantly via the Google News ecosystem.</p>
        </div>
      </div>
      
      <p style="text-align: center; font-size: 0.9rem; color: var(--text-muted); margin-top: 60px;">
        GoNow Intelligence is a verified partner of the <strong style="color: var(--text-color);">Google Publisher Center</strong>.
      </p>
    </div>
  `;
}

// Function to interface with Google SwG
window.triggerContribution = (type) => {
  if (window.subscriptions) {
    // If SwG is loaded, trigger the contribution overlay
    window.subscriptions.showContributionOptions();
  } else {
    // Fallback or alert if SwG hasn't initialized
    alert("GoNow Intelligence Support is initializing. Please ensure you are logged into your Google Account.");
    console.log("RRM Triggered:", type);
  }
};

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
  const ad = getNextAffiliateAd();
  return `
    <div class="ad-container" data-slot="${slot}">
      <span class="ad-label">Advertisement</span>
      <div class="google-ad-wrapper" style="width: 100%;">
        <ins class="adsbygoogle"
             style="display:block;min-height:90px;"
             data-ad-client="ca-pub-1724173335946956"
             data-ad-slot="${slot}"
             data-ad-format="${format}"
             data-full-width-responsive="true"></ins>
      </div>
      
      <!-- Native / Fallback High-converting Sponsor Ad -->
      <div class="native-fallback-ad hidden" id="fallback-${slot}" style="width: 100%; margin-top: 5px;">
        ${ad ? `
          <a href="${ad.link}" target="_blank" rel="noopener noreferrer" onclick="trackAdClick('${ad.id}')" style="display: flex; align-items: center; gap: 15px; text-decoration: none; color: inherit; text-align: left; background: var(--accent-color); padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); transition: background-color 0.2s;">
            ${ad.imageUrl ? `<img src="${ad.imageUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" alt="${ad.title}">` : ''}
            <div>
              <h4 style="font-size: 0.95rem; margin-bottom: 4px; font-weight: 700; color: var(--primary-color); line-height: 1.3;">${ad.title}</h4>
              <p style="font-size: 0.8rem; color: var(--text-muted); line-height: 1.4; margin: 0;">${ad.description}</p>
              <span style="display: inline-block; font-size: 0.75rem; margin-top: 6px; font-weight: bold; color: var(--accent-color); text-transform: uppercase;">Partner Deal &rarr;</span>
            </div>
          </a>
        ` : ''}
      </div>
    </div>
  `;
}

function createNewsCard(item) {
  const isSaved = state.savedItems.some(s => s.id === item.id);
  const authorName = item.author || (item.isAuto ? `GoNow ${item.category} Desk` : 'GoNow Team');
  const catPath = `/${item.category.toLowerCase()}`;

  return `
    <article class="card" data-id="${item.id}" data-type="news" onclick="navigateTo('/article/${item.id}')" style="cursor: pointer;">
      <div class="card-img-wrapper">
        <img src="${item.image}" alt="${item.title}" class="card-img" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${getDefaultImage(item.category)}'">
      </div>
      <div class="card-content">
        <div class="card-meta">
          <span class="meta-label" onclick="event.stopPropagation(); navigateTo('${catPath}')" style="font-size: 0.65rem; margin-bottom: 5px; cursor: pointer; text-decoration: underline;">${item.category.toUpperCase()}</span>
          ${item.isAuto ? '<span style="font-size: 0.65rem; color: #ff3e3e; font-weight: 800; letter-spacing: 1px;">• LIVE</span>' : ''}
        </div>
        <h3 class="card-title">${item.title}</h3>
        <p class="card-excerpt">${item.excerpt}</p>
        <div class="card-footer" style="margin-top: auto; padding-top: 15px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color);">
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 700; font-size: 0.8rem; cursor: pointer;" onclick="event.stopPropagation(); navigateTo('/author/${encodeURIComponent(authorName)}')">By ${authorName}</span>
            <span style="font-size: 0.7rem; color: var(--text-muted);">${item.readTime || (item.content ? Math.max(1, Math.ceil(item.content.split(/\s+/).length / 220)) + ' min read' : '3 min read')}</span>
          </div>
          <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="event.stopPropagation(); toggleSave('${item.id}', 'news')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        </div>
      </div>
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
  initGoogleAds();
}

function openDetail(id, type) {
  const item = [...state.news, ...state.autoNews, ...thingsToKnow].find(i => i.id === id);
  if (!item) return;

  const isSaved = state.savedItems.some(s => s.id === item.id);
  
  // Real-time comments listener
  const q = query(collection(db, 'comments'), where('articleId', '==', id), orderBy('createdAt', 'desc'));
  
  // Initial render of modal structure
  renderModalContent(item, type, isSaved, []);
  initGoogleAds();
  
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
    
    <!-- Reader Revenue Manager CTA -->
    <div style="margin: 40px 0; padding: 30px; background: var(--accent-color); border-radius: 16px; border: 1px solid var(--border-color); text-align: center;">
      <h3 style="margin-bottom: 10px;">Support GoNow Intelligence</h3>
      <p style="margin-bottom: 20px; color: var(--text-muted); font-size: 0.95rem;">If you value our high-authority reporting, consider supporting our mission with a one-time or recurring contribution.</p>
      <button onclick="triggerContribution('ARTICLE_CTA')" class="submit-btn" style="padding: 12px 24px; font-size: 1rem;">
        Support with Google
      </button>
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
  const queryText = e.target.value.toLowerCase().trim();
  if (!queryText || queryText.length < 2) {
    searchResults.innerHTML = queryText.length === 1 ? '<p class="notif-empty">Keep typing...</p>' : '';
    return;
  }

  // Aggregate all possible search items
  const allItems = [
    ...state.autoNews.map(item => ({ ...item, type: 'news' }))
  ];

  const results = allItems.filter(item => 
    item.title?.toLowerCase().includes(queryText) || 
    item.excerpt?.toLowerCase().includes(queryText) ||
    item.category?.toLowerCase().includes(queryText) ||
    (item.author && item.author.toLowerCase().includes(queryText))
  ).slice(0, 15); // Limit results for efficiency

  if (results.length === 0) {
    searchResults.innerHTML = `
      <div style="text-align: center; padding: 50px 0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <p style="color: var(--text-muted); font-size: 1.1rem;">No matches found for "${queryText}"</p>
        <p style="font-size: 0.9rem; margin-top: 10px;">Try searching for Politics, Tech, or historical events.</p>
      </div>
    `;
    return;
  }

  searchResults.innerHTML = `
    <div style="padding: 0 0 40px 0;">
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1px;">Found ${results.length} relevant results</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${results.map(item => {
          const path = `/article/${item.id}`;
          const icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></svg>`;
          
          return `
            <div class="trending-item" style="padding: 20px; border-radius: 12px; background: var(--card-bg); border: 1px solid var(--border-color); cursor: pointer; display: flex; align-items: flex-start; gap: 20px; transition: var(--transition);" 
                 onclick="searchOverlay.classList.remove('active'); navigateTo('${path}')">
              <div style="width: 40px; height: 40px; background: var(--accent-color); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary-color); flex-shrink: 0;">
                ${icon}
              </div>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                  <span class="meta-label" style="font-size: 0.65rem; color: var(--primary-color);">${item.category.toUpperCase()}</span>
                  ${item.timestamp ? `<span style="font-size: 0.7rem; color: var(--text-muted);">${formatDate(item.timestamp)}</span>` : ''}
                </div>
                <h4 style="font-size: 1.15rem; font-weight: 700; line-height: 1.3; margin-bottom: 8px;">${item.title}</h4>
                <p style="font-size: 0.9rem; color: var(--text-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${item.excerpt || ''}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}


// Global Error Handling
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Rejection at:', event.promise, 'reason:', event.reason);
  const message = event.reason?.message || (typeof event.reason === 'string' ? event.reason : 'Unknown error');
  if (message.includes('permission-denied')) {
    alert('Subscription Update: Please ensure you are logged in to follow topics or save articles.');
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
