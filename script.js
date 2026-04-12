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

import { 
  htmlLessons, 
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
  savedItems: JSON.parse(localStorage.getItem('savedItems')) || [],
  learnedLessons: JSON.parse(localStorage.getItem('learnedLessons')) || [],
  comments: {},
  currentRoute: window.location.hash || '#home',
  viewMode: localStorage.getItem('viewMode') || 'grid'
};

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

// Initialize
function init() {
  body.setAttribute('data-theme', state.currentTheme);
  updateThemeIcon();

  // Event Listeners
  themeToggle.addEventListener('click', toggleTheme);
  searchToggle.addEventListener('click', () => searchOverlay.classList.add('active'));
  closeSearch.addEventListener('click', () => searchOverlay.classList.remove('active'));
  closeModal.addEventListener('click', () => modal.classList.remove('active'));
  searchInput.addEventListener('input', handleSearch);
  authBtn.addEventListener('click', handleAuth);

  // Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    state.user = user;
    state.isAuthInitialized = true;
    
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
      if (isAdmin) {
        adminLink.classList.remove('hidden');
      }
    } else {
      state.userProfile = null;
      authBtn.title = 'Login';
      authBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      adminLink.classList.add('hidden');
    }
    handleRoute();
  });

  // Real-time News Listener
  onSnapshot(collection(db, 'news'), (snapshot) => {
    state.news = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    handleRoute();
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'news'));

  // Routing
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
    if (e.target === searchOverlay) searchOverlay.classList.remove('active');
  });
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
  const hash = window.location.hash || '#home';
  state.currentRoute = hash;
  
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });

  renderPage(hash);
  window.scrollTo(0, 0);
}

function renderPage(hash) {
  mainContent.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'container fade-in';

  if (hash === '#home') {
    renderHome(container);
  } else if (hash === '#politics') {
    renderCategory(container, 'Politics', state.news.filter(n => n.category === 'Politics'));
  } else if (hash === '#football') {
    renderCategory(container, 'Football', state.news.filter(n => n.category === 'Football'));
  } else if (hash === '#entertainment') {
    renderCategory(container, 'Entertainment', state.news.filter(n => n.category === 'Entertainment'));
  } else if (hash === '#technology') {
    renderCategory(container, 'Technology', state.news.filter(n => n.category === 'Technology'));
  } else if (hash === '#html') {
    renderCategory(container, 'Learn HTML Daily', htmlLessons, 'html');
  } else if (hash === '#daily') {
    renderDaily(container);
  } else if (hash === '#saved') {
    renderSaved(container);
  } else if (hash === '#about') {
    renderAbout(container);
  } else if (hash === '#admin') {
    renderAdmin(container);
  } else if (hash.startsWith('#article/')) {
    const id = hash.split('/')[1];
    const article = state.news.find(n => n.id === id);
    if (article) openDetail(id, 'news');
    else window.location.hash = '#home';
  }

  mainContent.appendChild(container);
}

// Page Renderers
function renderHome(container) {
  const featured = state.news[0] || { title: 'No news yet', excerpt: 'Check back later!', image: 'https://picsum.photos/seed/gonow/800/450', category: 'General' };
  const latest = state.news.slice(1, 7);
  const trending = state.news.slice(0, 5);
  const quote = dailyQuotes[0];
  const happenings = dailyHappenings[0];

  container.innerHTML = `
    <section class="hero">
      <div class="hero-card" onclick="${featured.id ? `window.location.hash = '#article/${featured.id}'` : ''}">
        <img src="${featured.image}" alt="${featured.title}" class="hero-img" loading="lazy">
        <div class="hero-overlay"></div>
        <div class="hero-content">
          <span class="badge">${featured.category}</span>
          <h1 class="hero-title">${featured.title}</h1>
          <p>${featured.excerpt}</p>
        </div>
      </div>
    </section>

    <div class="main-grid">
      <section class="latest-news">
        <h2 class="section-title">Latest News</h2>
        <div class="news-grid list-view">
          ${latest.length > 0 ? latest.map(item => createNewsCard(item)).join('') : '<p>No news available.</p>'}
        </div>
      </section>

      <aside class="sidebar">
        <div class="sidebar-section">
          <h2 class="section-title">Trending</h2>
          ${trending.map((item, i) => `
            <div class="trending-item" onclick="window.location.hash = '#article/${item.id}'">
              <span class="trending-num">0${i + 1}</span>
              <div class="trending-content">
                <span class="badge" style="font-size: 0.6rem; padding: 2px 6px;">${item.category}</span>
                <h4>${item.title}</h4>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="sidebar-section">
          <div class="daily-box">
            <h3>Daily Happenings</h3>
            <ul class="daily-list">
              ${happenings.events.map(e => `<li>${e}</li>`).join('')}
            </ul>
            <div class="quote-box">
              <p class="quote-text">"${quote.quote}"</p>
              <p class="quote-author">— ${quote.author}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  `;

  attachCardListeners();
}

function renderCategory(container, title, items, type = 'news') {
  const isList = state.viewMode === 'list';
  
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 40px; margin-bottom: 20px;">
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
      ${items.length > 0 ? items.map(item => {
        if (type === 'news') return createNewsCard(item);
        if (type === 'html') return createHtmlCard(item);
      }).join('') : '<p>No items found in this category.</p>'}
    </div>
  `;
  attachCardListeners();
}

function renderDaily(container) {
  const quote = dailyQuotes[Math.floor(Math.random() * dailyQuotes.length)];
  const happenings = dailyHappenings[0];
  const todayLesson = htmlLessons[0];

  container.innerHTML = `
    <h1 class="section-title" style="font-size: 2rem; margin-top: 40px;">Daily Digest</h1>
    <div class="main-grid">
      <div>
        <section class="mb-4">
          <h2 class="section-title">Learn HTML Daily</h2>
          ${createHtmlCard(todayLesson)}
        </section>
        <section class="mt-4">
          <h2 class="section-title">On This Day</h2>
          <div class="daily-box">
            <ul class="daily-list">
              ${happenings.events.map(e => `<li style="font-size: 1.1rem; padding: 20px 0;">${e}</li>`).join('')}
            </ul>
          </div>
        </section>
      </div>
      <aside>
        <h2 class="section-title">Daily Quote</h2>
        <div class="daily-box" style="text-align: center; padding: 40px;">
          <p style="font-size: 1.5rem; font-style: italic; margin-bottom: 20px;">"${quote.quote}"</p>
          <p class="quote-author" style="font-size: 1.1rem;">— ${quote.author}</p>
        </div>
      </aside>
    </div>
  `;
  attachCardListeners();
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
                  <label style="display: block; margin-bottom: 5px; font-weight: 600;">Full Content</label>
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

    const form = document.getElementById('news-form');
    if (form) form.addEventListener('submit', handleNewsSubmit);
    
    const seedBtn = document.getElementById('seed-btn');
    if (seedBtn) seedBtn.addEventListener('click', seedDatabase);

  } catch (error) {
    console.error('Admin render error:', error);
    container.innerHTML = `<div style="padding: 50px; text-align: center;"><h2>Error loading dashboard</h2><p>${error.message}</p><button onclick="location.reload()" class="submit-btn">Retry</button></div>`;
  }
}

async function seedDatabase() {
  if (!confirm('This will add all mock articles to your live database. Continue?')) return;
  const btn = document.getElementById('seed-btn');
  btn.disabled = true;
  btn.innerText = 'Seeding...';

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
  
  if (!state.user) {
    console.error('Submission failed: No user in state');
    alert('Error: You are not logged in. Please log in again.');
    return;
  }

  const btn = e.target.querySelector('button');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Publishing...';

  try {
    console.log('Collecting form data...');
    const title = document.getElementById('news-title').value;
    const category = document.getElementById('news-category').value;
    const image = document.getElementById('news-image').value;
    const excerpt = document.getElementById('news-excerpt').value;
    const content = document.getElementById('news-content').value;

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
    <div style="max-width: 800px; margin: 60px auto;">
      <h1 style="font-size: 3rem; margin-bottom: 20px;">About GoNow</h1>
      <p style="font-size: 1.2rem; margin-bottom: 40px; color: var(--text-muted);">
        GoNow is a modern, fast, and simple news portal powered by Firebase. 
      </p>
      <h2 class="section-title">Technologies Used</h2>
      <ul style="margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <li>✓ Vanilla HTML5/CSS3/JS</li>
        <li>✓ Firebase Authentication</li>
        <li>✓ Firestore Real-time Database</li>
        <li>✓ LocalStorage Persistence</li>
      </ul>
    </div>
  `;
}

// Component Creators
function createNewsCard(item) {
  const isSaved = state.savedItems.some(s => s.id === item.id);
  return `
    <article class="card" data-id="${item.id}" data-type="news">
      <div class="card-img-wrapper">
        <img src="${item.image}" alt="${item.title}" class="card-img" loading="lazy">
      </div>
      <div class="card-content">
        <div class="card-meta">
          <span class="badge">${item.category}</span>
          <span>${item.readTime}</span>
        </div>
        <h3 class="card-title">${item.title}</h3>
        <p class="card-excerpt">${item.excerpt}</p>
        <div class="card-footer">
          <span>${item.date}</span>
          <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="event.stopPropagation(); toggleSave('${item.id}', 'news')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        </div>
      </div>
    </article>
  `;
}

function createHtmlCard(item) {
  const isSaved = state.savedItems.some(s => s.id === item.id);
  const isLearned = state.learnedLessons.includes(item.id);
  return `
    <div class="lesson-card" data-id="${item.id}" data-type="html">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <div>
          <span class="badge" style="background: #e34f26;">HTML TIP</span>
          <h3 style="margin-top: 10px;">${item.title}</h3>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="toggleSave('${item.id}', 'html')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </button>
        </div>
      </div>
      <p style="margin-bottom: 15px;">${item.tip}</p>
      <div class="code-block">
        <button class="copy-btn" onclick="copyCode(this, \`${item.code.replace(/`/g, '\\`')}\`)">Copy</button>
        <pre><code>${escapeHtml(item.code)}</code></pre>
      </div>
      <button class="submit-btn" style="width: 100%; background: ${isLearned ? '#22c55e' : 'var(--primary-color)'}" onclick="toggleLearned('${item.id}')">
        ${isLearned ? '✓ Learned' : 'Mark as Learned'}
      </button>
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

async function openDetail(id, type) {
  let item;
  if (type === 'news') item = state.news.find(n => n.id === id);
  else if (type === 'html') item = htmlLessons.find(h => h.id === id);

  if (!item) return;

  const isSaved = state.savedItems.some(s => s.id === item.id);
  
  // Real-time comments listener
  const q = query(collection(db, 'comments'), where('articleId', '==', id), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => doc.data());
    renderModalContent(item, type, isSaved, comments);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'comments'));

  modal.classList.add('active');
}

function renderModalContent(item, type, isSaved, comments) {
  modalBody.innerHTML = `
    <img src="${item.image}" alt="${item.title}" class="detail-img">
    <div class="detail-meta">
      <span class="badge">${item.category}</span>
      ${item.date ? `<span>${item.date}</span>` : ''}
      ${item.readTime ? `<span>${item.readTime} read</span>` : ''}
    </div>
    <h1 class="detail-title">${item.title}</h1>
    <div class="detail-body">
      ${item.content ? `<p>${item.content}</p>` : ''}
    </div>
    <div class="card-footer mt-4">
      <div style="display: flex; gap: 15px;">
        <button class="submit-btn" onclick="toggleSave('${item.id}', '${type}')">
          ${isSaved ? 'Unsave' : 'Save Item'}
        </button>
        <button class="icon-btn" style="border: 1px solid var(--border-color); border-radius: 8px; width: auto; padding: 0 15px;" onclick="shareItem('${item.title}')">
          Share
        </button>
      </div>
    </div>
    <section class="comments-section">
      <h3>Comments (${comments.length})</h3>
      ${state.user ? `
        <div class="comment-form">
          <textarea class="comment-input" id="comment-text" placeholder="Add a comment..." rows="3"></textarea>
          <button class="submit-btn" onclick="addComment('${item.id}')">Post Comment</button>
        </div>
      ` : '<p style="margin-bottom: 20px;">Please <a href="#" onclick="handleAuth(); return false;" style="color: var(--primary-color); font-weight: 600;">login</a> to comment.</p>'}
      <div class="comment-list">
        ${comments.length > 0 ? comments.map(c => `
          <div class="comment">
            <div class="comment-header">
              <span>${c.userEmail || 'Anonymous'}</span>
              <span>${c.date}</span>
            </div>
            <p>${c.text}</p>
          </div>
        `).join('') : '<p style="color: var(--text-muted);">No comments yet. Be the first!</p>'}
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
  navigator.clipboard.writeText(code).then(() => {
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = originalText, 2000);
  });
};

window.addComment = async (id) => {
  const input = document.getElementById('comment-text');
  const text = input.value.trim();
  if (!text || !state.user) return;

  const comment = {
    articleId: id,
    text,
    date: new Date().toLocaleDateString(),
    userEmail: state.user.email,
    userUid: state.user.uid,
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, 'comments'), comment);
    input.value = '';
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'comments');
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
  console.error('Unhandled Rejection:', event.reason);
  if (event.reason?.message?.includes('permission-denied')) {
    alert('Permission Denied: You are not authorized to perform this action.');
  } else {
    alert('An unexpected error occurred: ' + (event.reason?.message || 'Unknown error'));
  }
});

window.onerror = function(message, source, lineno, colno, error) {
  console.error('Global Error:', message, error);
  return false;
};

init();
