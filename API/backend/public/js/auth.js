/* WarrantyVault auth flows — loaded BEFORE app.js.
   Login/register/logout plus the guest-mode gating (openLogin/requireAuth/
   applyGuestMode). Depends on api.js (token storage + api()) and utils.js
   (toast); showView/enterApp are defined in app.js and called at runtime
   only, so load order stays: utils -> api -> auth -> app. */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Guest mode: browse without an account, read-only
// ─────────────────────────────────────────────────────────────────────────────
function isGuest() { return !getToken(); }

function openLogin(promptMsg) {
  const el = document.getElementById('login-prompt-msg');
  if (promptMsg) { el.textContent = promptMsg; el.style.display = ''; }
  else { el.textContent = ''; el.style.display = 'none'; }
  showView('login');
}

// Gate write operations behind authentication. Returns true when allowed.
function requireAuth(actionLabel) {
  if (!isGuest()) return true;
  openLogin('Sign in to ' + (actionLabel || 'continue') + ' — guest browsing is read-only.');
  return false;
}

// Flip the UI between guest (read-only) and signed-in states.
function applyGuestMode() {
  const guest = isGuest();
  document.body.classList.toggle('guest-mode', guest);

  const badge = document.getElementById('guest-badge');
  if (badge) badge.style.display = guest ? '' : 'none';

  const logoutBtn = document.getElementById('logout-btn');
  if (guest) {
    logoutBtn.textContent = 'Sign In';
    logoutBtn.title = 'Sign in to save your data';
  } else {
    logoutBtn.textContent = '⎋';
    logoutBtn.title = 'Log out';
  }

  // Greeting reflects guest state until the dashboard loads
  if (guest) document.getElementById('greeting-name').textContent = 'Guest';

  // Hide login-only actions in guest mode
  document.getElementById('nav-camera').style.display = guest ? 'none' : '';
  document.getElementById('read-all-btn').style.display = guest ? 'none' : '';
  document.getElementById('detail-edit-row').style.display = guest ? 'none' : '';
  document.getElementById('detail-scan-btn').style.display = guest ? 'none' : '';
  document.getElementById('detail-doc-upload-row').style.display = guest ? 'none' : '';
  document.getElementById('add-service-btn').style.display = guest ? 'none' : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent = '';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-err');
  err.textContent = '';
  if (!email || !password) { err.textContent = 'Please fill in all fields.'; return; }
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setToken(data.token);
    setUser(data.user);
    await enterApp();
  } catch (e) {
    err.textContent = e.message;
  }
}

async function doRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const err = document.getElementById('reg-err');
  err.textContent = '';
  if (!name || !email || !password) { err.textContent = 'Please fill in all fields.'; return; }
  if (password.length < 6) { err.textContent = 'Password must be at least 6 characters.'; return; }
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, confirmPassword: password })
    });
    setToken(data.token);
    setUser(data.user);
    await enterApp();
  } catch (e) {
    err.textContent = e.message;
  }
}

function logout() {
  if (getToken()) api('/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  toast('Signed out — now browsing as guest', 'success');
  enterApp();
}
