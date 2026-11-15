// Money Flow - Cloudflare Pages Functions + D1 Full-Stack API
// Strict Per-Account Data Isolation (owner_id), Budgets, Premium 65k/yr, PC Login & View-Only Share Links

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '', password_hash TEXT DEFAULT '', avatar_url TEXT DEFAULT '',
      address TEXT DEFAULT '', role TEXT DEFAULT 'Client', plan TEXT DEFAULT 'free',
      premium_until TEXT DEFAULT '', pc_pair_code TEXT DEFAULT '', status TEXT DEFAULT 'active',
      last_active TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'bank', account_number TEXT DEFAULT '', account_holder TEXT DEFAULT '',
      initial_balance INTEGER DEFAULT 0, color TEXT DEFAULT 'indigo', icon TEXT DEFAULT 'fa-building-columns',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      type TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'fa-tag', color TEXT NOT NULL DEFAULT 'indigo',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', month TEXT NOT NULL,
      category_id TEXT DEFAULT '', limit_amount INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', type TEXT NOT NULL,
      amount INTEGER NOT NULL, category_id TEXT, wallet_id TEXT NOT NULL,
      to_wallet_id TEXT, date TEXT NOT NULL, note TEXT DEFAULT '',
      ref_source TEXT DEFAULT '', ref_id TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_groups (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
      category TEXT DEFAULT 'Umum', rab_target INTEGER DEFAULT 0, dp_amount INTEGER DEFAULT 0,
      bank_id TEXT DEFAULT '', invite_code TEXT UNIQUE NOT NULL, split_method TEXT DEFAULT 'equal',
      status TEXT DEFAULT 'pengajuan_rab', note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_rab_items (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', group_id TEXT NOT NULL,
      item_name TEXT NOT NULL, qty INTEGER DEFAULT 1, unit_price INTEGER NOT NULL,
      subtotal INTEGER NOT NULL, status TEXT DEFAULT 'diajukan', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_members (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', group_id TEXT NOT NULL,
      name TEXT NOT NULL, contact TEXT DEFAULT '', share_value REAL DEFAULT 0,
      is_settled INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_installments (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', group_id TEXT NOT NULL,
      member_id TEXT NOT NULL, payment_type TEXT DEFAULT 'cicilan', amount INTEGER NOT NULL,
      bank_id TEXT NOT NULL, date TEXT NOT NULL, note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_expenses (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', group_id TEXT NOT NULL,
      title TEXT NOT NULL, amount INTEGER NOT NULL, paid_by_member_id TEXT DEFAULT '',
      bank_id TEXT DEFAULT '', date TEXT NOT NULL, note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', trade_type TEXT NOT NULL,
      item_name TEXT NOT NULL, qty INTEGER DEFAULT 1, unit_price INTEGER NOT NULL,
      cost_price INTEGER DEFAULT 0, total_amount INTEGER NOT NULL, counterparty TEXT DEFAULT '',
      wallet_id TEXT NOT NULL, payment_status TEXT DEFAULT 'paid', date TEXT NOT NULL,
      note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      category TEXT NOT NULL, purchase_value INTEGER DEFAULT 0, current_value INTEGER DEFAULT 0,
      bank_id TEXT DEFAULT '', acquired_date TEXT DEFAULT '', note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', debt_type TEXT NOT NULL,
      person_name TEXT NOT NULL, title TEXT NOT NULL, total_amount INTEGER NOT NULL,
      paid_amount INTEGER DEFAULT 0, bank_id TEXT DEFAULT '', due_date TEXT DEFAULT '',
      status TEXT DEFAULT 'unpaid', note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS debt_payments (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', debt_id TEXT NOT NULL,
      amount INTEGER NOT NULL, bank_id TEXT NOT NULL, date TEXT NOT NULL,
      note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS kids (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      daily_limit INTEGER DEFAULT 0, balance INTEGER DEFAULT 0, bank_id TEXT DEFAULT '',
      avatar_color TEXT DEFAULT 'emerald', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS kid_expenses (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', kid_id TEXT NOT NULL,
      item_name TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT DEFAULT 'Jajan',
      bank_id TEXT DEFAULT '', date TEXT NOT NULL, audit_status TEXT DEFAULT 'pending',
      parent_note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
      foreman_name TEXT NOT NULL, invite_code TEXT UNIQUE NOT NULL, budget_limit INTEGER DEFAULT 0,
      bank_id TEXT DEFAULT '', status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS worker_logs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', project_id TEXT NOT NULL,
      worker_name TEXT NOT NULL, item_title TEXT NOT NULL, category TEXT DEFAULT 'Material',
      amount INTEGER NOT NULL, bank_id TEXT DEFAULT '', receipt_ref TEXT DEFAULT '',
      date TEXT NOT NULL, audit_status TEXT DEFAULT 'pending', foreman_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT '', module TEXT NOT NULL,
      target_id TEXT DEFAULT '', label TEXT NOT NULL, share_token TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS admin_banks (
      id TEXT PRIMARY KEY, bank_name TEXT NOT NULL, account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL, swift_code TEXT DEFAULT '', is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
      module TEXT NOT NULL, detail TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of stmts) {
    await db.prepare(sql).run();
  }

  const alters = [
    `ALTER TABLE members ADD COLUMN plan TEXT DEFAULT 'free'`,
    `ALTER TABLE members ADD COLUMN premium_until TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN pc_pair_code TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN phone TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN avatar_url TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN address TEXT DEFAULT ''`,
    `ALTER TABLE wallets ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE wallets ADD COLUMN account_number TEXT DEFAULT ''`,
    `ALTER TABLE wallets ADD COLUMN account_holder TEXT DEFAULT ''`,
    `ALTER TABLE categories ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE transactions ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE transactions ADD COLUMN ref_source TEXT DEFAULT ''`,
    `ALTER TABLE transactions ADD COLUMN ref_id TEXT DEFAULT ''`,
    `ALTER TABLE split_groups ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE split_groups ADD COLUMN category TEXT DEFAULT 'Umum'`,
    `ALTER TABLE split_groups ADD COLUMN rab_target INTEGER DEFAULT 0`,
    `ALTER TABLE split_groups ADD COLUMN dp_amount INTEGER DEFAULT 0`,
    `ALTER TABLE split_groups ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE split_groups ADD COLUMN note TEXT DEFAULT ''`,
    `ALTER TABLE split_rab_items ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE split_members ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE split_members ADD COLUMN contact TEXT DEFAULT ''`,
    `ALTER TABLE split_installments ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE split_expenses ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE split_expenses ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE trades ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE assets ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE assets ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE debts ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE debts ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE debt_payments ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE kids ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE kids ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE kid_expenses ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE kid_expenses ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE worker_logs ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE worker_logs ADD COLUMN bank_id TEXT DEFAULT ''`
  ];
  for (const alt of alters) {
    try { await db.prepare(alt).run(); } catch (_) {}
  }

  schemaInitialized = true;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'moneyflow-default-secret-change-in-env'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${data}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  try {
    const [data, sig] = token.split('.');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret || 'moneyflow-default-secret-change-in-env'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(decodeURIComponent(escape(atob(data))));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function isMemberPremium(member) {
  if (!member || member.plan !== 'premium') return false;
  if (!member.premium_until) return true;
  return new Date(member.premium_until).getTime() >= Date.now();
}

function formatUserResponse(m) {
  const activePrem = isMemberPremium(m);
  return {
    id: m.id,
    full_name: m.full_name,
    email: m.email,
    phone: m.phone || '',
    avatar_url: m.avatar_url || '',
    address: m.address || '',
    role: m.role || 'Client',
    plan: activePrem ? 'premium' : 'free',
    premium_until: m.premium_until || '',
    pc_pair_code: m.pc_pair_code || ''
  };
}

async function logActivity(db, actor, action, module, detail = '') {
  try {
    const id = 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await db
      .prepare('INSERT INTO activity_logs (id, actor, action, module, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(id, actor, action, module, detail)
      .run();
  } catch (_) {}
}

async function syncLinkedTx(db, { ownerId, refSource, refId, type, amount, walletId, date, note }) {
  await db.prepare('DELETE FROM transactions WHERE owner_id = ? AND ref_source = ? AND ref_id = ?').bind(ownerId, refSource, refId).run();
  if (!walletId || Number(amount) <= 0) return;
  const txId = `tx-${refSource}-${refId}`;
  await db
    .prepare(
      `INSERT INTO transactions (id, owner_id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)`
    )
    .bind(txId, ownerId, type, Number(amount), walletId, date, note || '', refSource, refId)
    .run();
}

async function removeLinkedTx(db, ownerId, refSource, refId) {
  await db.prepare('DELETE FROM transactions WHERE owner_id = ? AND ref_source = ? AND ref_id = ?').bind(ownerId, refSource, refId).run();
}

async function recalcDebtTotals(db, ownerId, debtId) {
  const row = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM debt_payments WHERE owner_id = ? AND debt_id = ?').bind(ownerId, debtId).first();
  const debt = await db.prepare('SELECT total_amount FROM debts WHERE owner_id = ? AND id = ?').bind(ownerId, debtId).first();
  if (!debt) return;
  const paid = Number(row?.total_paid || 0);
  const total = Number(debt.total_amount || 0);
  const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  await db.prepare('UPDATE debts SET paid_amount = ?, status = ? WHERE owner_id = ? AND id = ?').bind(paid, status, ownerId, debtId).run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!env.DB) {
    return json({ ok: false, error: 'D1 Binding (DB) belum terpasang di Cloudflare Pages.' }, 500);
  }

  try {
    await ensureSchema(env.DB);

    // 1. HEALTH CHECK & PUBLIC BRAND/BANKS INFO
    if (path === 'health' && method === 'GET') {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, db: 'connected', timestamp: new Date().toISOString() });
    }

    if (path === 'public-config' && method === 'GET') {
      const [settingsRows, banks] = await Promise.all([
        env.DB.prepare('SELECT key, value FROM app_settings').all(),
        env.DB.prepare('SELECT id, bank_name, account_number, account_holder, swift_code FROM admin_banks WHERE is_active = 1 ORDER BY created_at ASC').all()
      ]);
      const settings = {};
      for (const r of settingsRows.results || []) settings[r.key] = r.value;
      return json({ ok: true, settings, adminBanks: banks.results || [] });
    }

    // 2. PUBLIC VIEW-ONLY SHARED DATA (/api/shared/:token) -> Read-only, zero private bank leak
    if (path.startsWith('shared/') && method === 'GET') {
      const shareToken = path.split('/')[1];
      const link = await env.DB.prepare('SELECT * FROM share_links WHERE share_token = ? AND is_active = 1').bind(shareToken).first();
      if (!link) {
        return json({ ok: false, error: 'Link tampilan tidak ditemukan atau sudah dinonaktifkan pemilik akun.' }, 404);
      }
      const owner = await env.DB.prepare('SELECT full_name FROM members WHERE id = ?').bind(link.owner_id).first();

      if (link.module === 'patungan') {
        const groupQuery = link.target_id
          ? env.DB.prepare('SELECT id, title, category, rab_target, dp_amount, invite_code, split_method, status, note, created_at FROM split_groups WHERE owner_id = ? AND id = ?').bind(link.owner_id, link.target_id)
          : env.DB.prepare('SELECT id, title, category, rab_target, dp_amount, invite_code, split_method, status, note, created_at FROM split_groups WHERE owner_id = ? ORDER BY created_at DESC').bind(link.owner_id);
        const groups = (await groupQuery.all()).results || [];
        const groupIds = groups.map(g => g.id);
        const rabItems = [], members = [], installments = [], expenses = [];
        for (const gid of groupIds) {
          rabItems.push(...((await env.DB.prepare('SELECT id, group_id, item_name, qty, unit_price, subtotal, status FROM split_rab_items WHERE owner_id = ? AND group_id = ?').bind(link.owner_id, gid).all()).results || []));
          members.push(...((await env.DB.prepare('SELECT id, group_id, name, share_value, is_settled FROM split_members WHERE owner_id = ? AND group_id = ?').bind(link.owner_id, gid).all()).results || []));
          installments.push(...((await env.DB.prepare('SELECT id, group_id, member_id, payment_type, amount, date, note FROM split_installments WHERE owner_id = ? AND group_id = ? ORDER BY date DESC').bind(link.owner_id, gid).all()).results || []));
          expenses.push(...((await env.DB.prepare('SELECT id, group_id, title, amount, date, note FROM split_expenses WHERE owner_id = ? AND group_id = ? ORDER BY date DESC').bind(link.owner_id, gid).all()).results || []));
        }
        return json({
          ok: true,
          viewOnly: true,
          module: 'patungan',
          label: link.label,
          ownerName: owner?.full_name || 'Pemilik Akun',
          groups,
          rabItems,
          members,
          installments,
          expenses
        });
      }

      if (link.module === 'kids') {
        const kidsQuery = link.target_id
          ? env.DB.prepare('SELECT id, name, daily_limit, balance FROM kids WHERE owner_id = ? AND id = ?').bind(link.owner_id, link.target_id)
          : env.DB.prepare('SELECT id, name, daily_limit, balance FROM kids WHERE owner_id = ?').bind(link.owner_id);
        const kids = (await kidsQuery.all()).results || [];
        const expenses = [];
        for (const k of kids) {
          expenses.push(...((await env.DB.prepare('SELECT id, kid_id, item_name, amount, category, date, audit_status, parent_note FROM kid_expenses WHERE owner_id = ? AND kid_id = ? ORDER BY date DESC').bind(link.owner_id, k.id).all()).results || []));
        }
        return json({
          ok: true,
          viewOnly: true,
          module: 'kids',
          label: link.label,
          ownerName: owner?.full_name || 'Orang Tua',
          kids,
          expenses
        });
      }

      if (link.module === 'worker') {
        const projQuery = link.target_id
          ? env.DB.prepare('SELECT id, name, foreman_name, invite_code, budget_limit, status FROM projects WHERE owner_id = ? AND id = ?').bind(link.owner_id, link.target_id)
          : env.DB.prepare('SELECT id, name, foreman_name, invite_code, budget_limit, status FROM projects WHERE owner_id = ?').bind(link.owner_id);
        const projects = (await projQuery.all()).results || [];
        const logs = [];
        for (const p of projects) {
          logs.push(...((await env.DB.prepare('SELECT id, project_id, worker_name, item_title, category, amount, receipt_ref, date, audit_status, foreman_note FROM worker_logs WHERE owner_id = ? AND project_id = ? ORDER BY date DESC').bind(link.owner_id, p.id).all()).results || []));
        }
        return json({
          ok: true,
          viewOnly: true,
          module: 'worker',
          label: link.label,
          ownerName: owner?.full_name || 'Mandor',
          projects,
          logs
        });
      }

      return json({ ok: false, error: 'Modul share tidak valid.' }, 400);
    }

    // 3. MEMBER AUTHENTICATION, PC LOGIN & PREMIUM 65K/YEAR
    if (path === 'auth/register' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      if (!email || !b.password || !b.full_name) return json({ ok: false, error: 'Nama, email, dan password wajib diisi.' }, 400);
      const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      if (existing) return json({ ok: false, error: 'Email sudah terdaftar. Silakan masuk.' }, 409);

      const id = 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      await env.DB.prepare(
        `INSERT INTO members (id, full_name, email, phone, password_hash, avatar_url, address, role, plan, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free', 'active')`
      ).bind(id, b.full_name.trim(), email, b.phone || '', passHash, b.avatar_url || '', b.address || '', b.role || 'Client').run();

      const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
      const token = await signToken({ role: 'member', userId: id, email, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }, env.JWT_SECRET);
      await logActivity(env.DB, b.full_name.trim(), 'Registrasi Akun Pribadi', 'Auth', email);
      return json({ ok: true, token, user: formatUserResponse(member) }, 201);
    }

    if (path === 'auth/login' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      const member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first();
      if (!member) return json({ ok: false, error: 'Email atau password tidak sesuai.' }, 401);
      if (member.status === 'suspended') return json({ ok: false, error: 'Akun ditangguhkan oleh Superadmin.' }, 403);
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      if (member.password_hash && member.password_hash !== passHash) return json({ ok: false, error: 'Email atau password tidak sesuai.' }, 401);

      await env.DB.prepare('UPDATE members SET last_active = CURRENT_TIMESTAMP WHERE id = ?').bind(member.id).run();
      const token = await signToken({ role: 'member', userId: member.id, email: member.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }, env.JWT_SECRET);
      await logActivity(env.DB, member.full_name, 'Login Akun Pribadi', 'Auth', member.email);
      return json({ ok: true, token, user: formatUserResponse(member) });
    }

    // Login ke PC menggunakan Kode Pairing 6-Digit (Khusus Akun Premium 65k/tahun)
    if (path === 'auth/pc-login' && method === 'POST') {
      const b = await request.json();
      const code = (b.pair_code || '').trim().toUpperCase();
      if (!code) return json({ ok: false, error: 'Masukkan kode pairing PC.' }, 400);
      const member = await env.DB.prepare('SELECT * FROM members WHERE pc_pair_code = ?').bind(code).first();
      if (!member) return json({ ok: false, error: 'Kode pairing PC tidak ditemukan atau sudah kedaluwarsa.' }, 404);
      if (!isMemberPremium(member)) return json({ ok: false, error: 'Fitur Login ke PC khusus paket Premium (Rp 65.000/tahun).' }, 403);

      // Rotate pair code after one-time use for security
      const nextCode = 'PC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      await env.DB.prepare('UPDATE members SET pc_pair_code = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?').bind(nextCode, member.id).run();
      const updated = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(member.id).first();
      const token = await signToken({ role: 'member', userId: member.id, email: member.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }, env.JWT_SECRET);
      await logActivity(env.DB, member.full_name, 'Login ke PC via Kode Pairing', 'Premium PC', member.email);
      return json({ ok: true, token, user: formatUserResponse(updated) });
    }

    // 4. PROTECTED MEMBER ROUTES (STRICT owner_id ISOLATION)
    const memberProtectedPrefixes = [
      'auth/profile', 'auth/pc-pair', 'auth/upgrade-premium', 'state', 'sync-push',
      'wallets', 'categories', 'budgets', 'transactions', 'import',
      'split-groups', 'split-rab-items', 'split-members', 'split-installments', 'split-expenses',
      'trades', 'assets', 'debts', 'debt-payments', 'kids', 'kid-expenses',
      'projects', 'worker-logs', 'share-links'
    ];

    if (memberProtectedPrefixes.some(p => path === p || path.startsWith(p + '/'))) {
      const authHeader = request.headers.get('Authorization') || '';
      const session = await verifyToken(authHeader.replace(/^Bearer\s+/i, ''), env.JWT_SECRET);
      if (!session || session.role !== 'member' || !session.userId) {
        return json({ ok: false, error: 'Silakan login ke akun pribadi Anda terlebih dahulu.' }, 401);
      }

      const ownerId = session.userId;
      const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(ownerId).first();
      if (!member) return json({ ok: false, error: 'Akun tidak ditemukan.' }, 404);
      if (member.status === 'suspended') return json({ ok: false, error: 'Akun ditangguhkan.' }, 403);

      // Profile Update
      if (path === 'auth/profile' && method === 'PUT') {
        const b = await request.json();
        let newHash = member.password_hash;
        if (b.new_password && b.new_password.trim().length >= 4) {
          newHash = await sha256Hex(`${member.email}:${b.new_password.trim()}:${env.JWT_SECRET || 'mf'}`);
        }
        await env.DB.prepare(
          `UPDATE members SET full_name = ?, phone = ?, avatar_url = ?, address = ?, password_hash = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(
          b.full_name?.trim() || member.full_name, b.phone ?? member.phone,
          b.avatar_url ?? member.avatar_url, b.address ?? member.address, newHash, ownerId
        ).run();
        const updated = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(ownerId).first();
        return json({ ok: true, user: formatUserResponse(updated) });
      }

      // Generate PC Pairing Code (Premium 65k/yr)
      if (path === 'auth/pc-pair' && method === 'POST') {
        if (!isMemberPremium(member)) {
          return json({ ok: false, error: 'Fitur Login ke PC memerlukan Paket Premium Rp 65.000/tahun.' }, 403);
        }
        const pairCode = 'PC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await env.DB.prepare('UPDATE members SET pc_pair_code = ? WHERE id = ?').bind(pairCode, ownerId).run();
        const updated = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(ownerId).first();
        return json({ ok: true, user: formatUserResponse(updated) });
      }

      // Upgrade / Activate Premium 65k/year
      if (path === 'auth/upgrade-premium' && method === 'POST') {
        const b = await request.json();
        const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const pairCode = member.pc_pair_code || ('PC-' + Math.random().toString(36).substring(2, 8).toUpperCase());
        await env.DB.prepare(`UPDATE members SET plan = 'premium', premium_until = ?, pc_pair_code = ? WHERE id = ?`)
          .bind(nextYear, pairCode, ownerId).run();
        const updated = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(ownerId).first();
        await logActivity(env.DB, member.full_name, 'Aktivasi Paket Premium Rp 65.000/tahun', 'Premium 65k', `Berlaku s/d ${nextYear} (${b.payment_ref || 'Konfirmasi'})`);
        return json({ ok: true, user: formatUserResponse(updated) });
      }

      // Fetch Private Account State (ONLY WHERE owner_id = ownerId)
      if (path === 'state' && method === 'GET') {
        const [
          wallets, categories, budgets, transactions, splitGroups, splitRabItems, splitMembers,
          splitInstallments, splitExpenses, trades, assets, debts, debtPayments,
          kids, kidExpenses, projects, workerLogs, shareLinks, settingsRows, adminBanks
        ] = await Promise.all([
          env.DB.prepare('SELECT * FROM wallets WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM categories WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM budgets WHERE owner_id = ? ORDER BY month DESC, created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM transactions WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM split_groups WHERE owner_id = ? ORDER BY created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM split_rab_items WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM split_members WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM split_installments WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM split_expenses WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM trades WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM assets WHERE owner_id = ? ORDER BY created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM debts WHERE owner_id = ? ORDER BY created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM debt_payments WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM kids WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM kid_expenses WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM worker_logs WHERE owner_id = ? ORDER BY date DESC, created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT * FROM share_links WHERE owner_id = ? ORDER BY created_at DESC').bind(ownerId).all(),
          env.DB.prepare('SELECT key, value FROM app_settings').all(),
          env.DB.prepare('SELECT * FROM admin_banks WHERE is_active = 1 ORDER BY created_at ASC').all(),
        ]);

        const settings = {};
        for (const r of settingsRows.results || []) settings[r.key] = r.value;

        return json({
          ok: true,
          user: formatUserResponse(member),
          wallets: wallets.results || [],
          categories: categories.results || [],
          budgets: budgets.results || [],
          transactions: transactions.results || [],
          splitGroups: splitGroups.results || [],
          splitRabItems: splitRabItems.results || [],
          splitMembers: splitMembers.results || [],
          splitInstallments: splitInstallments.results || [],
          splitExpenses: splitExpenses.results || [],
          trades: trades.results || [],
          assets: assets.results || [],
          debts: debts.results || [],
          debtPayments: debtPayments.results || [],
          kids: kids.results || [],
          kidExpenses: kidExpenses.results || [],
          projects: projects.results || [],
          workerLogs: workerLogs.results || [],
          shareLinks: shareLinks.results || [],
          settings,
          adminBanks: adminBanks.results || []
        });
      }

      // Bulk Import Transactions (Premium 65k/year feature)
      if (path === 'import/transactions' && method === 'POST') {
        if (!isMemberPremium(member)) {
          return json({ ok: false, error: 'Fitur Impor Transaksi khusus paket Premium (Rp 65.000/tahun).' }, 403);
        }
        const { rows } = await request.json();
        if (!Array.isArray(rows) || rows.length === 0) {
          return json({ ok: false, error: 'Tidak ada baris transaksi untuk diimpor.' }, 400);
        }
        let imported = 0;
        for (const r of rows) {
          if (!r.wallet_id || !r.amount || !r.date) continue;
          const id = r.id || ('tx-imp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
          await env.DB.prepare(
            `INSERT OR IGNORE INTO transactions (id, owner_id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`
          ).bind(id, ownerId, r.type === 'income' ? 'income' : r.type === 'transfer' ? 'transfer' : 'expense', Number(r.amount), r.category_id || null, r.wallet_id, r.to_wallet_id || null, r.date, r.note || 'Impor').run();
          imported++;
        }
        await logActivity(env.DB, member.full_name, 'Impor Transaksi', 'Premium Import', `${imported} transaksi`);
        return json({ ok: true, imported });
      }

      // Share View-Only Links CRUD (Owner Full Control)
      if (path === 'share-links' && method === 'POST') {
        const b = await request.json();
        const shareToken = 'shr_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), x => x.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare(
          `INSERT INTO share_links (id, owner_id, module, target_id, label, share_token, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        ).bind(b.id, ownerId, b.module, b.target_id || '', b.label, shareToken).run();
        return json({ ok: true, share_token: shareToken });
      }
      if (path.startsWith('share-links/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare('UPDATE share_links SET is_active = ? WHERE id = ? AND owner_id = ?')
          .bind(b.is_active ? 1 : 0, id, ownerId).run();
        return json({ ok: true });
      }
      if (path.startsWith('share-links/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM share_links WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      // Wallets CRUD
      if (path === 'wallets' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO wallets (id, owner_id, name, type, account_number, account_holder, initial_balance, color, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(b.id, ownerId, b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.color || 'indigo', b.icon || 'fa-building-columns').run();
        return json({ ok: true });
      }
      if (path.startsWith('wallets/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE wallets SET name = ?, type = ?, account_number = ?, account_holder = ?, initial_balance = ?, icon = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.icon || 'fa-building-columns', id, ownerId).run();
        return json({ ok: true });
      }
      if (path.startsWith('wallets/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM wallets WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      // Categories CRUD
      if (path === 'categories' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO categories (id, owner_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.name, b.type, b.icon || 'fa-tag', b.color || 'indigo').run();
        return json({ ok: true });
      }
      if (path.startsWith('categories/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM categories WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      // Budgets CRUD
      if (path === 'budgets' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO budgets (id, owner_id, month, category_id, limit_amount, note)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(b.id, ownerId, b.month, b.category_id || '', Number(b.limit_amount || 0), b.note || '').run();
        return json({ ok: true });
      }
      if (path.startsWith('budgets/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM budgets WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      // Transactions CRUD
      if (path === 'transactions' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO transactions (id, owner_id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '')`
        ).bind(b.id, ownerId, b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '').run();
        return json({ ok: true }, 201);
      }
      if (path.startsWith('transactions/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE transactions SET type = ?, amount = ?, category_id = ?, wallet_id = ?, to_wallet_id = ?, date = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '', id, ownerId).run();
        return json({ ok: true });
      }
      if (path.startsWith('transactions/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM transactions WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      // Split Groups / Patungan CRUD
      if (path === 'split-groups' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO split_groups (id, owner_id, title, category, rab_target, dp_amount, bank_id, invite_code, split_method, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(b.id, ownerId, b.title, b.category || 'Umum', Number(b.rab_target || 0), Number(b.dp_amount || 0), b.bank_id || '', b.invite_code, b.split_method || 'equal', b.status || 'pengajuan_rab', b.note || '').run();

        if (Array.isArray(b.members)) {
          for (const m of b.members) {
            await env.DB.prepare(`INSERT OR REPLACE INTO split_members (id, owner_id, group_id, name, contact, share_value, is_settled) VALUES (?, ?, ?, ?, ?, ?, ?)`)
              .bind(m.id, ownerId, b.id, m.name, m.contact || '', Number(m.share_value || 0), m.is_settled ? 1 : 0).run();
          }
        }
        return json({ ok: true });
      }
      if (path.startsWith('split-groups/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE split_groups SET title = ?, category = ?, rab_target = ?, dp_amount = ?, bank_id = ?, split_method = ?, status = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.title, b.category || 'Umum', Number(b.rab_target || 0), Number(b.dp_amount || 0), b.bank_id || '', b.split_method || 'equal', b.status || 'pengajuan_rab', b.note || '', id, ownerId).run();
        return json({ ok: true });
      }
      if (path.startsWith('split-groups/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const insts = await env.DB.prepare('SELECT id FROM split_installments WHERE owner_id = ? AND group_id = ?').bind(ownerId, id).all();
        for (const r of insts.results || []) await removeLinkedTx(env.DB, ownerId, 'split_installment', r.id);
        const exps = await env.DB.prepare('SELECT id FROM split_expenses WHERE owner_id = ? AND group_id = ?').bind(ownerId, id).all();
        for (const r of exps.results || []) await removeLinkedTx(env.DB, ownerId, 'split_expense', r.id);

        await env.DB.prepare('DELETE FROM split_groups WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM split_rab_items WHERE group_id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM split_members WHERE group_id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM split_installments WHERE group_id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM split_expenses WHERE group_id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      if (path === 'split-rab-items' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO split_rab_items (id, owner_id, group_id, item_name, qty, unit_price, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.group_id, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.subtotal || 0), b.status || 'diajukan').run();
        return json({ ok: true });
      }
      if (path.startsWith('split-rab-items/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM split_rab_items WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      if (path === 'split-members' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO split_members (id, owner_id, group_id, name, contact, share_value, is_settled) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.group_id, b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0).run();
        return json({ ok: true });
      }
      if (path.startsWith('split-members/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare('UPDATE split_members SET name = ?, contact = ?, share_value = ?, is_settled = ? WHERE id = ? AND owner_id = ?')
          .bind(b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0, id, ownerId).run();
        return json({ ok: true });
      }
      if (path.startsWith('split-members/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const insts = await env.DB.prepare('SELECT id FROM split_installments WHERE member_id = ? AND owner_id = ?').bind(id, ownerId).all();
        for (const r of insts.results || []) await removeLinkedTx(env.DB, ownerId, 'split_installment', r.id);
        await env.DB.prepare('DELETE FROM split_installments WHERE member_id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM split_members WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      if (path === 'split-installments' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO split_installments (id, owner_id, group_id, member_id, payment_type, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.group_id, b.member_id, b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '').run();
        const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ? AND owner_id = ?').bind(b.group_id, ownerId).first();
        const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ? AND owner_id = ?').bind(b.member_id, ownerId).first();
        await syncLinkedTx(env.DB, {
          ownerId, refSource: 'split_installment', refId: b.id, type: 'income', amount: b.amount, walletId: b.bank_id, date: b.date,
          note: `[Patungan: ${grp?.title || ''}] ${b.payment_type.toUpperCase()} - ${mem?.name || 'Peserta'}${b.note ? ' (' + b.note + ')' : ''}`,
        });
        return json({ ok: true });
      }
      if (path.startsWith('split-installments/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE split_installments SET payment_type = ?, amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '', id, ownerId).run();
        const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ? AND owner_id = ?').bind(b.group_id, ownerId).first();
        const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ? AND owner_id = ?').bind(b.member_id, ownerId).first();
        await syncLinkedTx(env.DB, {
          ownerId, refSource: 'split_installment', refId: id, type: 'income', amount: b.amount, walletId: b.bank_id, date: b.date,
          note: `[Patungan: ${grp?.title || ''}] ${b.payment_type.toUpperCase()} - ${mem?.name || 'Peserta'}${b.note ? ' (' + b.note + ')' : ''}`,
        });
        return json({ ok: true });
      }
      if (path.startsWith('split-installments/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM split_installments WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'split_installment', id);
        return json({ ok: true });
      }

      if (path === 'split-expenses' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO split_expenses (id, owner_id, group_id, title, amount, paid_by_member_id, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.group_id, b.title, Number(b.amount), b.paid_by_member_id || '', b.bank_id || '', b.date, b.note || '').run();
        if (b.bank_id) {
          const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ? AND owner_id = ?').bind(b.group_id, ownerId).first();
          await syncLinkedTx(env.DB, { ownerId, refSource: 'split_expense', refId: b.id, type: 'expense', amount: b.amount, walletId: b.bank_id, date: b.date, note: `[Belanja Patungan: ${grp?.title || ''}] ${b.title}` });
        }
        return json({ ok: true });
      }
      if (path.startsWith('split-expenses/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM split_expenses WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'split_expense', id);
        return json({ ok: true });
      }

      // Trades CRUD
      if (path === 'trades' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO trades (id, owner_id, trade_type, item_name, qty, unit_price, cost_price, total_amount, counterparty, wallet_id, payment_status, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.trade_type, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.cost_price || 0), Number(b.total_amount || 0), b.counterparty || '', b.wallet_id || '', b.payment_status || 'paid', b.date, b.note || '').run();
        if (b.wallet_id && b.payment_status === 'paid') {
          await syncLinkedTx(env.DB, { ownerId, refSource: 'trade', refId: b.id, type: b.trade_type === 'sell' ? 'income' : 'expense', amount: b.total_amount, walletId: b.wallet_id, date: b.date, note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)` });
        }
        return json({ ok: true });
      }
      if (path.startsWith('trades/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE trades SET trade_type = ?, item_name = ?, qty = ?, unit_price = ?, cost_price = ?, total_amount = ?, counterparty = ?, wallet_id = ?, payment_status = ?, date = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.trade_type, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.cost_price || 0), Number(b.total_amount || 0), b.counterparty || '', b.wallet_id || '', b.payment_status || 'paid', b.date, b.note || '', id, ownerId).run();
        if (b.wallet_id && b.payment_status === 'paid') {
          await syncLinkedTx(env.DB, { ownerId, refSource: 'trade', refId: id, type: b.trade_type === 'sell' ? 'income' : 'expense', amount: b.total_amount, walletId: b.wallet_id, date: b.date, note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)` });
        } else {
          await removeLinkedTx(env.DB, ownerId, 'trade', id);
        }
        return json({ ok: true });
      }
      if (path.startsWith('trades/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM trades WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'trade', id);
        return json({ ok: true });
      }

      // Assets & Debts CRUD
      if (path === 'assets' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO assets (id, owner_id, name, category, purchase_value, current_value, bank_id, acquired_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.name, b.category, Number(b.purchase_value || 0), Number(b.current_value || 0), b.bank_id || '', b.acquired_date || '', b.note || '').run();
        if (b.bank_id && Number(b.purchase_value || 0) > 0) {
          await syncLinkedTx(env.DB, { ownerId, refSource: 'asset', refId: b.id, type: 'expense', amount: b.purchase_value, walletId: b.bank_id, date: b.acquired_date || new Date().toISOString().slice(0, 10), note: `[Perolehan Aset] ${b.name}` });
        }
        return json({ ok: true });
      }
      if (path.startsWith('assets/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM assets WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'asset', id);
        return json({ ok: true });
      }

      if (path === 'debts' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO debts (id, owner_id, debt_type, person_name, title, total_amount, paid_amount, bank_id, due_date, status, note) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'unpaid', ?)`)
          .bind(b.id, ownerId, b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '').run();
        return json({ ok: true });
      }
      if (path.startsWith('debts/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE debts SET debt_type = ?, person_name = ?, title = ?, total_amount = ?, bank_id = ?, due_date = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '', id, ownerId).run();
        await recalcDebtTotals(env.DB, ownerId, id);
        return json({ ok: true });
      }
      if (path.startsWith('debts/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const pays = await env.DB.prepare('SELECT id FROM debt_payments WHERE debt_id = ? AND owner_id = ?').bind(id, ownerId).all();
        for (const p of pays.results || []) await removeLinkedTx(env.DB, ownerId, 'debt_payment', p.id);
        await env.DB.prepare('DELETE FROM debt_payments WHERE debt_id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM debts WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }

      if (path === 'debt-payments' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO debt_payments (id, owner_id, debt_id, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.debt_id, Number(b.amount), b.bank_id, b.date, b.note || '').run();
        await recalcDebtTotals(env.DB, ownerId, b.debt_id);
        const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ? AND owner_id = ?').bind(b.debt_id, ownerId).first();
        await syncLinkedTx(env.DB, {
          ownerId, refSource: 'debt_payment', refId: b.id, type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
          amount: b.amount, walletId: b.bank_id, date: b.date,
          note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}`,
        });
        return json({ ok: true });
      }
      if (path.startsWith('debt-payments/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare(`UPDATE debt_payments SET amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ? AND owner_id = ?`)
          .bind(Number(b.amount), b.bank_id, b.date, b.note || '', id, ownerId).run();
        await recalcDebtTotals(env.DB, ownerId, b.debt_id);
        const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ? AND owner_id = ?').bind(b.debt_id, ownerId).first();
        await syncLinkedTx(env.DB, {
          ownerId, refSource: 'debt_payment', refId: id, type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
          amount: b.amount, walletId: b.bank_id, date: b.date,
          note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}`,
        });
        return json({ ok: true });
      }
      if (path.startsWith('debt-payments/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const existing = await env.DB.prepare('SELECT debt_id FROM debt_payments WHERE id = ? AND owner_id = ?').bind(id, ownerId).first();
        await env.DB.prepare('DELETE FROM debt_payments WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'debt_payment', id);
        if (existing?.debt_id) await recalcDebtTotals(env.DB, ownerId, existing.debt_id);
        return json({ ok: true });
      }

      // Kids & Audit Ortu CRUD
      if (path === 'kids' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO kids (id, owner_id, name, daily_limit, balance, bank_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.name, Number(b.daily_limit || 0), Number(b.balance || 0), b.bank_id || '', b.avatar_color || 'emerald').run();
        return json({ ok: true });
      }
      if (path.startsWith('kids/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const exps = await env.DB.prepare('SELECT id FROM kid_expenses WHERE kid_id = ? AND owner_id = ?').bind(id, ownerId).all();
        for (const e of exps.results || []) await removeLinkedTx(env.DB, ownerId, 'kid_expense', e.id);
        await env.DB.prepare('DELETE FROM kids WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM kid_expenses WHERE kid_id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }
      if (path === 'kid-expenses' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO kid_expenses (id, owner_id, kid_id, item_name, amount, category, bank_id, date, audit_status, parent_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.kid_id, b.item_name, Number(b.amount), b.category || 'Jajan', b.bank_id || '', b.date, b.audit_status || 'pending', b.parent_note || '').run();
        return json({ ok: true });
      }
      if (path.startsWith('kid-expenses/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare('UPDATE kid_expenses SET audit_status = ?, parent_note = ?, bank_id = ? WHERE id = ? AND owner_id = ?')
          .bind(b.audit_status, b.parent_note || '', b.bank_id || '', id, ownerId).run();
        const exp = await env.DB.prepare('SELECT * FROM kid_expenses WHERE id = ? AND owner_id = ?').bind(id, ownerId).first();
        const kid = exp ? await env.DB.prepare('SELECT name, bank_id FROM kids WHERE id = ? AND owner_id = ?').bind(exp.kid_id, ownerId).first() : null;
        const bankToUse = b.bank_id || exp?.bank_id || kid?.bank_id || '';
        if (exp && b.audit_status === 'approved' && bankToUse) {
          await syncLinkedTx(env.DB, { ownerId, refSource: 'kid_expense', refId: id, type: 'expense', amount: exp.amount, walletId: bankToUse, date: exp.date, note: `[Belanja Anak: ${kid?.name || ''}] ${exp.item_name}` });
        } else {
          await removeLinkedTx(env.DB, ownerId, 'kid_expense', id);
        }
        return json({ ok: true });
      }
      if (path.startsWith('kid-expenses/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM kid_expenses WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'kid_expense', id);
        return json({ ok: true });
      }

      // Projects & Audit Mandor CRUD
      if (path === 'projects' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO projects (id, owner_id, name, foreman_name, invite_code, budget_limit, bank_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.name, b.foreman_name, b.invite_code, Number(b.budget_limit || 0), b.bank_id || '', b.status || 'active').run();
        return json({ ok: true });
      }
      if (path.startsWith('projects/') && method === 'DELETE') {
        const id = path.split('/')[1];
        const logs = await env.DB.prepare('SELECT id FROM worker_logs WHERE project_id = ? AND owner_id = ?').bind(id, ownerId).all();
        for (const l of logs.results || []) await removeLinkedTx(env.DB, ownerId, 'worker_log', l.id);
        await env.DB.prepare('DELETE FROM projects WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await env.DB.prepare('DELETE FROM worker_logs WHERE project_id = ? AND owner_id = ?').bind(id, ownerId).run();
        return json({ ok: true });
      }
      if (path === 'worker-logs' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT INTO worker_logs (id, owner_id, project_id, worker_name, item_title, category, amount, bank_id, receipt_ref, date, audit_status, foreman_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(b.id, ownerId, b.project_id, b.worker_name, b.item_title, b.category || 'Material', Number(b.amount), b.bank_id || '', b.receipt_ref || '', b.date, b.audit_status || 'pending', b.foreman_note || '').run();
        return json({ ok: true });
      }
      if (path.startsWith('worker-logs/') && method === 'PUT') {
        const id = path.split('/')[1];
        const b = await request.json();
        await env.DB.prepare('UPDATE worker_logs SET audit_status = ?, foreman_note = ?, bank_id = ? WHERE id = ? AND owner_id = ?')
          .bind(b.audit_status, b.foreman_note || '', b.bank_id || '', id, ownerId).run();
        const log = await env.DB.prepare('SELECT * FROM worker_logs WHERE id = ? AND owner_id = ?').bind(id, ownerId).first();
        const proj = log ? await env.DB.prepare('SELECT name, bank_id FROM projects WHERE id = ? AND owner_id = ?').bind(log.project_id, ownerId).first() : null;
        const bankToUse = b.bank_id || log?.bank_id || proj?.bank_id || '';
        if (log && b.audit_status === 'verified' && bankToUse) {
          await syncLinkedTx(env.DB, { ownerId, refSource: 'worker_log', refId: id, type: 'expense', amount: log.amount, walletId: bankToUse, date: log.date, note: `[Proyek: ${proj?.name || ''}] ${log.worker_name} - ${log.item_title}` });
        } else {
          await removeLinkedTx(env.DB, ownerId, 'worker_log', id);
        }
        return json({ ok: true });
      }
      if (path.startsWith('worker-logs/') && method === 'DELETE') {
        const id = path.split('/')[1];
        await env.DB.prepare('DELETE FROM worker_logs WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
        await removeLinkedTx(env.DB, ownerId, 'worker_log', id);
        return json({ ok: true });
      }
    }

    // 5. SUPERADMIN LOGIN & PROTECTED ROUTES (/api/superadmin/*)
    if (path === 'superadmin/login' && method === 'POST') {
      const { username, password } = await request.json();
      const validUser = env.SUPERADMIN_USER || 'superadmin';
      const validPass = env.SUPERADMIN_PASS || 'MoneyFlow#2026';

      if (username !== validUser || password !== validPass) {
        await logActivity(env.DB, username || 'unknown', 'Gagal Login Superadmin', 'Superadmin', 'Kredensial salah');
        return json({ ok: false, error: 'Username atau Password Superadmin salah.' }, 401);
      }

      const token = await signToken({ role: 'superadmin', user: validUser, exp: Date.now() + 1000 * 60 * 60 * 12 }, env.JWT_SECRET);
      await logActivity(env.DB, validUser, 'Login Superadmin', 'Superadmin', 'Sesi aktif');
      return json({ ok: true, token, user: validUser });
    }

    if (path.startsWith('superadmin/')) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = await verifyToken(token, env.JWT_SECRET);
      if (!session || session.role !== 'superadmin') {
        return json({ ok: false, error: 'Sesi Superadmin tidak valid.' }, 401);
      }

      if (path === 'superadmin/dashboard' && method === 'GET') {
        const [members, logs, banks, settingsRows, counts] = await Promise.all([
          env.DB.prepare('SELECT id, full_name, email, phone, role, plan, premium_until, status, last_active, created_at FROM members ORDER BY created_at DESC').all(),
          env.DB.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100').all(),
          env.DB.prepare('SELECT * FROM admin_banks ORDER BY created_at ASC').all(),
          env.DB.prepare('SELECT key, value FROM app_settings').all(),
          Promise.all([
            env.DB.prepare('SELECT COUNT(*) AS c FROM transactions').first(),
            env.DB.prepare('SELECT COUNT(*) AS c FROM split_groups').first(),
            env.DB.prepare('SELECT COUNT(*) AS c FROM trades').first(),
            env.DB.prepare('SELECT COUNT(*) AS c FROM members WHERE plan = \'premium\'').first()
          ])
        ]);
        const settings = {};
        for (const r of settingsRows.results || []) settings[r.key] = r.value;

        return json({
          ok: true,
          members: members.results || [],
          logs: logs.results || [],
          banks: banks.results || [],
          settings,
          stats: {
            txCount: counts[0]?.c || 0,
            splitCount: counts[1]?.c || 0,
            tradeCount: counts[2]?.c || 0,
            premiumCount: counts[3]?.c || 0
          },
          envStatus: {
            DB_BINDING: Boolean(env.DB),
            SUPERADMIN_USER: Boolean(env.SUPERADMIN_USER),
            SUPERADMIN_PASS: Boolean(env.SUPERADMIN_PASS),
            JWT_SECRET: Boolean(env.JWT_SECRET),
            WEBHOOK_SECRET: Boolean(env.WEBHOOK_SECRET),
            RUNTIME: 'Cloudflare Pages Functions + D1 SQLite',
          },
        });
      }

      if (path === 'superadmin/members' && method === 'POST') {
        const b = await request.json();
        const email = (b.email || '').trim().toLowerCase();
        const passHash = b.password ? await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`) : '';
        const nextYear = b.plan === 'premium' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
        await env.DB.prepare(
          `INSERT INTO members (id, full_name, email, phone, password_hash, role, plan, premium_until, status, last_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, email = excluded.email, phone = excluded.phone, role = excluded.role, plan = excluded.plan, premium_until = excluded.premium_until, status = excluded.status`
        ).bind(b.id, b.full_name, email, b.phone || '', passHash, b.role || 'Client', b.plan || 'free', nextYear, b.status || 'active').run();
        return json({ ok: true });
      }

      if (path.startsWith('superadmin/members/') && path.endsWith('/premium') && method === 'PUT') {
        const id = path.split('/')[2];
        const b = await request.json();
        const nextYear = b.plan === 'premium' ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : '';
        await env.DB.prepare('UPDATE members SET plan = ?, premium_until = ? WHERE id = ?').bind(b.plan, nextYear, id).run();
        await logActivity(env.DB, session.user, `Ubah Paket Member -> ${b.plan}`, 'Superadmin', id);
        return json({ ok: true });
      }

      if (path.startsWith('superadmin/members/') && method === 'DELETE') {
        const id = path.split('/')[2];
        await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (path === 'superadmin/banks' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(`INSERT OR REPLACE INTO admin_banks (id, bank_name, account_number, account_holder, swift_code, is_active) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(b.id, b.bank_name, b.account_number, b.account_holder, b.swift_code || '', b.is_active ? 1 : 0).run();
        return json({ ok: true });
      }
      if (path.startsWith('superadmin/banks/') && method === 'DELETE') {
        const id = path.split('/')[2];
        await env.DB.prepare('DELETE FROM admin_banks WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }

      if (path === 'superadmin/settings' && method === 'POST') {
        const updates = await request.json();
        for (const [k, v] of Object.entries(updates)) {
          await env.DB.prepare(
            `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
          ).bind(k, String(v ?? '')).run();
        }
        return json({ ok: true });
      }
    }

    return json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Server error' }, 500);
  }
}
