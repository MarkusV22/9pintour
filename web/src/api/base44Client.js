// Ersatz für das Base44-SDK: gleiche Aufrufe (base44.entities.X.list/filter/get …, base44.auth.me …),
// aber gegen die eigene API (/api/…). Sitzung läuft über ein HttpOnly-Cookie.

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = "GET", body, form } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.", 0);
  }
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(data?.error || `Fehler ${res.status}`, res.status, data);
  return data;
}

const enc = encodeURIComponent;

function entity(name) {
  const base = `/entities/${name}`;
  const qs = (filter, sort, limit) => {
    const p = [];
    if (filter && Object.keys(filter).length) p.push(`q=${enc(JSON.stringify(filter))}`);
    if (sort) p.push(`sort=${enc(sort)}`);
    if (limit) p.push(`limit=${limit}`);
    return p.length ? `?${p.join("&")}` : "";
  };
  return {
    list: (sort, limit) => api(`${base}${qs(null, sort, limit)}`),
    filter: (filter = {}, sort, limit) => api(`${base}${qs(filter, sort, limit)}`),
    get: (id) => api(`${base}/${enc(id)}`),
    create: (data) => api(base, { method: "POST", body: data }),
    bulkCreate: (rows) => api(`${base}/bulk`, { method: "POST", body: rows }),
    update: (id, data) => api(`${base}/${enc(id)}`, { method: "PATCH", body: data }),
    delete: (id) => api(`${base}/${enc(id)}`, { method: "DELETE" }),
    deleteMany: (filter) => api(`${base}/delete-many`, { method: "POST", body: filter ?? {} }),
  };
}

const entities = new Proxy({}, { get: (cache, name) => (cache[name] ??= entity(String(name))) });

const loginUrl = (from) => {
  let path = "/";
  try { const u = new URL(from || window.location.href); path = u.pathname + u.search; } catch { /* Standard */ }
  return `/login?redirect=${enc(path)}`;
};

export const base44 = {
  entities,
  auth: {
    me: () => api("/me").then((u) => { if (!u) throw new ApiError("Nicht angemeldet", 401); return u; }),
    isAuthenticated: () => api("/me").then((u) => !!u).catch(() => false),
    updateMe: (data) => api("/me", { method: "PATCH", body: data }),
    logout: async (redirectTo) => {
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      window.location.href = redirectTo ? "/" : window.location.href;
    },
    redirectToLogin: (from) => { window.location.href = loginUrl(from); },
  },
  // Serverfunktionen: gleiche Namen wie bisher, Antwort wie beim SDK unter .data
  functions: {
    invoke: async (name, payload = {}) => ({ data: await api(`/functions/${enc(name)}`, { method: "POST", body: payload }) }),
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        const form = new FormData();
        form.append("file", file);
        return api("/upload", { method: "POST", form });
      },
      SendEmail: (mail) => api("/send-email", { method: "POST", body: mail }),
    },
  },
  users: {
    inviteUser: async () => ({ ok: true }), // Konten entstehen bei der ersten Anmeldung – keine Einladung nötig
  },
};

export default base44;
