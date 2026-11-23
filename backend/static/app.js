// ConnectHub - frontend logic (plain JavaScript)

function getToken() { return localStorage.getItem('token'); }
function getUserId() { return localStorage.getItem('userid'); }
function getUsername() { return localStorage.getItem('username'); }

// Escape text so users cannot inject HTML into the page
function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Talk to the Django API
async function api(path, method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
  const options = { method: method || 'GET', headers: headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch('/api/' + path, options);
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && getToken()) {
    // token expired or invalid
    logout(true);
  }
  return { ok: res.ok, status: res.status, data: data };
}

function setMsg(id, text, good) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg' + (good ? ' ok' : '');
}

// ---------------- Navigation ----------------

function renderNav() {
  const nav = document.getElementById('nav-links');
  if (!nav) return;
  if (getToken()) {
    nav.innerHTML =
      '<a href="/">Home</a>' +
      '<a href="/profile/' + getUserId() + '/">My Profile</a>' +
      '<span>Hi, ' + esc(getUsername()) + '</span>' +
      '<button onclick="logout()">Logout</button>';
  } else {
    nav.innerHTML = '<a href="/">Home</a>';
  }
}

// ---------------- Accounts ----------------

async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const r = await api('register/', 'POST', { username: username, email: email, password: password });
  if (r.ok) {
    setMsg('reg-msg', 'Registered! Now login on the right.', true);
  } else {
    setMsg('reg-msg', r.data.error || 'Could not register');
  }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const r = await api('login/', 'POST', { username: username, password: password });
  if (r.ok) {
    localStorage.setItem('token', r.data.token);
    localStorage.setItem('username', r.data.username);
    localStorage.setItem('userid', r.data.user_id);
    location.reload();
  } else {
    setMsg('login-msg', r.data.error || 'Could not login');
  }
}

function logout(silent) {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  localStorage.removeItem('userid');
  if (!silent) location.href = '/';
}

// ---------------- Posts ----------------

function postHtml(p) {
  let html = '<div class="card" id="post-' + p.id + '">';
  html += '<div class="post-head"><div>' +
    '<a href="/profile/' + p.author.id + '/">' + esc(p.author.username) + '</a>' +
    '<small>' + esc(p.created_at) + '</small></div></div>';
  html += '<div class="post-body">' + esc(p.content) + '</div>';
  html += '<div class="post-actions">';
  html += '<button id="like-btn-' + p.id + '" class="' + (p.liked ? 'liked' : '') + '" onclick="toggleLike(' + p.id + ')">' +
    (p.liked ? '&#10084;' : '&#9825;') + ' ' + p.likes + '</button>';
  html += '<button id="comment-btn-' + p.id + '" onclick="toggleComments(' + p.id + ')">&#128172; ' + p.comments + '</button>';
  if (p.mine) {
    html += '<button class="danger" onclick="deletePost(' + p.id + ')">Delete</button>';
  }
  html += '</div>';
  html += '<div class="comments hidden" id="comments-' + p.id + '"></div>';
  html += '</div>';
  return html;
}

async function toggleLike(id) {
  if (!getToken()) { alert('Please login to like posts'); return; }
  const r = await api('posts/' + id + '/like/', 'POST', {});
  if (r.ok) {
    const btn = document.getElementById('like-btn-' + id);
    btn.className = r.data.liked ? 'liked' : '';
    btn.innerHTML = (r.data.liked ? '&#10084;' : '&#9825;') + ' ' + r.data.likes;
  }
}

async function toggleComments(id) {
  const box = document.getElementById('comments-' + id);
  if (box.classList.contains('hidden')) {
    box.classList.remove('hidden');
    await loadComments(id);
  } else {
    box.classList.add('hidden');
  }
}

async function loadComments(id) {
  const box = document.getElementById('comments-' + id);
  const r = await api('posts/' + id + '/comments/');
  let html = '';
  if (r.ok) {
    r.data.forEach(function (c) {
      html += '<div class="comment"><a href="/profile/' + c.author.id + '/">' + esc(c.author.username) + '</a>: ' +
        esc(c.content) + '<small>' + esc(c.created_at) + '</small></div>';
    });
    if (r.data.length === 0) html += '<p class="empty">No comments yet.</p>';
  }
  if (getToken()) {
    html += '<div class="comment-form"><input id="comment-input-' + id + '" maxlength="300" placeholder="Write a comment...">' +
      '<button onclick="addComment(' + id + ')">Send</button></div>';
  } else {
    html += '<p class="msg">Login to comment.</p>';
  }
  box.innerHTML = html;
}

async function addComment(id) {
  const input = document.getElementById('comment-input-' + id);
  const content = input.value.trim();
  if (!content) return;
  const r = await api('posts/' + id + '/comments/', 'POST', { content: content });
  if (r.ok) {
    await loadComments(id);
    const count = document.querySelectorAll('#comments-' + id + ' .comment').length;
    document.getElementById('comment-btn-' + id).innerHTML = '&#128172; ' + count;
  } else {
    alert(r.data.error || 'Could not comment');
  }
}

async function deletePost(id) {
  if (!confirm('Delete this post?')) return;
  const r = await api('posts/' + id + '/delete/', 'POST', {});
  if (r.ok) {
    const el = document.getElementById('post-' + id);
    if (el) el.remove();
  } else {
    alert(r.data.error || 'Could not delete');
  }
}

async function showPosts(query) {
  const feed = document.getElementById('feed');
  const r = await api('posts/' + query);
  if (!r.ok) {
    feed.innerHTML = '<p class="empty">' + esc(r.data.error || 'Could not load posts') + '</p>';
    return;
  }
  if (r.data.length === 0) {
    feed.innerHTML = '<p class="empty">No posts yet.</p>';
    return;
  }
  feed.innerHTML = r.data.map(postHtml).join('');
}

async function loadFeed(scope) {
  document.getElementById('tab-all').className = 'tab' + (scope === 'all' ? ' active' : '');
  document.getElementById('tab-following').className = 'tab' + (scope === 'following' ? ' active' : '');
  if (scope === 'following') {
    if (!getToken()) {
      document.getElementById('feed').innerHTML = '<p class="empty">Login to see posts from people you follow.</p>';
      return;
    }
    await showPosts('?scope=following');
  } else {
    await showPosts('');
  }
}

async function createPost() {
  const box = document.getElementById('post-content');
  const content = box.value.trim();
  const r = await api('posts/', 'POST', { content: content });
  if (r.ok) {
    box.value = '';
    setMsg('post-msg', '');
    loadFeed('all');
  } else {
    setMsg('post-msg', r.data.error || 'Could not post');
  }
}

// ---------------- People and follow ----------------

async function loadPeople() {
  const r = await api('users/');
  const box = document.getElementById('people');
  if (!r.ok) return;
  let html = '';
  r.data.forEach(function (u) {
    html += '<div class="person"><a href="/profile/' + u.id + '/">' + esc(u.username) + '</a>';
    if (getToken() && !u.is_me) {
      html += '<button class="secondary" onclick="followUser(' + u.id + ')">' + (u.is_following ? 'Unfollow' : 'Follow') + '</button>';
    }
    html += '</div>';
  });
  box.innerHTML = html || '<p class="empty">No users yet.</p>';
}

async function followUser(id) {
  const r = await api('users/' + id + '/follow/', 'POST', {});
  if (r.ok) {
    loadPeople();
  } else {
    alert(r.data.error || 'Could not follow');
  }
}

// ---------------- Pages ----------------

function initHome() {
  renderNav();
  const loggedIn = !!getToken();
  document.getElementById('auth-section').classList.toggle('hidden', loggedIn);
  document.getElementById('new-post').classList.toggle('hidden', !loggedIn);
  loadFeed('all');
  loadPeople();
}

async function initProfile() {
  renderNav();
  const box = document.getElementById('profile-box');
  const id = box.dataset.userId;
  const r = await api('users/' + id + '/');
  if (!r.ok) {
    box.innerHTML = '<p class="empty">User not found.</p>';
    return;
  }
  const u = r.data;
  let html = '<div class="profile-name">' + esc(u.username) + '</div>';
  html += '<div class="profile-bio" id="bio-text">' + (u.bio ? esc(u.bio) : 'No bio yet.') + '</div>';
  html += '<div class="stats"><span><b id="followers-count">' + u.followers + '</b> followers</span>' +
    '<span><b>' + u.following + '</b> following</span><span><b>' + u.posts + '</b> posts</span></div>';
  if (getToken() && !u.is_me) {
    html += '<button id="follow-btn" onclick="profileFollow(' + u.id + ')">' + (u.is_following ? 'Unfollow' : 'Follow') + '</button>';
  }
  if (u.is_me) {
    html += '<textarea id="bio-input" maxlength="200" placeholder="Write your bio...">' + esc(u.bio) + '</textarea>' +
      '<button onclick="saveBio()">Save bio</button><p class="msg" id="bio-msg"></p>';
  }
  box.innerHTML = html;
  showPosts('?user=' + id);
}

async function profileFollow(id) {
  const r = await api('users/' + id + '/follow/', 'POST', {});
  if (r.ok) {
    document.getElementById('follow-btn').textContent = r.data.following ? 'Unfollow' : 'Follow';
    document.getElementById('followers-count').textContent = r.data.followers;
  } else {
    alert(r.data.error || 'Could not follow');
  }
}

async function saveBio() {
  const bio = document.getElementById('bio-input').value;
  const r = await api('profile/', 'POST', { bio: bio });
  if (r.ok) {
    document.getElementById('bio-text').textContent = r.data.bio || 'No bio yet.';
    setMsg('bio-msg', 'Saved!', true);
  } else {
    setMsg('bio-msg', r.data.error || 'Could not save');
  }
}
