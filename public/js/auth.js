/**
 * auth.js — Client Authentication & Fetch Wrapper
 */

const TOKEN_KEY = 'ls_auth_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

export async function authFetch(url, options = {}) {
    const token = getToken();
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 && !url.includes('/api/auth/')) {
        clearToken();
        redirectToLogin();
    }

    return response;
}

export async function checkAuth() {
    try {
        const token = getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch('/api/auth/check', { headers });
        const data = await res.json();

        // If auth is disabled on the server, allow access
        if (data.authEnabled === false) {
            return true;
        }

        if (!data.valid) {
            clearToken();
            redirectToLogin();
            return false;
        }

        return true;
    } catch (err) {
        console.error('Auth verification failed:', err);
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
