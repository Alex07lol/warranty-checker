/* WarrantyVault API layer — loaded BEFORE app.js.
   Centralizes token storage and the authenticated fetch wrapper so every
   request goes through one place (single place to add headers/handle 401s). */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// API layer
// ─────────────────────────────────────────────────────────────────────────────
const API = '/api/v1';
const TOKEN_KEY = 'wv_token';
const USER_KEY = 'wv_user';

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }

async function api(path, opts = {}) {
  const headers = { ...opts.headers };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    if (typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  }

  let res;
  try {
    res = await fetch(API + path, { ...opts, headers });
  } catch (e) {
    throw new Error('Unable to connect to WarrantyVault. Check your connection and try again.');
  }

  let json = {};
  try { json = await res.json(); } catch { /* empty body */ }

  if (res.status === 401) {
    const hadToken = !!getToken();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (hadToken) {
      openLogin('Your session has expired. Please sign in again.');
      throw new Error(json.message || 'Session expired — please log in again');
    }
    // No token (guest): caller should fall back to demo/local data.
    throw new Error(json.message || 'Authentication required — please sign in');
  }
  if (!res.ok || json.success === false) {
    const err = (json.errors && json.errors[0] && (json.errors[0].message || json.errors[0]))
      || json.message || 'Request failed (' + res.status + ')';
    throw new Error(err);
  }
  return json.data;
}
