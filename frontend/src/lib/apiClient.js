const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function joinUrl(base, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base.replace(/\/$/, '')}${normalizedPath}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function request(path, options = {}) {
  const response = await fetch(joinUrl(API_BASE, path), options);
  const payload = await parseResponse(response);

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

export function apiUrl(path) {
  return joinUrl(API_BASE, path);
}

export function apiGet(path) {
  return request(path);
}

export function apiPostJson(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function apiPostForm(path, body) {
  return request(path, {
    method: 'POST',
    body,
  });
}
