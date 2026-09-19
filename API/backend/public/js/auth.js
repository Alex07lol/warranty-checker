/* WarrantyVault auth flows — loaded BEFORE app.js.
   Login/register/logout/email-verification plus the guest-mode gating
   (openLogin/requireAuth/applyGuestMode). Depends on api.js (token storage + api())
   and utils.js (toast); showView/enterApp are defined in app.js and called at runtime
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
  if (guest) {
    const greeting = document.getElementById('greeting-name');
    if (greeting) greeting.textContent = 'Guest';
  }

  // Hide login-only actions in guest mode
  const safeHide = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = guest ? 'none' : '';
  };
  safeHide('nav-camera');
  safeHide('read-all-btn');
  safeHide('detail-edit-row');
  safeHide('detail-scan-btn');
  safeHide('detail-doc-upload-row');
  safeHide('add-service-btn');
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth state & verification helpers
// ─────────────────────────────────────────────────────────────────────────────
let currentPendingEmail = '';
let resendTimerInterval = null;

function startResendCountdown(seconds = 60) {
  const countdownEl = document.getElementById('resend-countdown');
  const resendBtn = document.getElementById('resend-btn');
  if (!countdownEl || !resendBtn) return;

  if (resendTimerInterval) clearInterval(resendTimerInterval);

  let remaining = seconds;
  resendBtn.style.display = 'none';
  countdownEl.style.display = '';
  countdownEl.textContent = `Resend code in ${remaining}s`;

  resendTimerInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendTimerInterval);
      resendTimerInterval = null;
      countdownEl.style.display = 'none';
      resendBtn.style.display = '';
    } else {
      countdownEl.textContent = `Resend code in ${remaining}s`;
    }
  }, 1000);
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const tabRow = document.querySelector('.login-tab-row');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formVerify = document.getElementById('form-verify');
  const formForgot = document.getElementById('form-forgot');
  const formReset = document.getElementById('form-reset');

  if (tabLogin) tabLogin.classList.toggle('active', tab === 'login');
  if (tabRegister) tabRegister.classList.toggle('active', tab === 'register');

  const isSubView = tab === 'verify' || tab === 'forgot' || tab === 'reset';
  if (tabRow) tabRow.style.display = isSubView ? 'none' : 'flex';
  if (formLogin) formLogin.style.display = tab === 'login' ? '' : 'none';
  if (formRegister) formRegister.style.display = tab === 'register' ? '' : 'none';
  if (formVerify) formVerify.style.display = tab === 'verify' ? '' : 'none';
  if (formForgot) formForgot.style.display = tab === 'forgot' ? '' : 'none';
  if (formReset) formReset.style.display = tab === 'reset' ? '' : 'none';

  const loginErr = document.getElementById('login-err');
  const regErr = document.getElementById('reg-err');
  const verifyErr = document.getElementById('verify-err');
  const forgotErr = document.getElementById('forgot-err');
  const resetErr = document.getElementById('reset-err');
  if (loginErr) loginErr.textContent = '';
  if (regErr) regErr.textContent = '';
  if (verifyErr) verifyErr.textContent = '';
  if (forgotErr) forgotErr.textContent = '';
  if (resetErr) resetErr.textContent = '';

  if (tab === 'verify') {
    const codeInput = document.getElementById('verify-code');
    if (codeInput) {
      codeInput.value = '';
      setTimeout(() => codeInput.focus(), 50);
    }
  } else if (tab === 'forgot') {
    const forgotEmail = document.getElementById('forgot-email');
    const loginEmail = document.getElementById('login-email');
    if (forgotEmail) {
      if (loginEmail && loginEmail.value.trim()) {
        forgotEmail.value = loginEmail.value.trim();
      }
      setTimeout(() => forgotEmail.focus(), 50);
    }
  } else if (tab === 'reset') {
    const resetCode = document.getElementById('reset-code');
    if (resetCode) {
      resetCode.value = '';
      setTimeout(() => resetCode.focus(), 50);
    }
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
    setToken(data.token);
    setUser(data.user);
    await enterApp();
  } catch (e) {
    if (e.status === 403 && e.data?.requiresVerification) {
      currentPendingEmail = e.data.email || email;
      switchAuthTab('verify');
      const verifyDisplay = document.getElementById('verify-email-display');
      if (verifyDisplay) verifyDisplay.textContent = currentPendingEmail;
      startResendCountdown(60);
      toast('Please verify your email address to continue. A 6-digit code was sent to your inbox.', 'info');
      return;
    }
    err.textContent = e.message;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate-email popup
// ─────────────────────────────────────────────────────────────────────────────
// Registration must never mint a second account for an address that is already
// on file — and Gmail makes that easy to do by accident, because dots inside the
// local part and everything after a "+" are ignored: john.doe+receipts@gmail.com
// and johndoe@gmail.com are the SAME mailbox and therefore the same user. When
// the server rejects such a registration, say so in a popup instead of a
// one-line message the user can miss (and which invites a retry).
let duplicateEmailAddress = '';

function isGmailAddress(email) {
  return /@(gmail|googlemail)\.com$/i.test(String(email || '').trim());
}

// 409 is the API's duplicate-account status; the message check keeps the popup
// working against older servers that answered with a plain error payload.
function isDuplicateEmailError(e) {
  if (!e) return false;
  if (e.status === 409) return true;
  return /already (registered|exists|in use)/i.test(e.message || '');
}

function duplicateEmailHtml(email) {
  const gmailNote = isGmailAddress(email)
    ? ' Gmail ignores dots and anything after a “+” in an address, so a differently spelled Gmail address of yours is still the same account.'
    : '';
  return 'No duplicate account was created — <strong>' + escapeHtml(email) +
    '</strong> is already registered in the database.' + gmailNote;
}

function showDuplicateEmailDialog(email) {
  duplicateEmailAddress = String(email || '').trim();
  const overlay = document.getElementById('dup-email-overlay');
  if (!overlay) {
    // Legacy markup without the dialog — never leave the user without an answer.
    toast('This email already exists in the database: ' + duplicateEmailAddress, 'error');
    return;
  }
  const body = document.getElementById('dup-email-body');
  if (body) body.innerHTML = duplicateEmailHtml(duplicateEmailAddress);
  openDialog(overlay, { initialFocus: '#dup-signin-btn', onClose: closeDuplicateEmailDialog });
}

function closeDuplicateEmailDialog() {
  closeDialog(document.getElementById('dup-email-overlay'));
}

// "Sign in instead" — hand the rejected address to the sign-in tab so the user
// lands on the account that already owns it.
function duplicateEmailSignIn() {
  const email = duplicateEmailAddress;
  closeDuplicateEmailDialog();
  switchAuthTab('login');
  const loginEmail = document.getElementById('login-email');
  if (loginEmail) loginEmail.value = email;
  const loginPassword = document.getElementById('login-password');
  if (loginPassword) loginPassword.focus();
}

// "Use a different email" — clear the register form so the next attempt can't
// repeat the same address by accident.
function duplicateEmailUseOther() {
  closeDuplicateEmailDialog();
  const regEmail = document.getElementById('reg-email');
  if (regEmail) { regEmail.value = ''; regEmail.focus(); }
  const regPassword = document.getElementById('reg-password');
  if (regPassword) regPassword.value = '';
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

    if (data.requiresVerification) {
      currentPendingEmail = data.email || email;
      switchAuthTab('verify');
      const verifyDisplay = document.getElementById('verify-email-display');
      if (verifyDisplay) verifyDisplay.textContent = currentPendingEmail;
      startResendCountdown(60);
      toast('Verification code sent! Please check your email inbox.', 'success');
      return;
    }

    // Direct login fallback if verification wasn't required
    setToken(data.token);
    setUser(data.user);
    await enterApp();
  } catch (e) {
    if (isDuplicateEmailError(e)) {
      showDuplicateEmailDialog(email);
      return;
    }
    err.textContent = e.message;
  }
}

async function doVerifyEmail() {
  const codeInput = document.getElementById('verify-code');
  const code = (codeInput ? codeInput.value : '').trim();
  const err = document.getElementById('verify-err');
  if (err) err.textContent = '';

  if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
    if (err) err.textContent = 'Please enter the 6-digit numerical code sent to your email.';
    return;
  }

  const submitBtn = document.getElementById('verify-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying…';
  }

  try {
    const data = await api('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email: currentPendingEmail, code })
    });

    setToken(data.token);
    setUser(data.user);
    toast('Email verified successfully! Welcome to WarrantyVault.', 'success');
    await enterApp();
  } catch (e) {
    if (err) err.textContent = e.message;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Verify Email & Continue';
    }
  }
}

async function doResendVerification() {
  const err = document.getElementById('verify-err');
  if (err) err.textContent = '';
  if (!currentPendingEmail) {
    if (err) err.textContent = 'No pending email to verify. Please sign in or register.';
    return;
  }

  try {
    await api('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: currentPendingEmail })
    });
    startResendCountdown(60);
    toast('A fresh 6-digit verification code has been dispatched to your email.', 'info');
  } catch (e) {
    if (err) err.textContent = e.message;
  }
}

function logout() {
  if (getToken()) api('/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  toast('Signed out — now browsing as guest', 'success');
  enterApp();
}

// ─────────────────────────────────────────────────────────────────────────────
// Password Reset Flows
// ─────────────────────────────────────────────────────────────────────────────
let currentResetEmail = '';

async function doRequestPasswordReset() {
  const emailInput = document.getElementById('forgot-email');
  const email = (emailInput ? emailInput.value : '').trim();
  const err = document.getElementById('forgot-err');
  if (err) err.textContent = '';

  if (!email) {
    if (err) err.textContent = 'Please enter your email address.';
    return;
  }

  const btn = document.getElementById('forgot-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }

  try {
    const res = await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    currentResetEmail = email;
    switchAuthTab('reset');
    const display = document.getElementById('reset-email-display');
    if (display) display.textContent = currentResetEmail;
    toast(res.message || 'Password reset code sent! Check your email inbox.', 'info');
  } catch (e) {
    if (err) err.textContent = e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send Reset Code';
    }
  }
}

async function doResetPassword() {
  const codeInput = document.getElementById('reset-code');
  const newPassInput = document.getElementById('reset-new-password');
  const confirmPassInput = document.getElementById('reset-confirm-password');
  const err = document.getElementById('reset-err');
  if (err) err.textContent = '';

  const code = (codeInput ? codeInput.value : '').trim();
  const newPassword = newPassInput ? newPassInput.value : '';
  const confirmNewPassword = confirmPassInput ? confirmPassInput.value : '';

  if (!code || code.length !== 6) {
    if (err) err.textContent = 'Please enter the 6-digit numerical code sent to your email.';
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    if (err) err.textContent = 'New password must be at least 8 characters.';
    return;
  }
  if (newPassword !== confirmNewPassword) {
    if (err) err.textContent = 'Passwords do not match.';
    return;
  }

  const btn = document.getElementById('reset-submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Resetting…';
  }

  try {
    await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({
        email: currentResetEmail,
        code,
        newPassword,
        confirmNewPassword
      })
    });
    toast('Password reset successfully! Please sign in with your new password.', 'success');
    switchAuthTab('login');
    const loginEmail = document.getElementById('login-email');
    if (loginEmail && currentResetEmail) {
      loginEmail.value = currentResetEmail;
    }
    const loginPassword = document.getElementById('login-password');
    if (loginPassword) {
      loginPassword.value = '';
      setTimeout(() => loginPassword.focus(), 50);
    }
  } catch (e) {
    if (err) err.textContent = e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Set New Password';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Deletion Flows (with email verification)
// ─────────────────────────────────────────────────────────────────────────────
function openDeleteAccountModal() {
  const overlay = document.getElementById('delete-account-overlay');
  const step1 = document.getElementById('delete-account-step-1');
  const step2 = document.getElementById('delete-account-step-2');
  const err = document.getElementById('delete-account-err');
  const codeInput = document.getElementById('delete-account-code');

  if (err) err.textContent = '';
  if (codeInput) codeInput.value = '';
  if (step1) step1.style.display = '';
  if (step2) step2.style.display = 'none';
  if (overlay) overlay.style.display = 'flex';
}

function closeDeleteAccountModal() {
  const overlay = document.getElementById('delete-account-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function doRequestAccountDeletion() {
  const btn = document.getElementById('send-delete-code-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }

  try {
    const res = await api('/auth/request-delete-account', { method: 'POST' });
    toast(res.message || 'Verification code sent to your email.', 'info');
    const step1 = document.getElementById('delete-account-step-1');
    const step2 = document.getElementById('delete-account-step-2');
    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = '';
    const codeInput = document.getElementById('delete-account-code');
    if (codeInput) setTimeout(() => codeInput.focus(), 50);
  } catch (e) {
    toast(e.message || 'Failed to send deletion code.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Send Deletion Code';
    }
  }
}

async function doConfirmAccountDeletion() {
  const codeInput = document.getElementById('delete-account-code');
  const err = document.getElementById('delete-account-err');
  const code = (codeInput ? codeInput.value : '').trim();
  if (err) err.textContent = '';

  if (!code || code.length !== 6) {
    if (err) err.textContent = 'Please enter the 6-digit numerical code sent to your email.';
    return;
  }

  const btn = document.getElementById('confirm-delete-account-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting…';
  }

  try {
    const res = await api('/auth/confirm-delete-account', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
    closeDeleteAccountModal();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    toast(res.message || 'Account deleted successfully.', 'success');
    enterApp();
    switchAuthTab('login');
    showView('login');
  } catch (e) {
    if (err) err.textContent = e.message;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Permanently Delete';
    }
  }
}
