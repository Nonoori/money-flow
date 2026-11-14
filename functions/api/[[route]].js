export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const method = request.method;

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  if (method === 'OPTIONS') return json({ ok: true });

  try {
    if (path === 'state' && method === 'GET') {
      const [wallets, categories, budgets, transactions] = await Promise.all([
        env.DB.prepare('SELECT * FROM wallets ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM categories ORDER BY created_at ASC').all(),
        env.DB.prepare('SELECT * FROM budgets').all(),
        env.DB.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC').all(),
      ]);
      return json({
        wallets: wallets.results,
        categories: categories.results,
        budgets: budgets.results,
        transactions: transactions.results,
      });
    }

    if (path === 'transactions' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO transactions (id, type, amount, category_id, wallet_id, to_wallet_id, date, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.id, b.type, b.amount, b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '').run();
      return json({ success: true, id: b.id }, 201);
    }

    if (path.startsWith('transactions/') && method === 'PUT') {
      const id = path.split('/')[1];
      const b = await request.json();
      await env.DB.prepare(
        `UPDATE transactions SET type=?, amount=?, category_id=?, wallet_id=?, to_wallet_id=?, date=?, note=? WHERE id=?`
      ).bind(b.type, b.amount, b.category_id || null, b.wallet_id, b.to_wallet_id || null, b.date, b.note || '', id).run();
      return json({ success: true });
    }

    if (path.startsWith('transactions/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
      return json({ success: true });
    }

    if (path === 'wallets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO wallets (id, name, type, initial_balance, color, icon) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(b.id, b.name, b.type, b.initial_balance || 0, b.color || 'indigo', b.icon || 'fa-wallet').run();
      return json({ success: true });
    }

    if (path.startsWith('wallets/') && method === 'DELETE') {
      const id = path.split('/')[1];
      await env.DB.prepare('DELETE FROM wallets WHERE id = ?').bind(id).run();
      return json({ success: true });
    }

    if (path === 'budgets' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT INTO budgets (id, category_id, month, limit_amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(category_id, month) DO UPDATE SET limit_amount = excluded.limit_amount`
      ).bind(b.id, b.category_id, b.month, b.limit_amount).run();
      return json({ success: true });
    }

    if (path === 'categories' && method === 'POST') {
      const b = await request.json();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO categories (id, name, type, icon, color) VALUES (?, ?, ?, ?, ?)`
      ).bind(b.id, b.name, b.type, b.icon, b.color).run();
      return json({ success: true });
    }

    return json({ error: 'Endpoint tidak ditemukan' }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
