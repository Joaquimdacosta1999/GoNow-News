/**
 * GoNow - Main Script
 * Handles routing, theme, rendering, and interactivity.
 */

import { 
  newsData, 
  htmlLessons, 
  dailyHappenings, 
  dailyQuotes 
} from './data.js';

// State Management
const state = {
  currentTheme: localStorage.getItem('theme') || 'dark',
  savedItems: JSON.parse(localStorage.getItem('savedItems')) || [],
  learnedLessons: JSON.parse(localStorage.getItem('learnedLessons')) || [],
  comments: JSON.parse(localStorage.getItem('comments')) || {},
  currentRoute: window.location.hash || '#home',
  viewMode: localStorage.getItem('viewMode') || 'grid' // 'grid' or 'list'
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

// Initialize
function init() {
  // Set initial theme
  body.setAttribute('data-theme', state.currentTheme);
  updateThemeIcon();

  // Event Listeners
  themeToggle.addEventListener('click', toggleTheme);
  searchToggle.addEventListener('click', () => searchOverlay.classList.add('active'));
  closeSearch.addEventListener('click', () => searchOverlay.classList.remove('active'));
  closeModal.addEventListener('click', () => modal.classList.remove('active'));
  searchInput.addEventListener('input', handleSearch);

  // Routing
  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // Close modal on outside click
  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
    if (e.target === searchOverlay) searchOverlay.classList.remove('active');
  });
}

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
  
  // Update active nav link
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });

  // Render Page
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
    renderCategory(container, 'Politics', newsData.filter(n => n.category === 'Politics'));
  } else if (hash === '#football') {
    renderCategory(container, 'Football', newsData.filter(n => n.category === 'Football'));
  } else if (hash === '#entertainment') {
    renderCategory(container, 'Entertainment', newsData.filter(n => n.category === 'Entertainment'));
  } else if (hash === '#technology') {
    renderCategory(container, 'Technology', newsData.filter(n => n.category === 'Technology'));
  } else if (hash === '#html') {
    renderCategory(container, 'Learn HTML Daily', htmlLessons, 'html');
  } else if (hash === '#daily') {
    renderDaily(container);
  } else if (hash === '#saved') {
    renderSaved(container);
  } else if (hash === '#about') {
    renderAbout(container);
  }

  mainContent.appendChild(container);
}

// Page Renderers
function renderHome(container) {
  const featured = newsData[0];
  const latest = newsData.slice(1, 7);
  const trending = newsData.slice(0, 5);
  const quote = dailyQuotes[0];
  const happenings = dailyHappenings[0];

  container.innerHTML = `
    <section class="hero">
      <div class="hero-card" onclick="window.location.hash = '#article/${featured.id}'">
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
          ${latest.map(item => createNewsCard(item)).join('')}
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
      ${items.map(item => {
        if (type === 'news') return createNewsCard(item);
        if (type === 'html') return createHtmlCard(item);
      }).join('')}
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

  // Group by category
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

function renderAbout(container) {
  container.innerHTML = `
    <div style="max-width: 800px; margin: 60px auto;">
      <h1 style="font-size: 3rem; margin-bottom: 20px;">About GoNow</h1>
      <p style="font-size: 1.2rem; margin-bottom: 40px; color: var(--text-muted);">
        GoNow is a modern, fast, and simple news portal designed for the modern reader. 
      </p>
      
      <h2 class="section-title">Our Mission</h2>
      <p style="margin-bottom: 30px;">
        To provide a clean, distraction-free reading experience that focuses on what matters most: the content. 
      </p>

      <h2 class="section-title">Technologies Used</h2>
      <ul style="margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <li>✓ Vanilla HTML5</li>
        <li>✓ Vanilla CSS3</li>
        <li>✓ Vanilla JavaScript</li>
        <li>✓ LocalStorage</li>
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

function openDetail(id, type) {
  let item;
  if (type === 'news') item = newsData.find(n => n.id === id);
  else if (type === 'html') item = htmlLessons.find(h => h.id === id);

  if (!item) return;

  const isSaved = state.savedItems.some(s => s.id === item.id);
  const comments = state.comments[id] || [];

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
      <div class="comment-form">
        <textarea class="comment-input" id="comment-text" placeholder="Add a comment..." rows="3"></textarea>
        <button class="submit-btn" onclick="addComment('${id}')">Post Comment</button>
      </div>
      <div class="comment-list">
        ${comments.length > 0 ? comments.map(c => `
          <div class="comment">
            <div class="comment-header">
              <span>User</span>
              <span>${c.date}</span>
            </div>
            <p>${c.text}</p>
          </div>
        `).join('') : '<p style="color: var(--text-muted);">No comments yet. Be the first!</p>'}
      </div>
    </section>
  `;

  modal.classList.add('active');
}

// Global functions for inline onclick
window.toggleSave = (id, type) => {
  const allItems = [...newsData, ...htmlLessons];
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
  
  if (modal.classList.contains('active')) openDetail(id, type);
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

window.addComment = (id) => {
  const input = document.getElementById('comment-text');
  const text = input.value.trim();
  if (!text) return;

  if (!state.comments[id]) state.comments[id] = [];
  state.comments[id].unshift({
    text,
    date: new Date().toLocaleDateString()
  });

  localStorage.setItem('comments', JSON.stringify(state.comments));
  input.value = '';
  openDetail(id, 'news');
};

window.shareItem = (title) => {
  if (navigator.share) {
    navigator.share({
      title: 'GoNow - ' + title,
      url: window.location.href
    });
  } else {
    alert('Sharing is not supported in this browser.');
  }
};

// Search Logic
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  if (!query) {
    searchResults.innerHTML = '';
    return;
  }

  const allItems = [...newsData, ...htmlLessons];
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

// Helpers
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start the app
init();
