// Money Flow - Cloudflare Pages Functions + D1 Full-Stack API
// Endpoint: /api/* (Auto-Schema Init + Full Two-Way Sync + Complete CRUD)

let schemaInitialized = false;

async function ensureSchema(db) {
  if (schemaInitialized) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '', password_hash TEXT DEFAULT '', avatar_url TEXT DEFAULT '',
      address TEXT DEFAULT '', role TEXT DEFAULT 'Client', status TEXT DEFAULT 'active',
      last_active TEXT DEFAULT CURRENT_TIMESTAMP, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'bank',
      account_number TEXT DEFAULT '', account_holder TEXT DEFAULT '', initial_balance INTEGER DEFAULT 0,
      color TEXT DEFAULT 'indigo', icon TEXT DEFAULT 'fa-building-columns', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'fa-tag', color TEXT NOT NULL DEFAULT 'indigo', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, amount INTEGER NOT NULL,
      category_id TEXT, wallet_id TEXT NOT NULL, to_wallet_id TEXT,
      date TEXT NOT NULL, note TEXT DEFAULT '', ref_source TEXT DEFAULT '', ref_id TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_groups (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT DEFAULT 'Umum',
      rab_target INTEGER DEFAULT 0, dp_amount INTEGER DEFAULT 0, bank_id TEXT DEFAULT '',
      invite_code TEXT UNIQUE NOT NULL, split_method TEXT DEFAULT 'equal',
      status TEXT DEFAULT 'pengajuan_rab', note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_rab_items (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, item_name TEXT NOT NULL,
      qty INTEGER DEFAULT 1, unit_price INTEGER NOT NULL, subtotal INTEGER NOT NULL,
      status TEXT DEFAULT 'diajukan', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_members (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, name TEXT NOT NULL,
      contact TEXT DEFAULT '', share_value REAL DEFAULT 0, is_settled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_installments (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, member_id TEXT NOT NULL,
      payment_type TEXT DEFAULT 'cicilan', amount INTEGER NOT NULL, bank_id TEXT NOT NULL,
      date TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS split_expenses (
      id TEXT PRIMARY KEY, group_id TEXT NOT NULL, title TEXT NOT NULL,
      amount INTEGER NOT NULL, paid_by_member_id TEXT DEFAULT '', bank_id TEXT DEFAULT '',
      date TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY, trade_type TEXT NOT NULL, item_name TEXT NOT NULL,
      qty INTEGER DEFAULT 1, unit_price INTEGER NOT NULL, cost_price INTEGER DEFAULT 0,
      total_amount INTEGER NOT NULL, counterparty TEXT DEFAULT '', wallet_id TEXT NOT NULL,
      payment_status TEXT DEFAULT 'paid', date TEXT NOT NULL, note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      purchase_value INTEGER DEFAULT 0, current_value INTEGER DEFAULT 0, bank_id TEXT DEFAULT '',
      acquired_date TEXT DEFAULT '', note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY, debt_type TEXT NOT NULL, person_name TEXT NOT NULL,
      title TEXT NOT NULL, total_amount INTEGER NOT NULL, paid_amount INTEGER DEFAULT 0,
      bank_id TEXT DEFAULT '', due_date TEXT DEFAULT '', status TEXT DEFAULT 'unpaid',
      note TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS debt_payments (
      id TEXT PRIMARY KEY, debt_id TEXT NOT NULL, amount INTEGER NOT NULL,
      bank_id TEXT NOT NULL, date TEXT NOT NULL, note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS kids (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, daily_limit INTEGER DEFAULT 0,
      balance INTEGER DEFAULT 0, bank_id TEXT DEFAULT '', avatar_color TEXT DEFAULT 'emerald',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS kid_expenses (
      id TEXT PRIMARY KEY, kid_id TEXT NOT NULL, item_name TEXT NOT NULL,
      amount INTEGER NOT NULL, category TEXT DEFAULT 'Jajan', bank_id TEXT DEFAULT '',
      date TEXT NOT NULL, audit_status TEXT DEFAULT 'pending', parent_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, foreman_name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL, budget_limit INTEGER DEFAULT 0, bank_id TEXT DEFAULT '',
      status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS worker_logs (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, worker_name TEXT NOT NULL,
      item_title TEXT NOT NULL, category TEXT DEFAULT 'Material', amount INTEGER NOT NULL,
      bank_id TEXT DEFAULT '', receipt_ref TEXT DEFAULT '', date TEXT NOT NULL,
      audit_status TEXT DEFAULT 'pending', foreman_note TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
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

  // Safe column upgrades for existing older D1 tables
  const alters = [
    `ALTER TABLE wallets ADD COLUMN account_number TEXT DEFAULT ''`,
    `ALTER TABLE wallets ADD COLUMN account_holder TEXT DEFAULT ''`,
    `ALTER TABLE transactions ADD COLUMN ref_source TEXT DEFAULT ''`,
    `ALTER TABLE transactions ADD COLUMN ref_id TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN phone TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN password_hash TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN avatar_url TEXT DEFAULT ''`,
    `ALTER TABLE members ADD COLUMN address TEXT DEFAULT ''`,
    `ALTER TABLE split_groups ADD COLUMN category TEXT DEFAULT 'Umum'`,
    `ALTER TABLE split_groups ADD COLUMN rab_target INTEGER DEFAULT 0`,
    `ALTER TABLE split_groups ADD COLUMN dp_amount INTEGER DEFAULT 0`,
    `ALTER TABLE split_groups ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE split_groups ADD COLUMN note TEXT DEFAULT ''`,
    `ALTER TABLE split_members ADD COLUMN contact TEXT DEFAULT ''`,
    `ALTER TABLE split_expenses ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE assets ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE debts ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE kids ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE kid_expenses ADD COLUMN bank_id TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN bank_id TEXT DEFAULT ''`,
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

async function logActivity(db, actor, action, module, detail = '') {
  try {
    const id = 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    await db
      .prepare('INSERT INTO activity_logs (id, actor, action, module, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(id, actor, action, module, detail)
      .run();
  } catch (_) {}
}

async function syncLinkedTx(db, { refSource, refId, type, amount, walletId, date, note }) {
  await db.prepare('DELETE FROM transactions WHERE ref_source = ? AND ref_id = ?').bind(refSource, refId).run();
  if (!walletId || Number(amount) <= 0) return;
  const txId = `tx-${refSource}-${refId}`;
  await db
    .prepare(
      `INSERT INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
       VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)`
    )
    .bind(txId, type, Number(amount), walletId, date, note || '', refSource, refId)
    .run();
}

async function removeLinkedTx(db, refSource, refId) {
  await db.prepare('DELETE FROM transactions WHERE ref_source = ? AND ref_id = ?').bind(refSource, refId).run();
}

async function recalcDebtTotals(db, debtId) {
  const row = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM debt_payments WHERE debt_id = ?').bind(debtId).first();
  const debt = await db.prepare('SELECT total_amount FROM debts WHERE id = ?').bind(debtId).first();
  if (!debt) return;
  const paid = Number(row?.total_paid || 0);
  const total = Number(debt.total_amount || 0);
  const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  await db.prepare('UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?').bind(paid, status, debtId).run();
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

    // 1. HEALTH CHECK
    if (path === 'health' && method === 'GET') {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, db: 'connected', timestamp: new Date().toISOString() });
    }

    // 2. TWO-WAY SYNC PUSH (Upload unsynced localStorage data to Cloudflare D1)
    if (path === 'sync-push' && method === 'POST') {
      const b = await request.json();

      for (const w of b.wallets || []) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO wallets (id, name, type, account_number, account_holder, initial_balance, color, icon)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(w.id, w.name, w.type || 'bank', w.account_number || '', w.account_holder || '', Number(w.initial_balance || 0), w.color || 'indigo', w.icon || 'fa-building-columns').run();
      }
      for (const c of b.categories || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)`)
          .bind(c.id, c.name, c.type, c.icon || 'fa-tag', c.color || 'indigo').run();
      }
      for (const t of b.transactions || []) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(t.id, t.type, Number(t.amount), t.category_id || null, t.wallet_id, t.to_wallet_id || null, t.date, t.note || '', t.ref_source || '', t.ref_id || '').run();
      }
      for (const g of b.splitGroups || []) {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO split_groups (id, title, category, rab_target, dp_amount, bank_id, invite_code, split_method, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(g.id, g.title, g.category || 'Umum', Number(g.rab_target || 0), Number(g.dp_amount || 0), g.bank_id || '', g.invite_code, g.split_method || 'equal', g.status || 'pengajuan_rab', g.note || '').run();
      }
      for (const r of b.splitRabItems || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO split_rab_items (id, group_id, item_name, qty, unit_price, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(r.id, r.group_id, r.item_name, Number(r.qty || 1), Number(r.unit_price || 0), Number(r.subtotal || 0), r.status || 'diajukan').run();
      }
      for (const m of b.splitMembers || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO split_members (id, group_id, name, contact, share_value, is_settled) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(m.id, m.group_id, m.name, m.contact || '', Number(m.share_value || 0), m.is_settled ? 1 : 0).run();
      }
      for (const i of b.splitInstallments || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO split_installments (id, group_id, member_id, payment_type, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(i.id, i.group_id, i.member_id, i.payment_type || 'cicilan', Number(i.amount), i.bank_id, i.date, i.note || '').run();
      }
      for (const e of b.splitExpenses || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO split_expenses (id, group_id, title, amount, paid_by_member_id, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(e.id, e.group_id, e.title, Number(e.amount), e.paid_by_member_id || '', e.bank_id || '', e.date, e.note || '').run();
      }
      for (const tr of b.trades || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO trades (id, trade_type, item_name, qty, unit_price, cost_price, total_amount, counterparty, wallet_id, payment_status, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(tr.id, tr.trade_type, tr.item_name, Number(tr.qty || 1), Number(tr.unit_price || 0), Number(tr.cost_price || 0), Number(tr.total_amount || 0), tr.counterparty || '', tr.wallet_id || '', tr.payment_status || 'paid', tr.date, tr.note || '').run();
      }
      for (const a of b.assets || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO assets (id, name, category, purchase_value, current_value, bank_id, acquired_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(a.id, a.name, a.category, Number(a.purchase_value || 0), Number(a.current_value || 0), a.bank_id || '', a.acquired_date || '', a.note || '').run();
      }
      for (const d of b.debts || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO debts (id, debt_type, person_name, title, total_amount, paid_amount, bank_id, due_date, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(d.id, d.debt_type, d.person_name, d.title, Number(d.total_amount || 0), Number(d.paid_amount || 0), d.bank_id || '', d.due_date || '', d.status || 'unpaid', d.note || '').run();
      }
      for (const dp of b.debtPayments || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO debt_payments (id, debt_id, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(dp.id, dp.debt_id, Number(dp.amount), dp.bank_id, dp.date, dp.note || '').run();
      }
      for (const k of b.kids || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO kids (id, name, daily_limit, balance, bank_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(k.id, k.name, Number(k.daily_limit || 0), Number(k.balance || 0), k.bank_id || '', k.avatar_color || 'emerald').run();
      }
      for (const ke of b.kidExpenses || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO kid_expenses (id, kid_id, item_name, amount, category, bank_id, date, audit_status, parent_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(ke.id, ke.kid_id, ke.item_name, Number(ke.amount), ke.category || 'Jajan', ke.bank_id || '', ke.date, ke.audit_status || 'pending', ke.parent_note || '').run();
      }
      for (const p of b.projects || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO projects (id, name, foreman_name, invite_code, budget_limit, bank_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(p.id, p.name, p.foreman_name, p.invite_code, Number(p.budget_limit || 0), p.bank_id || '', p.status || 'active').run();
      }
      for (const wl of b.workerLogs || []) {
        await env.DB.prepare(`INSERT OR IGNORE INTO worker_logs (id, project_id, worker_name, item_title, category, amount, bank_id, receipt_ref, date, audit_status, foreman_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(wl.id, wl.project_id, wl.worker_name, wl.item_title, wl.category || 'Material', Number(wl.amount), wl.bank_id || '', wl.receipt_ref || '', wl.date, wl.audit_status || 'pending', wl.foreman_note || '').run();
      }

      return json({ ok: true });
    }

    // 3. MEMBER AUTH & PROFILE
    if (path === 'auth/register' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      if (!email || !b.password || !b.full_name) return json({ ok: false, error: 'Nama, email, dan password wajib diisi.' }, 400);
      const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      if (existing) return json({ ok: false, error: 'Email sudah terdaftar.' }, 409);

      const id = 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      await env.DB.prepare(
        `INSERT INTO members (id, full_name, email, phone, password_hash, avatar_url, address, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      ).bind(id, b.full_name.trim(), email, b.phone || '', passHash, b.avatar_url || '', b.address || '', b.role || 'Client').run();

      const userObj = { id, full_name: b.full_name.trim(), email, phone: b.phone || '', avatar_url: b.avatar_url || '', address: b.address || '', role: b.role || 'Client' };
      const token = await signToken({ role: 'member', userId: id, email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }, env.JWT_SECRET);
      await logActivity(env.DB, b.full_name.trim(), 'Registrasi Akun Member', 'Auth & Profil', email);
      return json({ ok: true, token, user: userObj }, 201);
    }

    if (path === 'auth/login' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      const member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first();
      if (!member) return json({ ok: false, error: 'Email atau password salah.' }, 401);
      if (member.status === 'suspended') return json({ ok: false, error: 'Akun ditangguhkan.' }, 403);
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      if (member.password_hash && member.password_hash !== passHash) return json({ ok: false, error: 'Email atau password salah.' }, 401);

      await env.DB.prepare('UPDATE members SET last_active = CURRENT_TIMESTAMP WHERE id = ?').bind(member.id).run();
      const userObj = {
        id: member.id, full_name: member.full_name, email: member.email,
        phone: member.phone || '', avatar_url: member.avatar_url || '',
        address: member.address || '', role: member.role || 'Client'
      };
      const token = await signToken({ role: 'member', userId: member.id, email: member.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }, env.JWT_SECRET);
      await logActivity(env.DB, member.full_name, 'Login Member', 'Auth & Profil', member.email);
      return json({ ok: true, token, user: userObj });
    }

    if (path === 'auth/profile' && method === 'PUT') {
      const authHeader = request.headers.get('Authorization') || '';
      const session = await verifyToken(authHeader.replace(/^Bearer\s+/i, ''), env.JWT_SECRET);
      if (!session || !session.userId) return json({ ok: false, error: 'Sesi login tidak valid.' }, 401);
      const b = await request.json();
      const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(session.userId).first();
      if (!member) return json({ ok: false, error: 'Member tidak ditemukan.' }, 404);

      let newHash = member.password_hash;
      if (b.new_password && b.new_password.trim().length >= 4) {
        newHash = await sha256Hex(`${member.email}:${b.new_password.trim()}:${env.JWT_SECRET || 'mf'}`);
      }

      await env.DB.prepare(
        `UPDATE members SET full_name = ?, phone = ?, avatar_url = ?, address = ?, password_hash = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(
        b.full_name?.trim() || member.full_name, b.phone ?? member.phone,
        b.avatar_url ?? member.avatar_url, b.address ?? member.address, newHash, member.id
      ).run();

      const updated = await env.DB.prepare('SELECT id, full_name, email, phone, avatar_url, address, role FROM members WHERE id = ?').bind(member.id).first();
      return json({ ok: true, user: updated });
    }

    // 4. FULL STATE FETCH
    if (path === 'state' && method === 'GET') {
      const [
        wallets, categories, transactions, splitGroups, splitRabItems, splitMembers,
        splitInstallments, splitExpenses, trades, assets, debts, debtPayments,
        kids, kidExpenses, projects, workerLogs, settingsRows, banks,
      ] = await Promise.all([
        env.DB.prepare('SELECT * FROM wallets ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM categories ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM split_groups ORDER BY created_at DESC').all(),
        env.DB.prepare('SELECT * FROM split_rab_items ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM split_members ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM split_installments ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM split_expenses ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM trades ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM assets ORDER BY created_at DESC').all(),
        env.DB.prepare('SELECT * FROM debts ORDER BY created_at DESC').all(),
        env.DB.prepare('SELECT * FROM debt_payments ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM kids ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM kid_expenses ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all(),
        env.DB.prepare('SELECT * FROM worker_logs ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT key, value FROM app_settings').all(),
        env.DB.prepare('SELECT * FROM admin_banks WHERE is_active = 1 ORDER BY created_at ASC').all(),
      ]);

      const settings = {};
      for (const row of settingsRows.results || []) settings[row.key] = row.value;

      return json({
        ok: true,
        wallets: wallets.results || [],
        categories: categories.results || [],
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
        settings,
        banks: banks.results || [],
      });
    }

    // 5. WALLETS CRUD
    if (path === 'wallets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO wallets (id, name, type, account_number, account_holder, initial_balance, color, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.id, b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.color || 'indigo', b.icon || 'fa-building-columns').run();
      await logActivity(env.DB, 'User', 'Simpan Bank/Dompet', 'Bank & Aset', b.name);
      return json({ ok: true });
    }
    if (path.startsWith('wallets/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE wallets SET name = ?, type = ?, account_number = ?, account_holder = ?, initial_balance = ?, icon = ? WHERE id = ?`)
        .bind(b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.icon || 'fa-building-columns', id).run();
      return json({ ok: true });
    }
    if (path.startsWith('wallets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM wallets WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 6. CATEGORIES CRUD
    if (path === 'categories' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)`)
        .bind(b.id, b.name, b.type, b.icon || 'fa-tag', b.color || 'indigo').run();
      return json({ ok: true });
    }
    if (path.startsWith('categories/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 7. TRANSACTIONS CRUD
    if (path === 'transactions' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '')`
      ).bind(b.id, b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '').run();
      await logActivity(env.DB, 'User', `Catat ${b.type}`, 'Keuangan Harian', `Rp ${b.amount}`);
      return json({ ok: true }, 201);
    }
    if (path.startsWith('transactions/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE transactions SET type = ?, amount = ?, category_id = ?, wallet_id = ?, to_wallet_id = ?, date = ?, note = ? WHERE id = ?`)
        .bind(b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '', id).run();
      return json({ ok: true });
    }
    if (path.startsWith('transactions/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 8. PATUNGAN CRUD
    if (path === 'split-groups' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_groups (id, title, category, rab_target, dp_amount, bank_id, invite_code, split_method, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.id, b.title, b.category || 'Umum', Number(b.rab_target || 0), Number(b.dp_amount || 0), b.bank_id || '', b.invite_code, b.split_method || 'equal', b.status || 'pengajuan_rab', b.note || '').run();

      if (Array.isArray(b.members)) {
        for (const m of b.members) {
          await env.DB.prepare(`INSERT OR REPLACE INTO split_members (id, group_id, name, contact, share_value, is_settled) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(m.id, b.id, m.name, m.contact || '', Number(m.share_value || 0), m.is_settled ? 1 : 0).run();
        }
      }
      await logActivity(env.DB, 'User', 'Pengajuan RAB Patungan', 'Patungan', `${b.title} (${b.invite_code})`);
      return json({ ok: true });
    }

    if (path.startsWith('split-groups/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE split_groups SET title = ?, category = ?, rab_target = ?, dp_amount = ?, bank_id = ?, split_method = ?, status = ?, note = ? WHERE id = ?`)
        .bind(b.title, b.category || 'Umum', Number(b.rab_target || 0), Number(b.dp_amount || 0), b.bank_id || '', b.split_method || 'equal', b.status || 'pengajuan_rab', b.note || '', id).run();
      return json({ ok: true });
    }

    if (path.startsWith('split-groups/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const insts = await env.DB.prepare('SELECT id FROM split_installments WHERE group_id = ?').bind(id).all();
      for (const r of insts.results || []) await removeLinkedTx(env.DB, 'split_installment', r.id);
      const exps = await env.DB.prepare('SELECT id FROM split_expenses WHERE group_id = ?').bind(id).all();
      for (const r of exps.results || []) await removeLinkedTx(env.DB, 'split_expense', r.id);

      await env.DB.prepare('DELETE FROM split_groups WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_rab_items WHERE group_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_members WHERE group_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_installments WHERE group_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_expenses WHERE group_id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path === 'split-rab-items' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO split_rab_items (id, group_id, item_name, qty, unit_price, subtotal, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.group_id, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.subtotal || 0), b.status || 'diajukan').run();
      return json({ ok: true });
    }
    if (path.startsWith('split-rab-items/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_rab_items WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path === 'split-members' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO split_members (id, group_id, name, contact, share_value, is_settled) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.group_id, b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0).run();
      return json({ ok: true });
    }
    if (path.startsWith('split-members/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE split_members SET name = ?, contact = ?, share_value = ?, is_settled = ? WHERE id = ?')
        .bind(b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0, id).run();
      return json({ ok: true });
    }
    if (path.startsWith('split-members/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const insts = await env.DB.prepare('SELECT id FROM split_installments WHERE member_id = ?').bind(id).all();
      for (const r of insts.results || []) await removeLinkedTx(env.DB, 'split_installment', r.id);
      await env.DB.prepare('DELETE FROM split_installments WHERE member_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_members WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path === 'split-installments' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO split_installments (id, group_id, member_id, payment_type, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.group_id, b.member_id, b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '').run();
      const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
      const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ?').bind(b.member_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'split_installment', refId: b.id, type: 'income', amount: b.amount, walletId: b.bank_id, date: b.date,
        note: `[Patungan: ${grp?.title || ''}] ${b.payment_type.toUpperCase()} - ${mem?.name || 'Peserta'}${b.note ? ' (' + b.note + ')' : ''}`,
      });
      return json({ ok: true });
    }
    if (path.startsWith('split-installments/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE split_installments SET payment_type = ?, amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ?`)
        .bind(b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '', id).run();
      const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
      const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ?').bind(b.member_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'split_installment', refId: id, type: 'income', amount: b.amount, walletId: b.bank_id, date: b.date,
        note: `[Patungan: ${grp?.title || ''}] ${b.payment_type.toUpperCase()} - ${mem?.name || 'Peserta'}${b.note ? ' (' + b.note + ')' : ''}`,
      });
      return json({ ok: true });
    }
    if (path.startsWith('split-installments/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_installments WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'split_installment', id);
      return json({ ok: true });
    }

    if (path === 'split-expenses' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO split_expenses (id, group_id, title, amount, paid_by_member_id, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.group_id, b.title, Number(b.amount), b.paid_by_member_id || '', b.bank_id || '', b.date, b.note || '').run();
      if (b.bank_id) {
        const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
        await syncLinkedTx(env.DB, { refSource: 'split_expense', refId: b.id, type: 'expense', amount: b.amount, walletId: b.bank_id, date: b.date, note: `[Belanja Patungan: ${grp?.title || ''}] ${b.title}` });
      }
      return json({ ok: true });
    }
    if (path.startsWith('split-expenses/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_expenses WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'split_expense', id);
      return json({ ok: true });
    }

    // 9. TRADES CRUD
    if (path === 'trades' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO trades (id, trade_type, item_name, qty, unit_price, cost_price, total_amount, counterparty, wallet_id, payment_status, date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.trade_type, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.cost_price || 0), Number(b.total_amount || 0), b.counterparty || '', b.wallet_id || '', b.payment_status || 'paid', b.date, b.note || '').run();
      if (b.wallet_id && b.payment_status === 'paid') {
        await syncLinkedTx(env.DB, { refSource: 'trade', refId: b.id, type: b.trade_type === 'sell' ? 'income' : 'expense', amount: b.total_amount, walletId: b.wallet_id, date: b.date, note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)` });
      }
      return json({ ok: true });
    }
    if (path.startsWith('trades/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE trades SET trade_type = ?, item_name = ?, qty = ?, unit_price = ?, cost_price = ?, total_amount = ?, counterparty = ?, wallet_id = ?, payment_status = ?, date = ?, note = ? WHERE id = ?`)
        .bind(b.trade_type, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.cost_price || 0), Number(b.total_amount || 0), b.counterparty || '', b.wallet_id || '', b.payment_status || 'paid', b.date, b.note || '', id).run();
      if (b.wallet_id && b.payment_status === 'paid') {
        await syncLinkedTx(env.DB, { refSource: 'trade', refId: id, type: b.trade_type === 'sell' ? 'income' : 'expense', amount: b.total_amount, walletId: b.wallet_id, date: b.date, note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)` });
      } else {
        await removeLinkedTx(env.DB, 'trade', id);
      }
      return json({ ok: true });
    }
    if (path.startsWith('trades/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM trades WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'trade', id);
      return json({ ok: true });
    }

    // 10. ASSETS, DEBTS & DEBT PAYMENTS CRUD
    if (path === 'assets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO assets (id, name, category, purchase_value, current_value, bank_id, acquired_date, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.name, b.category, Number(b.purchase_value || 0), Number(b.current_value || 0), b.bank_id || '', b.acquired_date || '', b.note || '').run();
      if (b.bank_id && Number(b.purchase_value || 0) > 0) {
        await syncLinkedTx(env.DB, { refSource: 'asset', refId: b.id, type: 'expense', amount: b.purchase_value, walletId: b.bank_id, date: b.acquired_date || new Date().toISOString().slice(0, 10), note: `[Perolehan Aset] ${b.name}` });
      }
      return json({ ok: true });
    }
    if (path.startsWith('assets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'asset', id);
      return json({ ok: true });
    }

    if (path === 'debts' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO debts (id, debt_type, person_name, title, total_amount, paid_amount, bank_id, due_date, status, note) VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'unpaid', ?)`)
        .bind(b.id, b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '').run();
      return json({ ok: true });
    }
    if (path.startsWith('debts/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE debts SET debt_type = ?, person_name = ?, title = ?, total_amount = ?, bank_id = ?, due_date = ?, note = ? WHERE id = ?`)
        .bind(b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '', id).run();
      await recalcDebtTotals(env.DB, id);
      return json({ ok: true });
    }
    if (path.startsWith('debts/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const pays = await env.DB.prepare('SELECT id FROM debt_payments WHERE debt_id = ?').bind(id).all();
      for (const p of pays.results || []) await removeLinkedTx(env.DB, 'debt_payment', p.id);
      await env.DB.prepare('DELETE FROM debt_payments WHERE debt_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM debts WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path === 'debt-payments' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO debt_payments (id, debt_id, amount, bank_id, date, note) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.debt_id, Number(b.amount), b.bank_id, b.date, b.note || '').run();
      await recalcDebtTotals(env.DB, b.debt_id);
      const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ?').bind(b.debt_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'debt_payment', refId: b.id, type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
        amount: b.amount, walletId: b.bank_id, date: b.date,
        note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}`,
      });
      return json({ ok: true });
    }
    if (path.startsWith('debt-payments/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(`UPDATE debt_payments SET amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ?`)
        .bind(Number(b.amount), b.bank_id, b.date, b.note || '', id).run();
      await recalcDebtTotals(env.DB, b.debt_id);
      const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ?').bind(b.debt_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'debt_payment', refId: id, type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
        amount: b.amount, walletId: b.bank_id, date: b.date,
        note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}`,
      });
      return json({ ok: true });
    }
    if (path.startsWith('debt-payments/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const existing = await env.DB.prepare('SELECT debt_id FROM debt_payments WHERE id = ?').bind(id).first();
      await env.DB.prepare('DELETE FROM debt_payments WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'debt_payment', id);
      if (existing?.debt_id) await recalcDebtTotals(env.DB, existing.debt_id);
      return json({ ok: true });
    }

    // 11. KIDS & AUDIT ORTU CRUD
    if (path === 'kids' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO kids (id, name, daily_limit, balance, bank_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.name, Number(b.daily_limit || 0), Number(b.balance || 0), b.bank_id || '', b.avatar_color || 'emerald').run();
      return json({ ok: true });
    }
    if (path.startsWith('kids/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const exps = await env.DB.prepare('SELECT id FROM kid_expenses WHERE kid_id = ?').bind(id).all();
      for (const e of exps.results || []) await removeLinkedTx(env.DB, 'kid_expense', e.id);
      await env.DB.prepare('DELETE FROM kids WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM kid_expenses WHERE kid_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (path === 'kid-expenses' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO kid_expenses (id, kid_id, item_name, amount, category, bank_id, date, audit_status, parent_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.kid_id, b.item_name, Number(b.amount), b.category || 'Jajan', b.bank_id || '', b.date, b.audit_status || 'pending', b.parent_note || '').run();
      return json({ ok: true });
    }
    if (path.startsWith('kid-expenses/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE kid_expenses SET audit_status = ?, parent_note = ?, bank_id = ? WHERE id = ?')
        .bind(b.audit_status, b.parent_note || '', b.bank_id || '', id).run();
      const exp = await env.DB.prepare('SELECT * FROM kid_expenses WHERE id = ?').bind(id).first();
      const kid = exp ? await env.DB.prepare('SELECT name, bank_id FROM kids WHERE id = ?').bind(exp.kid_id).first() : null;
      const bankToUse = b.bank_id || exp?.bank_id || kid?.bank_id || '';
      if (exp && b.audit_status === 'approved' && bankToUse) {
        await syncLinkedTx(env.DB, { refSource: 'kid_expense', refId: id, type: 'expense', amount: exp.amount, walletId: bankToUse, date: exp.date, note: `[Belanja Anak: ${kid?.name || ''}] ${exp.item_name}` });
      } else {
        await removeLinkedTx(env.DB, 'kid_expense', id);
      }
      return json({ ok: true });
    }
    if (path.startsWith('kid-expenses/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM kid_expenses WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'kid_expense', id);
      return json({ ok: true });
    }

    // 12. PROJECTS & AUDIT MANDOR CRUD
    if (path === 'projects' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT OR REPLACE INTO projects (id, name, foreman_name, invite_code, budget_limit, bank_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.name, b.foreman_name, b.invite_code, Number(b.budget_limit || 0), b.bank_id || '', b.status || 'active').run();
      return json({ ok: true });
    }
    if (path.startsWith('projects/') && method === 'DELETE') {
      const id = path.split('/')[1];
      const logs = await env.DB.prepare('SELECT id FROM worker_logs WHERE project_id = ?').bind(id).all();
      for (const l of logs.results || []) await removeLinkedTx(env.DB, 'worker_log', l.id);
      await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM worker_logs WHERE project_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (path === 'worker-logs' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(`INSERT INTO worker_logs (id, project_id, worker_name, item_title, category, amount, bank_id, receipt_ref, date, audit_status, foreman_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(b.id, b.project_id, b.worker_name, b.item_title, b.category || 'Material', Number(b.amount), b.bank_id || '', b.receipt_ref || '', b.date, b.audit_status || 'pending', b.foreman_note || '').run();
      return json({ ok: true });
    }
    if (path.startsWith('worker-logs/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE worker_logs SET audit_status = ?, foreman_note = ?, bank_id = ? WHERE id = ?')
        .bind(b.audit_status, b.foreman_note || '', b.bank_id || '', id).run();
      const log = await env.DB.prepare('SELECT * FROM worker_logs WHERE id = ?').bind(id).first();
      const proj = log ? await env.DB.prepare('SELECT name, bank_id FROM projects WHERE id = ?').bind(log.project_id).first() : null;
      const bankToUse = b.bank_id || log?.bank_id || proj?.bank_id || '';
      if (log && b.audit_status === 'verified' && bankToUse) {
        await syncLinkedTx(env.DB, { refSource: 'worker_log', refId: id, type: 'expense', amount: log.amount, walletId: bankToUse, date: log.date, note: `[Proyek: ${proj?.name || ''}] ${log.worker_name} - ${log.item_title}` });
      } else {
        await removeLinkedTx(env.DB, 'worker_log', id);
      }
      return json({ ok: true });
    }
    if (path.startsWith('worker-logs/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM worker_logs WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'worker_log', id);
      return json({ ok: true });
    }

    // 13. SUPERADMIN LOGIN & PROTECTED ROUTES
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
        const [members, logs, banks, settingsRows] = await Promise.all([
          env.DB.prepare('SELECT id, full_name, email, phone, role, status, last_active, created_at FROM members ORDER BY created_at DESC').all(),
          env.DB.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100').all(),
          env.DB.prepare('SELECT * FROM admin_banks ORDER BY created_at ASC').all(),
          env.DB.prepare('SELECT key, value FROM app_settings').all(),
        ]);
        const settings = {};
        for (const r of settingsRows.results || []) settings[r.key] = r.value;

        return json({
          ok: true,
          members: members.results || [],
          logs: logs.results || [],
          banks: banks.results || [],
          settings,
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
        await env.DB.prepare(
          `INSERT INTO members (id, full_name, email, phone, password_hash, role, status, last_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET full_name = excluded.full_name, email = excluded.email, phone = excluded.phone, role = excluded.role, status = excluded.status`
        ).bind(b.id, b.full_name, email, b.phone || '', passHash, b.role || 'Client', b.status || 'active').run();
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

      if (path === 'superadmin/reset-all' && method === 'POST') {
        const tables = [
          'transactions', 'wallets', 'categories', 'split_groups', 'split_rab_items',
          'split_members', 'split_installments', 'split_expenses', 'trades', 'assets',
          'debts', 'debt_payments', 'kids', 'kid_expenses', 'projects', 'worker_logs',
        ];
        for (const t of tables) await env.DB.prepare(`DELETE FROM ${t}`).run();
        return json({ ok: true });
      }
    }

    return json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Server error' }, 500);
  }
}
