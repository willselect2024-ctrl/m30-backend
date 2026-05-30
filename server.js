const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
const app = express();

app.use(cors({ origin: '*', methods: ['POST', 'GET', 'OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// ── Rota de teste ──
app.get('/', (req, res) => {
  res.json({ status: 'M30 Backend ativo', versao: '2.0' });
});

// ── Criar preferência (checkout normal) ──
app.post('/criar-preferencia', async (req, res) => {
  try {
    const preference = new Preference(client);
    const result = await preference.create({ body: {
      items: req.body.items,
      payer: req.body.payer,
      back_urls: req.body.back_urls,
      auto_return: 'approved',
      external_reference: req.body.external_reference,
      statement_descriptor: 'M30 MILIONARIOS',
    }});
    res.json(result);
  } catch (err) {
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

// ── Gerar Pix ──
app.post('/gerar-pix', async (req, res) => {
  try {
    const { nome, email, cpf, valor, plano } = req.body;

    const payment = new Payment(client);
    const result = await payment.create({ body: {
      transaction_amount: parseFloat(valor),
      description: M30 Milionários — ${plano},
      payment_method_id: 'pix',
      payer: {
        email: email,
        first_name: nome.split(' ')[0],
        last_name: nome.split(' ').slice(1).join(' ') || 'M30',
        identification: {
          type: 'CPF',
          number: cpf.replace(/\D/g, '')
        }
      },
      external_reference: m30_${Date.now()},
      statement_descriptor: 'M30 MILIONARIOS',
      notification_url: 'https://m30-backend.onrender.com/webhook',
    }});

    res.json({
      id: result.id,
      status: result.status,
      qr_code: result.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
      valor: result.transaction_amount,
    });

  } catch (err) {
    console.error('Erro Pix:', err);
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

// ── Verificar status do pagamento ──
app.get('/verificar-pagamento/:id', async (req, res) => {
  try {
    const payment = new Payment(client);
    const result = await payment.get({ id: req.params.id });
    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      valor: result.transaction_amount,
    });
  } catch (err) {
    res.status(500).json({ erro: true, mensagem: err.message });
  }
});

// ── Webhook Mercado Pago ──
app.post('/webhook', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment' && data?.id) {
      const payment = new Payment(client);
      const result = await payment.get({ id: data.id });
      console.log(Pagamento ${data.id}: ${result.status});
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook erro:', err);
    res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(M30 Backend rodando na porta ${PORT}));