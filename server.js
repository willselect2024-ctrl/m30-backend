const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const ACCESS_TOKEN = 'COLE_SEU_ACCESS_TOKEN_AQUI';
const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const app = express();
app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());
app.get('/', (req, res) => { res.json({ status: 'M30 Backend ativo' }); });
app.post('/criar-preferencia', async (req, res) => {
try {
const preference = new Preference(client);
const result = await preference.create({ body: {
items: req.body.items,
payer: req.body.payer,
back_urls: req.body.back_urls,
auto_return: 'approved',
external_reference: req.body.external_reference || 'M30_' + Date.now(),
statement_descriptor: 'M30 MILIONARIOS'
}});
res.json({ id: result.id, init_point: result.init_point });
} catch (err) {
res.status(500).json({ erro: err.message });
}});
app.listen(process.env.PORT || 3000, () => console.log('M30 Backend ativo'));
