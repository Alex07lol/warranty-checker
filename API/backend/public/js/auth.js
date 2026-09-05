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
  switchAuthTab('login');
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
// Auth & Verification
// ─────────────────────────────────────────────────────────────────────────────
let pendingAuth = null; // { email, type: 'email' | 'login' }
let resendTimer = null;

function switchAuthTab(tab) {
  pendingAuth = null;
  const tabRow = document.querySelector('.login-tab-row');
  if (tabRow) tabRow.style.display = '';
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('form-register').style.display = tab === 'register' ? '' : 'none';
  const verifyForm = document.getElementById('form-verify');
  if (verifyForm) verifyForm.style.display = 'none';
  document.getElementById('login-err').textContent = '';
  document.getElementById('reg-err').textContent = '';
  const verifyErr = document.getElementById('verify-err');
  if (verifyErr) verifyErr.textContent = '';
  const verifyMsg = document.getElementById('verify-msg');
  if (verifyMsg) verifyMsg.textContent = '';
}

function showVerificationView(info) {
  pendingAuth = {
    email: info.email,
    type: info.verificationType || (info.requiresEmailVerification ? 'email' : 'login')
  };

  const tabRow = document.querySelector('.login-tab-row');
  if (tabRow) tabRow.style.display = 'none';
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-register').style.display = 'none';
  const verifyForm = document.getElementById('form-verify');
  if (verifyForm) verifyForm.style.display = '';

  const badge = document.getElementById('verify-badge');
  const instruction = document.getElementById('verify-instruction');
  const codeInput = document.getElementById('verify-code');
  const verifyBtn = document.getElementById('verify-btn');
  const verifyErr = document.getElementById('verify-err');
  const verifyMsg = document.getElementById('verify-msg');

  if (verifyErr) verifyErr.textContent = '';
  if (verifyMsg) verifyMsg.textContent = '';
  if (codeInput) {
    codeInput.value = info.verificationCode || '';
  }

  if (pendingAuth.type === 'email') {
    if (badge) {
      badge.textContent = 'Email Verification';
      badge.style.color = 'var(--primary, #2563eb)';
      badge.style.background = 'rgba(37,99,235,0.12)';
    }
    if (instruction) {
      instruction.innerHTML = 'Enter the 6-digit code sent to <strong>' + escapeHtml(pendingAuth.email) + '</strong> to verify your account.';
    }
    if (verifyBtn) verifyBtn.textContent = 'Verify & Continue';
  } else {
    if (badge) {
      badge.textContent = 'Sign-in Verification';
      badge.style.color = '#d97706';
      badge.style.background = 'rgba(217,119,6,0.12)';
    }
    if (instruction) {
      instruction.innerHTML = 'Enter the 6-digit code sent to <strong>' + escapeHtml(pendingAuth.email) + '</strong> to complete sign in.';
    }
    if (verifyBtn) verifyBtn.textContent = 'Verify & Sign In';
  }

  if (codeInput) setTimeout(() => codeInput.focus(), 50);
}

function cancelVerification() {
  pendingAuth = null;
  switchAuthTab('login');
}

async function doVerify() {
  if (!pendingAuth || !pendingAuth.email) {
    cancelVerification();
    return;
  }

  const codeInput = document.getElementById('verify-code');
  const code = (codeInput ? codeInput.value : '').trim();
  const err = document.getElementById('verify-err');
  if (err) err.textContent = '';

  if (!code || code.length !== 6) {
    if (err) err.textContent = 'Please enter a 6-digit verification code.';
    return;
  }

  try {
    const endpoint = pendingAuth.type === 'email' ? '/auth/verify-email' : '/auth/verify-login';
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ email: pendingAuth.email, code })
    });

    setToken(data.token);
    setUser(data.user);
    toast(pendingAuth.type === 'email' ? 'Email verified successfully!' : 'Signed in successfully!', 'success');
    pendingAuth = null;
    await enterApp();
  } catch (e) {
    if (err) err.textContent = e.message;
  }
}

async function resendCode() {
  if (!pendingAuth || !pendingAuth.email) return;

  const resendBtn = document.getElementById('resend-code-btn');
  const msg = document.getElementById('verify-msg');
  const err = document.getElementById('verify-err');
  if (err) err.textContent = '';
  if (msg) msg.textContent = '';

  try {
    if (resendBtn) resendBtn.disabled = true;
    const data = await api('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: pendingAuth.email, type: pendingAuth.type })
    });

    if (data.verificationCode) {
      const codeInput = document.getElementById('verify-code');
      if (codeInput) codeInput.value = data.verificationCode;
    }

    if (msg) msg.textContent = data.message || 'A new verification code has been sent!';
    toast('New code sent to ' + pendingAuth.email, 'info');

    let seconds = 30;
    if (resendBtn) resendBtn.textContent = 'Resend in ' + seconds + 's';
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      seconds--;
      if (!resendBtn) { clearInterval(resendTimer); return; }
      if (seconds <= 0) {
        clearInterval(resendTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend Code';
      } else {
        resendBtn.textContent = 'Resend in ' + seconds + 's';
      }
    }, 1000);
  } catch (e) {
    if (resendBtn) {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend Code';
    }
    if (err) err.textContent = e.message;
  }
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

    if (data.requiresVerification) {
      showVerificationView(data);
      if (data.message) toast(data.message, 'info');
      return;
    }

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
  if (password.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
  try {
    const data = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, confirmPassword: password })
    });

    if (data.requiresVerification || data.requiresEmailVerification) {
      showVerificationView({ ...data, email: data.email || email, verificationType: 'email' });
      if (data.message) toast(data.message, 'info');
      return;
    }

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
