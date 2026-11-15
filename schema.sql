-- Money Flow - Cloudflare D1 (SQLite) Production Schema
-- Bersih tanpa data dummy. Mendukung Full-Stack CRUD & Sinkronisasi Bank Pembayaran/Pemasukan.

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  password_hash TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  address TEXT DEFAULT '',
  role TEXT DEFAULT 'Client',
  status TEXT DEFAULT 'active',
  last_active TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',
  account_number TEXT DEFAULT '',
  account_holder TEXT DEFAULT '',
  initial_balance INTEGER DEFAULT 0,
  color TEXT DEFAULT 'indigo',
  icon TEXT DEFAULT 'fa-building-columns',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT NOT NULL DEFAULT 'fa-tag',
  color TEXT NOT NULL DEFAULT 'indigo',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount INTEGER NOT NULL,
  category_id TEXT,
  wallet_id TEXT NOT NULL,
  to_wallet_id TEXT,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  ref_source TEXT DEFAULT '',
  ref_id TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_groups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'Umum',
  rab_target INTEGER DEFAULT 0,
  dp_amount INTEGER DEFAULT 0,
  bank_id TEXT DEFAULT '',
  invite_code TEXT UNIQUE NOT NULL,
  split_method TEXT DEFAULT 'equal',
  status TEXT DEFAULT 'pengajuan_rab',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_rab_items (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  qty INTEGER DEFAULT 1,
  unit_price INTEGER NOT NULL,
  subtotal INTEGER NOT NULL,
  status TEXT DEFAULT 'diajukan',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT DEFAULT '',
  share_value REAL DEFAULT 0,
  is_settled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_installments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  payment_type TEXT DEFAULT 'cicilan' CHECK (payment_type IN ('dp', 'cicilan', 'pelunasan')),
  amount INTEGER NOT NULL,
  bank_id TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_by_member_id TEXT DEFAULT '',
  bank_id TEXT DEFAULT '',
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('sell', 'buy')),
  item_name TEXT NOT NULL,
  qty INTEGER DEFAULT 1,
  unit_price INTEGER NOT NULL,
  cost_price INTEGER DEFAULT 0,
  total_amount INTEGER NOT NULL,
  counterparty TEXT DEFAULT '',
  wallet_id TEXT NOT NULL,
  payment_status TEXT DEFAULT 'paid',
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  purchase_value INTEGER DEFAULT 0,
  current_value INTEGER DEFAULT 0,
  bank_id TEXT DEFAULT '',
  acquired_date TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  debt_type TEXT NOT NULL CHECK (debt_type IN ('payable', 'receivable')),
  person_name TEXT NOT NULL,
  title TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  paid_amount INTEGER DEFAULT 0,
  bank_id TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  status TEXT DEFAULT 'unpaid',
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bank_id TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kids (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  daily_limit INTEGER DEFAULT 0,
  balance INTEGER DEFAULT 0,
  bank_id TEXT DEFAULT '',
  avatar_color TEXT DEFAULT 'emerald',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kid_expenses (
  id TEXT PRIMARY KEY,
  kid_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category TEXT DEFAULT 'Jajan',
  bank_id TEXT DEFAULT '',
  date TEXT NOT NULL,
  audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'approved', 'clarify', 'rejected')),
  parent_note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  foreman_name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  budget_limit INTEGER DEFAULT 0,
  bank_id TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS worker_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  item_title TEXT NOT NULL,
  category TEXT DEFAULT 'Material',
  amount INTEGER NOT NULL,
  bank_id TEXT DEFAULT '',
  receipt_ref TEXT DEFAULT '',
  date TEXT NOT NULL,
  audit_status TEXT DEFAULT 'pending' CHECK (audit_status IN ('pending', 'verified', 'revision', 'rejected')),
  foreman_note TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_banks (
  id TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  swift_code TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_ref ON transactions(ref_source, ref_id);
CREATE INDEX IF NOT EXISTS idx_split_inst_grp ON split_installments(group_id);
CREATE INDEX IF NOT EXISTS idx_split_inst_mem ON split_installments(member_id);
CREATE INDEX IF NOT EXISTS idx_debt_pay_debt ON debt_payments(debt_id);
CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date);
CREATE INDEX IF NOT EXISTS idx_kid_exp_kid ON kid_expenses(kid_id);
CREATE INDEX IF NOT EXISTS idx_worker_proj ON worker_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
