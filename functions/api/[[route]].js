// Money Flow - Cloudflare Pages Functions + D1 Full-Stack API
// Endpoint: /api/*

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

// Sinkronisasi otomatis transaksi bank pembayaran / pemasukan dari modul terkait
async function syncLinkedTx(db, { refSource, refId, type, amount, walletId, date, note }) {
  await db
    .prepare('DELETE FROM transactions WHERE ref_source = ? AND ref_id = ?')
    .bind(refSource, refId)
    .run();

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
  await db
    .prepare('DELETE FROM transactions WHERE ref_source = ? AND ref_id = ?')
    .bind(refSource, refId)
    .run();
}

async function recalcDebtTotals(db, debtId) {
  const row = await db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total_paid FROM debt_payments WHERE debt_id = ?')
    .bind(debtId)
    .first();
  const debt = await db.prepare('SELECT total_amount FROM debts WHERE id = ?').bind(debtId).first();
  if (!debt) return;
  const paid = Number(row?.total_paid || 0);
  const total = Number(debt.total_amount || 0);
  const status = paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  await db
    .prepare('UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?')
    .bind(paid, status, debtId)
    .run();
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
    return json({ ok: false, error: 'D1 Binding (DB) belum terhubung di Cloudflare.' }, 500);
  }

  try {
    // 1. HEALTH / SIGNAL CHECK
    if (path === 'health' && method === 'GET') {
      await env.DB.prepare('SELECT 1').first();
      return json({ ok: true, db: 'connected', timestamp: new Date().toISOString() });
    }

    // 2. MEMBER AUTHENTICATION & PROFILE (/api/auth/*)
    if (path === 'auth/register' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      if (!email || !b.password || !b.full_name) {
        return json({ ok: false, error: 'Nama, email, dan password wajib diisi.' }, 400);
      }
      const existing = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      if (existing) {
        return json({ ok: false, error: 'Email sudah terdaftar. Silakan masuk.' }, 409);
      }
      const id = 'mem-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      await env.DB.prepare(
        `INSERT INTO members (id, full_name, email, phone, password_hash, avatar_url, address, role, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
      )
        .bind(id, b.full_name.trim(), email, b.phone || '', passHash, b.avatar_url || '', b.address || '', b.role || 'Client')
        .run();

      const userObj = { id, full_name: b.full_name.trim(), email, phone: b.phone || '', avatar_url: b.avatar_url || '', address: b.address || '', role: b.role || 'Client' };
      const token = await signToken({ role: 'member', userId: id, email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }, env.JWT_SECRET);
      await logActivity(env.DB, b.full_name.trim(), 'Registrasi Akun Member', 'Auth & Profil', email);
      return json({ ok: true, token, user: userObj }, 201);
    }

    if (path === 'auth/login' && method === 'POST') {
      const b = await request.json();
      const email = (b.email || '').trim().toLowerCase();
      const member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first();
      if (!member) {
        return json({ ok: false, error: 'Email atau password tidak sesuai.' }, 401);
      }
      if (member.status === 'suspended') {
        return json({ ok: false, error: 'Akun Anda ditangguhkan oleh Superadmin.' }, 403);
      }
      const passHash = await sha256Hex(`${email}:${b.password}:${env.JWT_SECRET || 'mf'}`);
      if (member.password_hash && member.password_hash !== passHash) {
        return json({ ok: false, error: 'Email atau password tidak sesuai.' }, 401);
      }
      await env.DB.prepare('UPDATE members SET last_active = CURRENT_TIMESTAMP WHERE id = ?').bind(member.id).run();
      const userObj = {
        id: member.id,
        full_name: member.full_name,
        email: member.email,
        phone: member.phone || '',
        avatar_url: member.avatar_url || '',
        address: member.address || '',
        role: member.role || 'Client'
      };
      const token = await signToken({ role: 'member', userId: member.id, email: member.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 }, env.JWT_SECRET);
      await logActivity(env.DB, member.full_name, 'Login Member', 'Auth & Profil', member.email);
      return json({ ok: true, token, user: userObj });
    }

    if (path === 'auth/profile' && method === 'PUT') {
      const authHeader = request.headers.get('Authorization') || '';
      const session = await verifyToken(authHeader.replace(/^Bearer\s+/i, ''), env.JWT_SECRET);
      if (!session || !session.userId) {
        return json({ ok: false, error: 'Sesi login tidak valid.' }, 401);
      }
      const b = await request.json();
      const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(session.userId).first();
      if (!member) return json({ ok: false, error: 'Member tidak ditemukan.' }, 404);

      let newHash = member.password_hash;
      if (b.new_password && b.new_password.trim().length >= 4) {
        newHash = await sha256Hex(`${member.email}:${b.new_password.trim()}:${env.JWT_SECRET || 'mf'}`);
      }

      await env.DB.prepare(
        `UPDATE members SET full_name = ?, phone = ?, avatar_url = ?, address = ?, password_hash = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?`
      )
        .bind(
          b.full_name?.trim() || member.full_name,
          b.phone ?? member.phone,
          b.avatar_url ?? member.avatar_url,
          b.address ?? member.address,
          newHash,
          member.id
        )
        .run();

      const updated = await env.DB.prepare('SELECT id, full_name, email, phone, avatar_url, address, role FROM members WHERE id = ?').bind(member.id).first();
      await logActivity(env.DB, updated.full_name, 'Update Profil', 'Auth & Profil', updated.email);
      return json({ ok: true, user: updated });
    }

    // 3. FULL STATE SYNCHRONIZATION (/api/state)
    if (path === 'state' && method === 'GET') {
      const [
        wallets,
        categories,
        transactions,
        splitGroups,
        splitRabItems,
        splitMembers,
        splitInstallments,
        splitExpenses,
        trades,
        assets,
        debts,
        debtPayments,
        kids,
        kidExpenses,
        projects,
        workerLogs,
        settingsRows,
        banks,
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
      for (const row of settingsRows.results || []) {
        settings[row.key] = row.value;
      }

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

    // 4. WALLETS / BANK REKENING CRUD
    if (path === 'wallets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO wallets (id, name, type, account_number, account_holder, initial_balance, color, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.color || 'indigo', b.icon || 'fa-building-columns')
        .run();
      await logActivity(env.DB, 'User', 'Simpan Bank/Dompet', 'Bank & Aset', b.name);
      return json({ ok: true });
    }
    if (path.startsWith('wallets/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE wallets SET name = ?, type = ?, account_number = ?, account_holder = ?, initial_balance = ?, icon = ? WHERE id = ?`
      )
        .bind(b.name, b.type || 'bank', b.account_number || '', b.account_holder || '', Number(b.initial_balance || 0), b.icon || 'fa-building-columns', id)
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('wallets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM wallets WHERE id = ?').bind(id).run();
      await logActivity(env.DB, 'User', 'Hapus Bank/Dompet', 'Bank & Aset', id);
      return json({ ok: true });
    }

    // 5. CATEGORIES CRUD
    if (path === 'categories' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.type, b.icon || 'fa-tag', b.color || 'indigo')
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('categories/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 6. DAILY TRANSACTIONS CRUD
    if (path === 'transactions' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note, ref_source, ref_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '')`
      )
        .bind(b.id, b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '')
        .run();
      await logActivity(env.DB, 'User', `Catat ${b.type}`, 'Keuangan Harian', `Rp ${b.amount}`);
      return json({ ok: true }, 201);
    }
    if (path.startsWith('transactions/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE transactions SET type = ?, amount = ?, category_id = ?, wallet_id = ?, to_wallet_id = ?, date = ?, note = ? WHERE id = ?`
      )
        .bind(b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '', id)
        .run();
      await logActivity(env.DB, 'User', 'Edit Transaksi', 'Keuangan Harian', id);
      return json({ ok: true });
    }
    if (path.startsWith('transactions/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
      await logActivity(env.DB, 'User', 'Hapus Transaksi', 'Keuangan Harian', id);
      return json({ ok: true });
    }

    // 7. PATUNGAN FULL-STACK CRUD (RAB, Undangan Peserta, DP, Cicilan Tiap Peserta, Bank, Kategori, Status)
    if (path === 'split-groups' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_groups (id, title, category, rab_target, dp_amount, bank_id, invite_code, split_method, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.id,
          b.title,
          b.category || 'Umum',
          Number(b.rab_target || 0),
          Number(b.dp_amount || 0),
          b.bank_id || '',
          b.invite_code,
          b.split_method || 'equal',
          b.status || 'pengajuan_rab',
          b.note || ''
        )
        .run();

      if (Array.isArray(b.rab_items)) {
        for (const item of b.rab_items) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO split_rab_items (id, group_id, item_name, qty, unit_price, subtotal, status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(item.id, b.id, item.item_name, Number(item.qty || 1), Number(item.unit_price || 0), Number(item.subtotal || 0), item.status || 'diajukan')
            .run();
        }
      }

      if (Array.isArray(b.members)) {
        for (const m of b.members) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO split_members (id, group_id, name, contact, share_value, is_settled)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(m.id, b.id, m.name, m.contact || '', Number(m.share_value || 0), m.is_settled ? 1 : 0)
            .run();
        }
      }
      await logActivity(env.DB, 'User', 'Buat Pengajuan RAB Patungan', 'Patungan', `${b.title} (${b.invite_code})`);
      return json({ ok: true });
    }

    if (path.startsWith('split-groups/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE split_groups SET title = ?, category = ?, rab_target = ?, dp_amount = ?, bank_id = ?, split_method = ?, status = ?, note = ? WHERE id = ?`
      )
        .bind(
          b.title,
          b.category || 'Umum',
          Number(b.rab_target || 0),
          Number(b.dp_amount || 0),
          b.bank_id || '',
          b.split_method || 'equal',
          b.status || 'pengajuan_rab',
          b.note || '',
          id
        )
        .run();
      await logActivity(env.DB, 'User', 'Update Patungan / Status', 'Patungan', `${b.title} -> ${b.status}`);
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

    // RAB Items CRUD
    if (path === 'split-rab-items' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_rab_items (id, group_id, item_name, qty, unit_price, subtotal, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.item_name, Number(b.qty || 1), Number(b.unit_price || 0), Number(b.subtotal || 0), b.status || 'diajukan')
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('split-rab-items/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE split_rab_items SET status = ? WHERE id = ?').bind(b.status, id).run();
      return json({ ok: true });
    }
    if (path.startsWith('split-rab-items/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_rab_items WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // Split Members CRUD
    if (path === 'split-members' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_members (id, group_id, name, contact, share_value, is_settled)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0)
        .run();
      await logActivity(env.DB, b.name, 'Gabung Peserta Patungan', 'Patungan', b.group_id);
      return json({ ok: true });
    }
    if (path.startsWith('split-members/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE split_members SET name = ?, contact = ?, share_value = ?, is_settled = ? WHERE id = ?')
        .bind(b.name, b.contact || '', Number(b.share_value || 0), b.is_settled ? 1 : 0, id)
        .run();
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

    // Split Installments (DP & Cicilan Patungan Tiap Peserta -> Bank Pemasukan)
    if (path === 'split-installments' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO split_installments (id, group_id, member_id, payment_type, amount, bank_id, date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.member_id, b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '')
        .run();

      const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
      const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ?').bind(b.member_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'split_installment',
        refId: b.id,
        type: 'income',
        amount: b.amount,
        walletId: b.bank_id,
        date: b.date,
        note: `[Patungan: ${grp?.title || ''}] ${b.payment_type.toUpperCase()} - ${mem?.name || 'Peserta'}${b.note ? ' (' + b.note + ')' : ''}`,
      });
      await logActivity(env.DB, mem?.name || 'Peserta', `Bayar ${b.payment_type} Patungan`, 'Patungan', `Rp ${b.amount}`);
      return json({ ok: true });
    }

    if (path.startsWith('split-installments/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE split_installments SET payment_type = ?, amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ?`
      )
        .bind(b.payment_type || 'cicilan', Number(b.amount), b.bank_id, b.date, b.note || '', id)
        .run();

      const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
      const mem = await env.DB.prepare('SELECT name FROM split_members WHERE id = ?').bind(b.member_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'split_installment',
        refId: id,
        type: 'income',
        amount: b.amount,
        walletId: b.bank_id,
        date: b.date,
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

    // Split Expenses (Realisasi Belanja Patungan -> Bank Pembayaran)
    if (path === 'split-expenses' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO split_expenses (id, group_id, title, amount, paid_by_member_id, bank_id, date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.title, Number(b.amount), b.paid_by_member_id || '', b.bank_id || '', b.date, b.note || '')
        .run();

      if (b.bank_id) {
        const grp = await env.DB.prepare('SELECT title FROM split_groups WHERE id = ?').bind(b.group_id).first();
        await syncLinkedTx(env.DB, {
          refSource: 'split_expense',
          refId: b.id,
          type: 'expense',
          amount: b.amount,
          walletId: b.bank_id,
          date: b.date,
          note: `[Belanja Patungan: ${grp?.title || ''}] ${b.title}`,
        });
      }
      return json({ ok: true });
    }
    if (path.startsWith('split-expenses/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_expenses WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'split_expense', id);
      return json({ ok: true });
    }

    // 8. JUAL BELI (TRADES -> Bank Pemasukan / Pembayaran) CRUD
    if (path === 'trades' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO trades (id, trade_type, item_name, qty, unit_price, cost_price, total_amount, counterparty, wallet_id, payment_status, date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.id,
          b.trade_type,
          b.item_name,
          Number(b.qty || 1),
          Number(b.unit_price || 0),
          Number(b.cost_price || 0),
          Number(b.total_amount || 0),
          b.counterparty || '',
          b.wallet_id || '',
          b.payment_status || 'paid',
          b.date,
          b.note || ''
        )
        .run();

      if (b.wallet_id && b.payment_status === 'paid') {
        await syncLinkedTx(env.DB, {
          refSource: 'trade',
          refId: b.id,
          type: b.trade_type === 'sell' ? 'income' : 'expense',
          amount: b.total_amount,
          walletId: b.wallet_id,
          date: b.date,
          note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)`,
        });
      }
      await logActivity(env.DB, 'User', `Catat ${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}`, 'Jual Beli', b.item_name);
      return json({ ok: true });
    }

    if (path.startsWith('trades/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE trades SET trade_type = ?, item_name = ?, qty = ?, unit_price = ?, cost_price = ?, total_amount = ?, counterparty = ?, wallet_id = ?, payment_status = ?, date = ?, note = ? WHERE id = ?`
      )
        .bind(
          b.trade_type,
          b.item_name,
          Number(b.qty || 1),
          Number(b.unit_price || 0),
          Number(b.cost_price || 0),
          Number(b.total_amount || 0),
          b.counterparty || '',
          b.wallet_id || '',
          b.payment_status || 'paid',
          b.date,
          b.note || '',
          id
        )
        .run();

      if (b.wallet_id && b.payment_status === 'paid') {
        await syncLinkedTx(env.DB, {
          refSource: 'trade',
          refId: id,
          type: b.trade_type === 'sell' ? 'income' : 'expense',
          amount: b.total_amount,
          walletId: b.wallet_id,
          date: b.date,
          note: `[${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}] ${b.item_name} (${b.qty}x)`,
        });
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

    // 9. ASET, UTANG & RIWAYAT PEMBAYARAN HUTANG (-> Bank Pembayaran / Pemasukan) CRUD
    if (path === 'assets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO assets (id, name, category, purchase_value, current_value, bank_id, acquired_date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.category, Number(b.purchase_value || 0), Number(b.current_value || 0), b.bank_id || '', b.acquired_date || '', b.note || '')
        .run();

      if (b.bank_id && Number(b.purchase_value || 0) > 0) {
        await syncLinkedTx(env.DB, {
          refSource: 'asset',
          refId: b.id,
          type: 'expense',
          amount: b.purchase_value,
          walletId: b.bank_id,
          date: b.acquired_date || new Date().toISOString().slice(0, 10),
          note: `[Perolehan Aset] ${b.name} (${b.category})`,
        });
      }
      return json({ ok: true });
    }
    if (path.startsWith('assets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
      await removeLinkedTx(env.DB, 'asset', id);
      return json({ ok: true });
    }

    // Debts CRUD
    if (path === 'debts' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO debts (id, debt_type, person_name, title, total_amount, paid_amount, bank_id, due_date, status, note)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 'unpaid', ?)`
      )
        .bind(b.id, b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '')
        .run();
      await logActivity(env.DB, 'User', 'Catat Utang/Piutang', 'Aset & Utang', `${b.person_name} - ${b.title}`);
      return json({ ok: true });
    }

    if (path.startsWith('debts/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE debts SET debt_type = ?, person_name = ?, title = ?, total_amount = ?, bank_id = ?, due_date = ?, note = ? WHERE id = ?`
      )
        .bind(b.debt_type, b.person_name, b.title, Number(b.total_amount || 0), b.bank_id || '', b.due_date || '', b.note || '', id)
        .run();
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

    // Debt Payments History (Riwayat Pembayaran Hutang / Piutang -> Bank Pembayaran / Pemasukan) CRUD
    if (path === 'debt-payments' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO debt_payments (id, debt_id, amount, bank_id, date, note)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.debt_id, Number(b.amount), b.bank_id, b.date, b.note || '')
        .run();

      await recalcDebtTotals(env.DB, b.debt_id);
      const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ?').bind(b.debt_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'debt_payment',
        refId: b.id,
        type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
        amount: b.amount,
        walletId: b.bank_id,
        date: b.date,
        note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}${b.note ? ' (' + b.note + ')' : ''}`,
      });
      await logActivity(env.DB, 'User', 'Riwayat Pembayaran Utang/Piutang', 'Aset & Utang', `Rp ${b.amount}`);
      return json({ ok: true });
    }

    if (path.startsWith('debt-payments/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE debt_payments SET amount = ?, bank_id = ?, date = ?, note = ? WHERE id = ?`
      )
        .bind(Number(b.amount), b.bank_id, b.date, b.note || '', id)
        .run();

      await recalcDebtTotals(env.DB, b.debt_id);
      const debt = await env.DB.prepare('SELECT debt_type, person_name, title FROM debts WHERE id = ?').bind(b.debt_id).first();
      await syncLinkedTx(env.DB, {
        refSource: 'debt_payment',
        refId: id,
        type: debt?.debt_type === 'receivable' ? 'income' : 'expense',
        amount: b.amount,
        walletId: b.bank_id,
        date: b.date,
        note: `[${debt?.debt_type === 'receivable' ? 'Terima Piutang' : 'Bayar Utang'}] ${debt?.person_name || ''} - ${debt?.title || ''}${b.note ? ' (' + b.note + ')' : ''}`,
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

    // 10. BELANJA ANAK & AUDIT ORTU (-> Bank Pembayaran) CRUD
    if (path === 'kids' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO kids (id, name, daily_limit, balance, bank_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, Number(b.daily_limit || 0), Number(b.balance || 0), b.bank_id || '', b.avatar_color || 'emerald')
        .run();
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
      await env.DB.prepare(
        `INSERT INTO kid_expenses (id, kid_id, item_name, amount, category, bank_id, date, audit_status, parent_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.kid_id, b.item_name, Number(b.amount), b.category || 'Jajan', b.bank_id || '', b.date, b.audit_status || 'pending', b.parent_note || '')
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('kid-expenses/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE kid_expenses SET audit_status = ?, parent_note = ?, bank_id = ? WHERE id = ?')
        .bind(b.audit_status, b.parent_note || '', b.bank_id || '', id)
        .run();

      const exp = await env.DB.prepare('SELECT * FROM kid_expenses WHERE id = ?').bind(id).first();
      const kid = exp ? await env.DB.prepare('SELECT name, bank_id FROM kids WHERE id = ?').bind(exp.kid_id).first() : null;
      const bankToUse = b.bank_id || exp?.bank_id || kid?.bank_id || '';
      if (exp && b.audit_status === 'approved' && bankToUse) {
        await syncLinkedTx(env.DB, {
          refSource: 'kid_expense',
          refId: id,
          type: 'expense',
          amount: exp.amount,
          walletId: bankToUse,
          date: exp.date,
          note: `[Belanja Anak: ${kid?.name || ''}] ${exp.item_name}`,
        });
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

    // 11. PEKERJA & AUDIT MANDOR (-> Bank Pembayaran Proyek) CRUD
    if (path === 'projects' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO projects (id, name, foreman_name, invite_code, budget_limit, bank_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.foreman_name, b.invite_code, Number(b.budget_limit || 0), b.bank_id || '', b.status || 'active')
        .run();
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
      await env.DB.prepare(
        `INSERT INTO worker_logs (id, project_id, worker_name, item_title, category, amount, bank_id, receipt_ref, date, audit_status, foreman_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.id,
          b.project_id,
          b.worker_name,
          b.item_title,
          b.category || 'Material',
          Number(b.amount),
          b.bank_id || '',
          b.receipt_ref || '',
          b.date,
          b.audit_status || 'pending',
          b.foreman_note || ''
        )
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('worker-logs/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE worker_logs SET audit_status = ?, foreman_note = ?, bank_id = ? WHERE id = ?')
        .bind(b.audit_status, b.foreman_note || '', b.bank_id || '', id)
        .run();

      const log = await env.DB.prepare('SELECT * FROM worker_logs WHERE id = ?').bind(id).first();
      const proj = log ? await env.DB.prepare('SELECT name, bank_id FROM projects WHERE id = ?').bind(log.project_id).first() : null;
      const bankToUse = b.bank_id || log?.bank_id || proj?.bank_id || '';
      if (log && b.audit_status === 'verified' && bankToUse) {
        await syncLinkedTx(env.DB, {
          refSource: 'worker_log',
          refId: id,
          type: 'expense',
          amount: log.amount,
          walletId: bankToUse,
          date: log.date,
          note: `[Proyek: ${proj?.name || ''}] ${log.worker_name} - ${log.item_title}`,
        });
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

    // 12. SUPERADMIN LOGIN & CONSOLE (/api/superadmin/*)
    if (path === 'superadmin/login' && method === 'POST') {
      const { username, password } = await request.json();
      const validUser = env.SUPERADMIN_USER || 'superadmin';
      const validPass = env.SUPERADMIN_PASS || 'MoneyFlow#2026';

      if (username !== validUser || password !== validPass) {
        await logActivity(env.DB, username || 'unknown', 'Gagal Login Superadmin', 'Superadmin', 'Kredensial tidak cocok');
        return json({ ok: false, error: 'Username atau Password Superadmin salah.' }, 401);
      }

      const token = await signToken(
        { role: 'superadmin', user: validUser, exp: Date.now() + 1000 * 60 * 60 * 12 },
        env.JWT_SECRET
      );
      await logActivity(env.DB, validUser, 'Login Superadmin Berhasil', 'Superadmin', 'Sesi 12 jam aktif');
      return json({ ok: true, token, user: validUser });
    }

    if (path.startsWith('superadmin/')) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const session = await verifyToken(token, env.JWT_SECRET);
      if (!session || session.role !== 'superadmin') {
        return json({ ok: false, error: 'Sesi Superadmin tidak valid atau kedaluwarsa.' }, 401);
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
        )
          .bind(b.id, b.full_name, email, b.phone || '', passHash, b.role || 'Client', b.status || 'active')
          .run();
        await logActivity(env.DB, session.user, 'Kelola Member', 'Superadmin', `${b.full_name} (${email})`);
        return json({ ok: true });
      }
      if (path.startsWith('superadmin/members/') && method === 'DELETE') {
        const id = path.split('/')[2];
        await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id).run();
        await logActivity(env.DB, session.user, 'Hapus Member', 'Superadmin', id);
        return json({ ok: true });
      }

      if (path === 'superadmin/banks' && method === 'POST') {
        const b = await request.json();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO admin_banks (id, bank_name, account_number, account_holder, swift_code, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(b.id, b.bank_name, b.account_number, b.account_holder, b.swift_code || '', b.is_active ? 1 : 0)
          .run();
        await logActivity(env.DB, session.user, 'Simpan Bank Terkait', 'Superadmin', `${b.bank_name} - ${b.account_number}`);
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
          )
            .bind(k, String(v ?? ''))
            .run();
        }
        await logActivity(env.DB, session.user, 'Perbarui Pengaturan Sistem', 'Superadmin', Object.keys(updates).join(', '));
        return json({ ok: true });
      }

      if (path === 'superadmin/reset-all' && method === 'POST') {
        const tables = [
          'transactions',
          'wallets',
          'categories',
          'split_groups',
          'split_rab_items',
          'split_members',
          'split_installments',
          'split_expenses',
          'trades',
          'assets',
          'debts',
          'debt_payments',
          'kids',
          'kid_expenses',
          'projects',
          'worker_logs',
        ];
        for (const t of tables) {
          await env.DB.prepare(`DELETE FROM ${t}`).run();
        }
        await logActivity(env.DB, session.user, 'Reset Bersih Database Klien', 'Superadmin', 'Semua data transaksi dihapus');
        return json({ ok: true });
      }
    }

    return json({ ok: false, error: 'Endpoint tidak ditemukan' }, 404);
  } catch (err) {
    return json({ ok: false, error: err.message || 'Server error' }, 500);
  }
}
