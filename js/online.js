// Swish Basket – gemensam topplista via Supabase (se supabase/scoreboard.sql)
const Online = (() => {
  const url = (CONFIG.supabaseUrl || '').replace(/\/+$/, '');
  const key = CONFIG.supabaseKey || '';
  const enabled = /^https:\/\/.+/.test(url) && key.length > 20;

  // service_role/secret-nycklar får aldrig ligga i webbläsaren
  if (/^sb_secret_/.test(key) || /service_role/.test(atobSafe(key.split('.')[1] || ''))) {
    console.error('Swish Basket: config.js innehåller en hemlig nyckel – byt till den publika (publishable/anon)!');
  }
  function atobSafe(s) { try { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); } catch { return ''; } }

  function headers() {
    const h = { apikey: key, 'Content-Type': 'application/json' };
    if (!key.startsWith('sb_')) h.Authorization = 'Bearer ' + key; // äldre "anon"-nyckel (JWT)
    return h;
  }

  async function call(path, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url + path, { ...opts, headers: headers(), signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error((body && (body.message || body.hint)) || 'HTTP ' + res.status);
      return body;
    } finally { clearTimeout(timer); }
  }

  // topp 20 för alla spelare
  const top = (limit = 20) =>
    call(`/rest/v1/scores?select=id,name,score,level,opp,coop,created_at&order=score.desc,level.desc,id.asc&limit=${limit}`);

  // sparar ett resultat och svarar med { id, rank }
  async function submit(e) {
    const rows = await call('/rest/v1/rpc/submit_score', {
      method: 'POST',
      body: JSON.stringify({ p_name: e.name, p_score: e.score, p_level: e.level, p_makes: e.makes, p_opp: e.opp, p_coop: e.coop }),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  // bara tecken som databasen godkänner, och inga fula ord
  const BAD = ['fitta', 'kuk', 'hora', 'jävla', 'javla', 'neger', 'nigger', 'fuck', 'shit', 'bitch', 'cunt', 'dick', 'hitler', 'nazi', 'cp', 'porr', 'porn'];
  function cleanName(raw) {
    const name = (raw || '').replace(/[^A-Za-z0-9ÅÄÖåäöÉéÜüØøÆæ _.!-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
    const flat = name.toLowerCase().replace(/[^a-zåäö]/g, '');
    if (BAD.some(w => w.length > 2 ? flat.includes(w) : flat === w)) return null;
    return name || 'Anonym';
  }

  return { enabled, top, submit, cleanName };
})();
