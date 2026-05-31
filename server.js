require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const crypto     = require('crypto');
const fetch      = require('node-fetch');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) { console.error('ERRO: MP_ACCESS_TOKEN nao definido'); process.exit(1); }
if (!process.env.ADMIN_KEY) { console.error('ERRO: ADMIN_KEY nao definido'); process.exit(1); }
const MP_API = 'https://api.mercadopago.com';

const DB_FILE = path.join(__dirname, 'db.json');
function readDB() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return { users: [], payments: [] }; } }
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function initDB() { if (!fs.existsSync(DB_FILE)) writeDB({ users: [], payments: [] }); }
initDB();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], credentials: false }));
app.options('*', cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const hash = (str) => crypto.createHash('sha256').update(str).digest('hex');
const genToken = () => crypto.randomBytes(32).toString('hex');

const PLANS = {
  basic: { name: 'M30 Acesso Individual', price: 29.99, id: 'basic' },
  pro:   { name: 'M30 Acesso Completo + Comunidade', price: 39.99, id: 'pro' }
};

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Dados incompletos' });
  const db = readDB();
  if (db.users.find(u => u.email === email)) return res.status(409).json({ error: 'E-mail ja cadastrado' });
  const user = { id: Date.now().toString(), name, email, password: hash(password), plan: null, paid: false, createdAt: new Date().toISOString() };
  db.users.push(user);
  writeDB(db);
  const { password: _, ...safeUser } = user;
  res.json({ ok: true, user: safeUser });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.email === email && u.password === hash(password));
  if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  const token = genToken();
  user.token = token;
  user.lastLogin = new Date().toISOString();
  writeDB(db);
  const { password: _, ...safeUser } = user;
  res.json({ ok: true, user: safeUser, token });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Nao autenticado' });
  const db = readDB();
  const user = db.users.find(u => u.token === token);
  if (!user) return res.status(401).json({ error: 'Token invalido' });
  const { password: _, ...safeUser } = user;
  res.json({ ok: true, user: safeUser });
});

app.post('/api/payment/create', async (req, res) => {
  const { plan, userEmail, userName } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Plano invalido' });
  const planData = PLANS[plan];
  const baseUrl = process.env.BASE_URL || req.headers.origin || http://localhost:${PORT};
  const preference = {
    items: [{ id: plan, title: planData.name, quantity: 1, currency_id: 'BRL', unit_price: planData.price }],
    payer: { name: userName || 'Aluno M30', email: userEmail },
    back_urls: { success: ${baseUrl}/?mp=success, failure: ${baseUrl}/?mp=failure, pending: ${baseUrl}/?mp=pending },
    auto_return: 'approved',
    external_reference: ${userEmail}|${plan}|${Date.now()},
    notification_url: ${baseUrl}/api/payment/webhook,
    expires: false
  };
  try {
    const mpRes = await fetch(${MP_API}/checkout/preferences, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': Bearer ${MP_ACCESS_TOKEN} }, body: JSON.stringify(preference) });
    const data = await mpRes.json();
    if (!mpRes.ok) return res.status(500).json({ error: 'Erro MP', detail: data });
    const db = readDB();
    db.payments.push({ preferenceId: data.id, email: userEmail, plan, status: 'pending', createdAt: new Date().toISOString() });
    writeDB(db);
    res.json({ ok: true, preferenceId: data.id, initPoint: data.init_point, sandboxInitPoint: data.sandbox_init_point });
  } catch (err) { res.status(500).json({ error: 'Erro de conexao com Mercado Pago' }); }
});

app.post('/api/payment/webhook', async (req, res) => {
  res.status(200).send('OK');
  const { type, data } = req.body;
  if (type !== 'payment') return;
  try {
    const mpRes = await fetch(${MP_API}/v1/payments/${data.id}, { headers: { 'Authorization': Bearer ${MP_ACCESS_TOKEN} } });
    const payment = await mpRes.json();
    if (payment.status === 'approved') {
      const [email, plan] = (payment.external_reference || '').split('|');
      if (!email) return;
      const db = readDB();
      const user = db.users.find(u => u.email === email);
      if (user) { user.paid = true; user.plan = plan; user.paidAt = new Date().toISOString(); user.paymentId = payment.id; }
      const pay = db.payments.find(p => p.email === email && p.status === 'pending');
      if (pay) { pay.status = 'approved'; pay.paymentId = payment.id; pay.approvedAt = new Date().toISOString(); }
      writeDB(db);
    }
  } catch (err) { console.error('Webhook error:', err); }
});

app.get('/api/payment/status', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email obrigatorio' });
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
  res.json({ paid: user.paid, plan: user.plan });
});

app.post('/api/admin/approve', (req, res) => {
  const { email, plan, adminKey } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Nao autorizado' });
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
  user.paid = true; user.plan = plan || 'pro'; user.paidAt = new Date().toISOString(); user.approvedManually = true;
  writeDB(db);
  res.json({ ok: true, message: Acesso liberado para ${email} });
});

app.get('/api/admin/users', (req, res) => {
  const { adminKey } = req.query;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Nao autorizado' });
  const db = readDB();
  const safeUsers = db.users.map(({ password, token, ...u }) => u);
  res.json({ total: safeUsers.length, users: safeUsers });
});

app.get('/api/health', (req, res) => {
  const db = readDB();
  res.json({ status: 'online', users: db.users.length, payments: db.payments.filter(p => p.status === 'approved').length, time: new Date().toISOString() });
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => { console.log(M30 rodando em http://localhost:${PORT}); });
