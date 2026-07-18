/**
 * auth.js — Client-side auth helper
 * Stores the bearer token in localStorage and injects it into all fetch calls.
 */

const AUTH_TOKEN_KEY = 'ls_auth_token';

export function getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Wrapper around fetch that injects Authorization header when a token exists.
 */
export async function authFetch(url, options = {}) {
    const token = getToken();
    if (token) {
        options.headers = {
            ...(options.headers || {}),
            'Authorization': `Bearer ${token}`
        };
    }
    return fetch(url, options);
}

/**
 * Check if current token is valid. Redirects to login.html if not.
 */
export async function requireLogin() {
    const token = getToken();

    try {
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch('/api/auth/check', { headers });
        const data = await res.json();
        
        if (data.authEnabled === false) {
            return true;
        }
        
        if (!data.valid) {
            clearToken();
            redirectToLogin();
            return false;
        }
        return true;
    } catch {
        redirectToLogin();
        return false;
    }
}

export async function logout() {
    const token = getToken();
    if (token) {
        await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(() => {});
    }
    clearToken();
    redirectToLogin();
}

function redirectToLogin() {
    if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/login.html';
    }
}
