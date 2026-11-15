// Money Flow - Cloudflare Pages Functions + D1 Full-Stack API
// Endpoint: /api/*

async function signToken(payload, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'moneyflow-default-secret-change-in-env'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = btoa(JSON.stringify(payload));
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
    const payload = JSON.parse(atob(data));
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
    // 1. Health / Signal Check
    if (path === 'health' && method === 'GET') {
      await env.DB.prepare('SELECT 1').first();
      return json({
        ok: true,
        db: 'connected',
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Full State Sync (Client App)
    if (path === 'state' && method === 'GET') {
      const [
        wallets,
        categories,
        transactions,
        splitGroups,
        splitMembers,
        splitExpenses,
        trades,
        assets,
        debts,
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
        env.DB.prepare('SELECT * FROM split_members ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM split_expenses ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM trades ORDER BY date DESC, created_at DESC').all(),
        env.DB.prepare('SELECT * FROM assets ORDER BY created_at DESC').all(),
        env.DB.prepare('SELECT * FROM debts ORDER BY created_at DESC').all(),
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
        splitMembers: splitMembers.results || [],
        splitExpenses: splitExpenses.results || [],
        trades: trades.results || [],
        assets: assets.results || [],
        debts: debts.results || [],
        kids: kids.results || [],
        kidExpenses: kidExpenses.results || [],
        projects: projects.results || [],
        workerLogs: workerLogs.results || [],
        settings,
        banks: banks.results || [],
      });
    }

    // 3. WALLETS CRUD
    if (path === 'wallets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO wallets (id, name, type, account_number, initial_balance, color, icon)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.type || 'bank', b.account_number || '', Number(b.initial_balance || 0), b.color || 'indigo', b.icon || 'fa-wallet')
        .run();
      await logActivity(env.DB, 'User', 'Simpan Dompet', 'Aset & Bank', b.name);
      return json({ ok: true });
    }
    if (path.startsWith('wallets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM wallets WHERE id = ?').bind(id).run();
      await logActivity(env.DB, 'User', 'Hapus Dompet', 'Aset & Bank', id);
      return json({ ok: true });
    }

    // 4. CATEGORIES CRUD
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

    // 5. DAILY TRANSACTIONS CRUD
    if (path === 'transactions' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.type, Number(b.amount), b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '')
        .run();
      await logActivity(env.DB, 'User', `Tambah ${b.type}`, 'Keuangan Harian', `Rp ${b.amount}`);
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

    // 6. PATUNGAN (SPLIT BILL & INVITATIONS) CRUD
    if (path === 'split-groups' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_groups (id, title, invite_code, split_method, status) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.title, b.invite_code, b.split_method || 'equal', b.status || 'active')
        .run();
      if (Array.isArray(b.members)) {
        for (const m of b.members) {
          await env.DB.prepare(
            `INSERT OR REPLACE INTO split_members (id, group_id, name, share_value, is_settled) VALUES (?, ?, ?, ?, ?)`
          )
            .bind(m.id, b.id, m.name, Number(m.share_value || 0), m.is_settled ? 1 : 0)
            .run();
        }
      }
      await logActivity(env.DB, 'User', 'Buat Grup Patungan', 'Patungan', `${b.title} (${b.invite_code})`);
      return json({ ok: true });
    }
    if (path.startsWith('split-groups/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_groups WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_members WHERE group_id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM split_expenses WHERE group_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (path === 'split-members' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO split_members (id, group_id, name, share_value, is_settled) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.name, Number(b.share_value || 0), b.is_settled ? 1 : 0)
        .run();
      await logActivity(env.DB, b.name, 'Gabung Undangan Patungan', 'Patungan', b.group_id);
      return json({ ok: true });
    }
    if (path.startsWith('split-members/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE split_members SET is_settled = ?, share_value = ? WHERE id = ?')
        .bind(b.is_settled ? 1 : 0, Number(b.share_value || 0), id)
        .run();
      return json({ ok: true });
    }
    if (path === 'split-expenses' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO split_expenses (id, group_id, title, amount, paid_by_member_id, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.group_id, b.title, Number(b.amount), b.paid_by_member_id, b.date, b.note || '')
        .run();
      await logActivity(env.DB, 'User', 'Catat Biaya Patungan', 'Patungan', `${b.title}: Rp ${b.amount}`);
      return json({ ok: true });
    }
    if (path.startsWith('split-expenses/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM split_expenses WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 7. JUAL BELI (TRADES) CRUD
    if (path === 'trades' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO trades (id, trade_type, item_name, qty, unit_price, cost_price, total_amount, counterparty, wallet_id, payment_status, date, note)
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
          b.wallet_id || null,
          b.payment_status || 'paid',
          b.date,
          b.note || ''
        )
        .run();
      await logActivity(env.DB, 'User', `Catat ${b.trade_type === 'sell' ? 'Penjualan' : 'Pembelian'}`, 'Jual Beli', b.item_name);
      return json({ ok: true });
    }
    if (path.startsWith('trades/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM trades WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 8. ASET & UTANG CRUD
    if (path === 'assets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO assets (id, name, category, purchase_value, current_value, acquired_date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.category, Number(b.purchase_value || 0), Number(b.current_value || 0), b.acquired_date || '', b.note || '')
        .run();
      await logActivity(env.DB, 'User', 'Simpan Aset', 'Aset & Bank', b.name);
      return json({ ok: true });
    }
    if (path.startsWith('assets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    if (path === 'debts' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO debts (id, debt_type, person_name, title, total_amount, paid_amount, due_date, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.id,
          b.debt_type,
          b.person_name,
          b.title,
          Number(b.total_amount || 0),
          Number(b.paid_amount || 0),
          b.due_date || '',
          b.status || 'unpaid',
          b.note || ''
        )
        .run();
      await logActivity(env.DB, 'User', 'Simpan Utang/Piutang', 'Aset & Bank', `${b.person_name} - ${b.title}`);
      return json({ ok: true });
    }
    if (path.startsWith('debts/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?')
        .bind(Number(b.paid_amount || 0), b.status || 'unpaid', id)
        .run();
      return json({ ok: true });
    }
    if (path.startsWith('debts/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM debts WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 9. BELANJA ANAK & AUDIT ORTU CRUD
    if (path === 'kids' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO kids (id, name, daily_limit, balance, avatar_color) VALUES (?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, Number(b.daily_limit || 0), Number(b.balance || 0), b.avatar_color || 'emerald')
        .run();
      await logActivity(env.DB, 'Ortu', 'Simpan Profil Anak', 'Belanja Anak', b.name);
      return json({ ok: true });
    }
    if (path.startsWith('kids/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM kids WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM kid_expenses WHERE kid_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (path === 'kid-expenses' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO kid_expenses (id, kid_id, item_name, amount, category, date, audit_status, parent_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.kid_id, b.item_name, Number(b.amount), b.category || 'Jajan', b.date, b.audit_status || 'pending', b.parent_note || '')
        .run();
      await logActivity(env.DB, 'Anak', 'Catat Belanja Anak', 'Belanja Anak', `${b.item_name} (Rp ${b.amount})`);
      return json({ ok: true });
    }
    if (path.startsWith('kid-expenses/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE kid_expenses SET audit_status = ?, parent_note = ? WHERE id = ?')
        .bind(b.audit_status, b.parent_note || '', id)
        .run();
      await logActivity(env.DB, 'Ortu', `Audit Belanja Anak: ${b.audit_status}`, 'Belanja Anak', id);
      return json({ ok: true });
    }
    if (path.startsWith('kid-expenses/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM kid_expenses WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 10. PEKERJA & AUDIT MANDOR CRUD
    if (path === 'projects' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO projects (id, name, foreman_name, invite_code, budget_limit, status) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(b.id, b.name, b.foreman_name, b.invite_code, Number(b.budget_limit || 0), b.status || 'active')
        .run();
      await logActivity(env.DB, b.foreman_name, 'Buat Proyek Mandor', 'Audit Mandor', `${b.name} (${b.invite_code})`);
      return json({ ok: true });
    }
    if (path.startsWith('projects/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
      await env.DB.prepare('DELETE FROM worker_logs WHERE project_id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (path === 'worker-logs' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO worker_logs (id, project_id, worker_name, item_title, category, amount, receipt_ref, date, audit_status, foreman_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          b.id,
          b.project_id,
          b.worker_name,
          b.item_title,
          b.category || 'Material',
          Number(b.amount),
          b.receipt_ref || '',
          b.date,
          b.audit_status || 'pending',
          b.foreman_note || ''
        )
        .run();
      await logActivity(env.DB, b.worker_name, 'Input Laporan Pekerja', 'Audit Mandor', `${b.item_title} (Rp ${b.amount})`);
      return json({ ok: true });
    }
    if (path.startsWith('worker-logs/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare('UPDATE worker_logs SET audit_status = ?, foreman_note = ? WHERE id = ?')
        .bind(b.audit_status, b.foreman_note || '', id)
        .run();
      await logActivity(env.DB, 'Mandor', `Audit Pekerja: ${b.audit_status}`, 'Audit Mandor', id);
      return json({ ok: true });
    }
    if (path.startsWith('worker-logs/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM worker_logs WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }

    // 11. SUPERADMIN LOGIN & PROTECTED ROUTES (/api/superadmin/*)
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
          env.DB.prepare('SELECT * FROM members ORDER BY created_at DESC').all(),
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
        await env.DB.prepare(
          `INSERT OR REPLACE INTO members (id, full_name, email, role, status, last_active)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        )
          .bind(b.id, b.full_name, b.email, b.role || 'Client', b.status || 'active')
          .run();
        await logActivity(env.DB, session.user, 'Kelola Member', 'Superadmin', `${b.full_name} (${b.email})`);
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
          'split_members',
          'split_expenses',
          'trades',
          'assets',
          'debts',
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
