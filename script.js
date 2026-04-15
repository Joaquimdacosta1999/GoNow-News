/**
 * GoNow - Main Script
 * Full Firebase/Firestore integration: Google Auth, admin publish, real-time articles & comments.
 */

import {
  newsData,
  htmlLessons,
  dailyHappenings,
  dailyQuotes
} from './data.js';

import {
  db, auth, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, getDoc, addDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from './firebase.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentTheme: localStorage.getItem('theme') || 'dark',
  savedItems: JSON.parse(localStorage.getItem('savedItems')) || [],
  learnedLessons: JSON.parse(localStorage.getItem('learnedLessons')) || [],
  currentRoute: window.location.hash || '#home',
  viewMode: localStorage.getItem('viewMode') || 'grid',
  currentUser: null,
  isAdmin: false,
  firestoreArticles: [],
  firestoreComments: {}
};

// ─── DOM ──────────────────────────────────────────────────────────────────────
const body          = document.body;
const themeToggle   = document.getElementById('theme-toggle');
const mainContent   = document.getElementById('main-content');
const searchToggle  = document.getElementById('search-toggle');
const searchOverlay = document.getElementById('search-overlay');
const closeSearch   = document.getElementById('close-search');
const searchInput   = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const modal         = document.getElementById('modal');
const closeModal    = document.getElementById('close-modal');
const modalBody     = document.getElementById('modal-body');

// ─── Auth ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      state.isAdmin = snap.exists() && snap.data().role === 'admin';
    } catch {
      state.isAdmin = false;
    }
  } else {
    state.isAdmin = false;
  }
  updateAuthUI();
  renderPage(state.currentRoute);
});

function updateAuthUI() {
  document.getElementById('auth-btn')?.remove();
  document.getElementById('publish-btn')?.remove();

  const nav = document.querySelector('.nav-links');
  if (!nav) return;

  const btn = document.createElement('button');
  btn.id = 'auth-btn';
  btn.style.cssText = `
    margin-left:8px; padding:6px 14px; border-radius:8px;
    border:1px solid var(--border-color); background:var(--card-bg);
    color:var(--text-color); cursor:pointer; font-size:0.85rem;
    display:flex; align-items:center; gap:6px;
  `;

  if (state.currentUser) {
    btn.innerHTML = `
      <img src="${state.currentUser.photoURL || ''}"
        style="width:22px;height:22px;border-radius:50%;object-fit:cover;"
        onerror="this.style.display='none'">
      Sign Out
    `;
    btn.onclick = () => signOut(auth);
  } else {
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
        <polyline points="10 17 15 12 10 7"/>
        <line x1="15" y1="12" x2="3" y2="12"/>
      </svg>
      Sign In
    `;
    btn.onclick = () => signInWithPopup(auth, googleProvider);
  }
  nav.appendChild(btn);

  if (state.isAdmin) {
    const pub = document.createElement('button');
    pub.id = 'publish-btn';
    pub.innerHTML = '+ Publish';
    pub.style.cssText = `
      margin-left:8px; padding:6px 14px; border-radius:8px;
      border:none; background:var(--primary-color); color:#fff;
      cursor:pointer; font-size:0.85rem; font-weight:600;
    `;
    pub.onclick = openPublishModal;
    nav.appendChild(pub);
  }
}

// ─── Firestore: Live Articles ─────────────────────────────────────────────────
function subscribeToArticles() {
  const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    state.firestoreArticles = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
      _firestore: true
    }));
    renderPage(state.currentRoute);
  }, (err) => console.error('Articles error:', err));
}

// ─── Firestore: Live Comments ─────────────────────────────────────────────────
function subscribeToComments() {
  const q = query(collection(db, 'comments'), orderBy('date', 'desc'));
  onSnapshot(q, (snapshot) => {
    state.firestoreComments = {};
    snapshot.docs.forEach(d => {
      const data = d.data();
      const aid  = data.articleId;
      if (!state.firestoreComments[aid]) state.firestoreComments[aid] = [];
      state.firestoreComments[aid].push({ id: d.id, ...data });
    });
  }, (err) => console.error('Comments error:', err));
}

// ─── Publish Modal (Admin Only) ───────────────────────────────────────────────
function openPublishModal() {
  modalBody.innerHTML = `
    <h2 style="margin-bottom:24px;">Publish New Article</h2>
    <div style="display:flex;flex-direction:column;gap:16px;">

      <div>
        <label style="display:block;margin-bottom:6px;font-weight:600;">Title *</label>
        <input id="pub-title" type="text" placeholder="Article title..."
          style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                 background:var(--card-bg);color:var(--text-color);font-size:1rem;">
      </div>

      <div>
        <label style="display:block;margin-bottom:6px;font-weight:600;">Category *</label>
        <select id="pub-category"
          style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                 background:var(--card-bg);color:var(--text-color);font-size:1rem;">
          <option value="Politics">Politics</option>
          <option value="Football">Football</option>
          <option value="Entertainment">Entertainment</option>
          <option value="Technology">Technology</option>
        </select>
      </div>

      <div>
        <label style="display:block;margin-bottom:6px;font-weight:600;">Excerpt *</label>
        <textarea id="pub-excerpt" rows="2" placeholder="Short summary..."
          style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                 background:var(--card-bg);color:var(--text-color);font-size:1rem;resize:vertical;"></textarea>
      </div>

      <div>
        <label style="display:block;margin-bottom:6px;font-weight:600;">Content *</label>
        <textarea id="pub-content" rows="6" placeholder="Full article content..."
          style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                 background:var(--card-bg);color:var(--text-color);font-size:1rem;resize:vertical;"></textarea>
      </div>

      <div>
        <label style="display:block;margin-bottom:6px;font-weight:600;">Image URL *</label>
        <input id="pub-image" type="url" placeholder="https://..."
          style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                 background:var(--card-bg);color:var(--text-color);font-size:1rem;">
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
          Tip: use https://picsum.photos/seed/yourword/800/450 for a free image
        </p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <label style="display:block;margin-bottom:6px;font-weight:600;">Read Time *</label>
          <input id="pub-readtime" type="text" placeholder="e.g. 3 min"
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                   background:var(--card-bg);color:var(--text-color);font-size:1rem;">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;font-weight:600;">Date *</label>
          <input id="pub-date" type="date"
            style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border-color);
                   background:var(--card-bg);color:var(--text-color);font-size:1rem;"
            value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>

      <div id="pub-error" style="color:#ef4444;font-size:0.9rem;display:none;"></div>

      <div style="display:flex;gap:12px;margin-top:8px;">
        <button id="pub-submit-btn" onclick="submitArticle()"
          style="flex:1;padding:12px;background:var(--primary-color);color:#fff;
                 border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;">
          Publish Article
        </button>
        <button onclick="document.getElementById('modal').classList.remove('active')"
          style="padding:12px 20px;background:transparent;color:var(--text-color);
                 border:1px solid var(--border-color);border-radius:8px;font-size:1rem;cursor:pointer;">
          Cancel
        </button>
      </div>

    </div>
  `;
  modal.classList.add('active');
}

window.submitArticle = async () => {
  const title    = document.getElementById('pub-title').value.trim();
  const category = document.getElementById('pub-category').value;
  const excerpt  = document.getElementById('pub-excerpt').value.trim();
  const content  = document.getElementById('pub-content').value.trim();
  const image    = document.getElementById('pub-image').value.trim();
  const readTime = document.getElementById('pub-readtime').value.trim();
  const date     = document.getElementById('pub-date').value;
  const errEl    = document.getElementById('pub-error');
  const btn      = document.getElementById('pub-submit-btn');

  if (!title || !excerpt || !content || !image || !readTime || !date) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.style.display = 'block';
    return;
  }
  if (!image.startsWith('http://') && !image.startsWith('https://')) {
    errEl.textContent = 'Image URL must start with http:// or https://';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.textContent = 'Publishing...';
  btn.disabled = true;

  try {
    await addDoc(collection(db, 'news'), {
      title,
      category,
      excerpt,
      content,
      image,
      readTime,
      date,
      authorUid: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    modal.classList.remove('active');
    showToast('Article published!');
  } catch (err) {
    console.error('Publish error:', err);
    errEl.textContent = 'Failed to publish: ' + err.message;
    errEl.style.display = 'block';
    btn.textContent = 'Publish Article';
    btn.disabled = false;
  }
};

// ─── Delete Article (Admin) ───────────────────────────────────────────────────
window.deleteArticle = async (id) => {
  if (!state.isAdmin) return;
  if (!confirm('Delete this article permanently?')) return;
  try {
    await deleteDoc(doc(db, 'news', id));
    modal.classList.remove('active');
    showToast('Article deleted.');
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
    background:var(--primary-color); color:#fff; padding:12px 24px;
    border-radius:999px; font-weight:600; font-size:0.95rem;
    z-index:9999; box-shadow:0 4px 20px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
  body.setAttribute('data-theme', state.currentTheme);
  updateThemeIcon();

  themeToggle.addEventListener('click', toggleTheme);
  searchToggle.addEventListener('click', () => searchOverlay.classList.add('active'));
  closeSearch.addEventListener('click',  () => searchOverlay.classList.remove('active'));
  closeModal.addEventListener('click',   () => modal.classList.remove('active'));
  searchInput.addEventListener('input', handleSearch);

  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  window.addEventListener('click', (e) => {
    if (e.target === modal)         modal.classList.remove('active');
    if (e.target === searchOverlay) searchOverlay.classList.remove('active');
  });

  subscribeToArticles();
  subscribeToComments();
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function toggleTheme() {
  state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
  body.setAttribute('data-theme', state.currentTheme);
  localStorage.setItem('theme', state.currentTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  themeToggle.innerHTML = state.currentTheme === 'light'
    ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
}

// ─── View Mode ────────────────────────────────────────────────────────────────
window.toggleViewMode = (mode) => {
  state.viewMode = mode;
  localStorage.setItem('viewMode', mode);
  renderPage(state.currentRoute);
};

// ─── Routing ──────────────────────────────────────────────────────────────────
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

  const allNews = [...state.firestoreArticles, ...newsData];

  if      (hash === '#home')          renderHome(container, allNews);
  else if (hash === '#politics')      renderCategory(container, 'Politics',      allNews.filter(n => n.category === 'Politics'));
  else if (hash === '#football')      renderCategory(container, 'Football',      allNews.filter(n => n.category === 'Football'));
  else if (hash === '#entertainment') renderCategory(container, 'Entertainment', allNews.filter(n => n.category === 'Entertainment'));
  else if (hash === '#technology')    renderCategory(container, 'Technology',    allNews.filter(n => n.category === 'Technology'));
  else if (hash === '#html')          renderCategory(container, 'Learn HTML Daily', htmlLessons, 'html');
  else if (hash === '#daily')         renderDaily(container);
  else if (hash === '#saved')         renderSaved(container);
  else if (hash === '#about')         renderAbout(container);

  mainContent.appendChild(container);
}

// ─── Page Renderers ───────────────────────────────────────────────────────────
function renderHome(container, allNews) {
  const featured   = allNews[0] || newsData[0];
  const latest     = allNews.slice(1, 7);
  const trending   = allNews.slice(0, 5);
  const quote      = dailyQuotes[0];
  const happenings = dailyHappenings[0];

  container.innerHTML = `
    <section class="hero">
      <div class="hero-card" onclick="openDetail('${featured.id}', 'news')">
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
            <div class="trending-item" onclick="openDetail('${item.id}', 'news')">
              <span class="trending-num">0${i + 1}</span>
              <div class="trending-content">
                <span class="badge" style="font-size:0.6rem;padding:2px 6px;">${item.category}</span>
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
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:40px;margin-bottom:20px;">
      <h1 class="section-title" style="margin-bottom:0;">${title}</h1>
      <div class="view-toggle">
        <button class="toggle-btn ${!isList ? 'active' : ''}" onclick="toggleViewMode('grid')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
          Grid
        </button>
        <button class="toggle-btn ${isList ? 'active' : ''}" onclick="toggleViewMode('list')">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
          List
        </button>
      </div>
    </div>
    <div class="news-grid ${isList ? 'list-view' : ''}">
      ${items.map(item => type === 'html' ? createHtmlCard(item) : createNewsCard(item)).join('')}
    </div>
  `;
  attachCardListeners();
}

function renderDaily(container) {
  const quote       = dailyQuotes[Math.floor(Math.random() * dailyQuotes.length)];
  const happenings  = dailyHappenings[0];
  const todayLesson = htmlLessons[0];
  container.innerHTML = `
    <h1 class="section-title" style="font-size:2rem;margin-top:40px;">Daily Digest</h1>
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
              ${happenings.events.map(e => `<li style="font-size:1.1rem;padding:20px 0;">${e}</li>`).join('')}
            </ul>
          </div>
        </section>
      </div>
      <aside>
        <h2 class="section-title">Daily Quote</h2>
        <div class="daily-box" style="text-align:center;padding:40px;">
          <p style="font-size:1.5rem;font-style:italic;margin-bottom:20px;">"${quote.quote}"</p>
          <p class="quote-author" style="font-size:1.1rem;">— ${quote.author}</p>
        </div>
      </aside>
    </div>
  `;
  attachCardListeners();
}

function renderSaved(container) {
  const saved = state.savedItems;
  if (!saved.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:100px 20px;">
        <h1 style="font-size:2rem;margin-bottom:20px;">No saved items yet</h1>
        <p style="color:var(--text-muted);margin-bottom:40px;">Items you heart will appear here.</p>
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
    <h1 class="section-title" style="font-size:2rem;margin-top:40px;">Saved Items</h1>
    ${categories.map(cat => {
      if (!grouped[cat].length) return '';
      return `
        <div class="mb-4">
          <h2 class="section-title">${cat}</h2>
          <div class="news-grid">
            ${grouped[cat].map(item => cat === 'HTML' ? createHtmlCard(item) : createNewsCard(item)).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
  attachCardListeners();
}

function renderAbout(container) {
  container.innerHTML = `
    <div style="max-width:800px;margin:60px auto;">
      <h1 style="font-size:3rem;margin-bottom:20px;">About GoNow</h1>
      <p style="font-size:1.2rem;margin-bottom:40px;color:var(--text-muted);">
        GoNow is a modern, fast, and simple news portal designed for the modern reader.
      </p>
      <h2 class="section-title">Our Mission</h2>
      <p style="margin-bottom:30px;">
        To provide a clean, distraction-free reading experience that focuses on what matters most: the content.
      </p>
      <h2 class="section-title">Technologies Used</h2>
      <ul style="margin-bottom:40px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <li>✓ Vanilla HTML5</li>
        <li>✓ Vanilla CSS3</li>
        <li>✓ Vanilla JavaScript</li>
        <li>✓ Firebase / Firestore</li>
        <li>✓ Google Auth</li>
        <li>✓ Deployed on Vercel</li>
      </ul>
    </div>
  `;
}

// ─── Card Components ──────────────────────────────────────────────────────────
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
          <button class="save-btn ${isSaved ? 'text-primary' : ''}"
            onclick="event.stopPropagation(); toggleSave('${item.id}', 'news')">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
              fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
            </svg>
          </button>
        </div>
      </div>
    </article>
  `;
}

function createHtmlCard(item) {
  const isSaved   = state.savedItems.some(s => s.id === item.id);
  const isLearned = state.learnedLessons.includes(item.id);
  return `
    <div class="lesson-card" data-id="${item.id}" data-type="html">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:15px;">
        <div>
          <span class="badge" style="background:#e34f26;">HTML TIP</span>
          <h3 style="margin-top:10px;">${item.title}</h3>
        </div>
        <button class="save-btn ${isSaved ? 'text-primary' : ''}" onclick="toggleSave('${item.id}', 'html')">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
            fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
          </svg>
        </button>
      </div>
      <p style="margin-bottom:15px;">${item.tip}</p>
      <div class="code-block">
        <button class="copy-btn" onclick="copyCode(this, \`${item.code.replace(/`/g, '\\`')}\`)">Copy</button>
        <pre><code>${escapeHtml(item.code)}</code></pre>
      </div>
      <button class="submit-btn"
        style="width:100%;background:${isLearned ? '#22c55e' : 'var(--primary-color)'}"
        onclick="toggleLearned('${item.id}')">
        ${isLearned ? '✓ Learned' : 'Mark as Learned'}
      </button>
    </div>
  `;
}

// ─── Card Listeners ───────────────────────────────────────────────────────────
function attachCardListeners() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      openDetail(card.getAttribute('data-id'), card.getAttribute('data-type'));
    });
  });
}

// ─── Article Detail Modal ─────────────────────────────────────────────────────
window.openDetail = (id, type) => {
  let item;
  if (type === 'news') {
    item = state.firestoreArticles.find(n => n.id === id) || newsData.find(n => n.id === id);
  } else {
    item = htmlLessons.find(h => h.id === id);
  }
  if (!item) return;

  const isSaved  = state.savedItems.some(s => s.id === item.id);
  const comments = state.firestoreComments[id] || [];

  modalBody.innerHTML = `
    <img src="${item.image}" alt="${item.title}" class="detail-img"
      onerror="this.style.display='none'">
    <div class="detail-meta">
      <span class="badge">${item.category}</span>
      ${item.date     ? `<span>${item.date}</span>`            : ''}
      ${item.readTime ? `<span>${item.readTime} read</span>`   : ''}
    </div>
    <h1 class="detail-title">${item.title}</h1>
    <div class="detail-body">
      ${item.content ? `<p>${item.content}</p>` : ''}
    </div>
    <div class="card-footer mt-4">
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <button class="submit-btn" onclick="toggleSave('${item.id}', '${type}')">
          ${isSaved ? 'Unsave' : 'Save Item'}
        </button>
        <button class="icon-btn"
          style="border:1px solid var(--border-color);border-radius:8px;width:auto;padding:0 15px;"
          onclick="shareItem('${item.title}')">
          Share
        </button>
        ${item._firestore && state.isAdmin ? `
          <button onclick="deleteArticle('${item.id}')"
            style="padding:10px 16px;background:#ef4444;color:#fff;border:none;
                   border-radius:8px;cursor:pointer;font-weight:600;">
            Delete
          </button>
        ` : ''}
      </div>
    </div>
    <section class="comments-section">
      <h3>Comments (${comments.length})</h3>
      ${state.currentUser ? `
        <div class="comment-form">
          <textarea class="comment-input" id="comment-text"
            placeholder="Add a comment..." rows="3"></textarea>
          <button class="submit-btn" onclick="addComment('${id}')">Post Comment</button>
        </div>
      ` : `
        <p style="color:var(--text-muted);margin-bottom:20px;">
          Sign in to leave a comment.
        </p>
      `}
      <div class="comment-list">
        ${comments.length > 0
          ? comments.map(c => `
              <div class="comment">
                <div class="comment-header">
                  <span>${c.userName || 'Anonymous'}</span>
                  <span>${c.date}</span>
                </div>
                <p>${c.text}</p>
              </div>
            `).join('')
          : '<p style="color:var(--text-muted);">No comments yet. Be the first!</p>'
        }
      </div>
    </section>
  `;
  modal.classList.add('active');
};

// ─── Save / Learned ───────────────────────────────────────────────────────────
window.toggleSave = (id, type) => {
  const allItems = [...state.firestoreArticles, ...newsData, ...htmlLessons];
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  const index = state.savedItems.findIndex(s => s.id === id);
  if (index > -1) state.savedItems.splice(index, 1);
  else state.savedItems.push(item);

  localStorage.setItem('savedItems', JSON.stringify(state.savedItems));

  if (state.currentRoute === '#saved') renderPage('#saved');
  else handleRoute();

  if (modal.classList.contains('active')) window.openDetail(id, type);
};

window.toggleLearned = (id) => {
  const index = state.learnedLessons.indexOf(id);
  if (index > -1) state.learnedLessons.splice(index, 1);
  else state.learnedLessons.push(id);
  localStorage.setItem('learnedLessons', JSON.stringify(state.learnedLessons));
  handleRoute();
};

// ─── Comments ─────────────────────────────────────────────────────────────────
window.addComment = async (articleId) => {
  if (!state.currentUser) { alert('Please sign in to comment.'); return; }
  const input = document.getElementById('comment-text');
  const text  = input.value.trim();
  if (!text) return;

  const btn = input.nextElementSibling;
  btn.textContent = 'Posting...';
  btn.disabled = true;

  try {
    await addDoc(collection(db, 'comments'), {
      articleId,
      text,
      userUid:  state.currentUser.uid,
      userName: state.currentUser.displayName || 'Anonymous',
      date:     new Date().toLocaleDateString()
    });
    input.value = '';
    window.openDetail(articleId, 'news');
  } catch (err) {
    alert('Failed to post comment: ' + err.message);
    btn.textContent = 'Post Comment';
    btn.disabled = false;
  }
};

// ─── Misc ─────────────────────────────────────────────────────────────────────
window.copyCode = (btn, code) => {
  navigator.clipboard.writeText(code).then(() => {
    const orig = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = orig, 2000);
  });
};

window.shareItem = (title) => {
  if (navigator.share) {
    navigator.share({ title: 'GoNow - ' + title, url: window.location.href });
  } else {
    navigator.clipboard.writeText(window.location.href);
    showToast('Link copied!');
  }
};

// ─── Search ───────────────────────────────────────────────────────────────────
function handleSearch(e) {
  const q = e.target.value.toLowerCase();
  if (!q) { searchResults.innerHTML = ''; return; }

  const allItems = [...state.firestoreArticles, ...newsData, ...htmlLessons];
  const results  = allItems.filter(item =>
    item.title.toLowerCase().includes(q) ||
    (item.excerpt && item.excerpt.toLowerCase().includes(q))
  );

  searchResults.innerHTML = results.map(item => `
    <div class="trending-item"
      style="padding:15px;border-bottom:1px solid var(--border-color);cursor:pointer;"
      onclick="searchOverlay.classList.remove('active');
               openDetail('${item.id}', '${item.category === 'HTML' ? 'html' : 'news'}')">
      <div class="trending-content">
        <span class="badge" style="font-size:0.6rem;padding:2px 6px;">${item.category}</span>
        <h4 style="font-size:1.1rem;">${item.title}</h4>
      </div>
    </div>
  `).join('');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ─── Start ────────────────────────────────────────────────────────────────────
init();
