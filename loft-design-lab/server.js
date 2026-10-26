const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '279223241';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Design experiments are kept out of search indexes.
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  next();
});

// Keep the original canonical host redirect ready for a later domain migration.
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host === 'loft.tj') {
    return res.redirect(301, `https://www.loft.tj${req.url}`);
  }
  next();
});

// Security middleware to prevent serving sensitive system/backend files
app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.js', 'local-server.js', 'subscribers.json', 'package.json', 'package-lock.json', '.gitignore'];
  const requestedFile = path.basename(req.path).toLowerCase();
  
  if (forbiddenFiles.includes(requestedFile) || req.path.startsWith('/.')) {
    return res.status(403).send('Forbidden: Access to sensitive file is denied.');
  }
  next();
});

// Explicit file and directory routes for reliable serving on Vercel Serverless / Node.js
app.get('/styles.css', (req, res) => {
  res.type('text/css');
  res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon');
  res.set('Cache-Control', 'public, max-age=2592000');
  res.sendFile(path.join(__dirname, 'favicon.ico'));
});

app.get('/favicon.png', (req, res) => {
  res.type('image/png');
  res.set('Cache-Control', 'public, max-age=2592000');
  res.sendFile(path.join(__dirname, 'favicon.png'));
});

app.get('/apple-touch-icon.png', (req, res) => {
  res.type('image/png');
  res.set('Cache-Control', 'public, max-age=2592000');
  res.sendFile(path.join(__dirname, 'apple-touch-icon.png'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, 'robots.txt'));
});

app.get(['/sitemap.xml', '/sitemap'], (req, res) => {
  res.header('Content-Type', 'application/xml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

app.use('/assets', express.static(path.join(__dirname, 'assets'), { maxAge: '30d' }));
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), { maxAge: '365d', immutable: true }));
app.use('/logo', express.static(path.join(__dirname, 'logo'), { maxAge: '30d' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

// Specific page routes
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'order.html'));
});

app.get('/booking-stars', (req, res) => {
  res.sendFile(path.join(__dirname, 'booking-stars.html'));
});

app.get('/production', (req, res) => {
  res.sendFile(path.join(__dirname, 'production.html'));
});

app.get('/smm', (req, res) => {
  res.sendFile(path.join(__dirname, 'smm.html'));
});

app.get('/branding', (req, res) => {
  res.sendFile(path.join(__dirname, 'branding.html'));
});

app.get('/web', (req, res) => {
  res.sendFile(path.join(__dirname, 'web.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper function to send order to Telegram via direct HTTPS (Works in Serverless and Node)
async function sendTelegramOrder(orderData) {
  const token = process.env.TELEGRAM_BOT_TOKEN || BOT_TOKEN;
  const chatIdsStr = process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;

  if (!token) {
    console.warn('[WARNING] TELEGRAM_BOT_TOKEN is missing. Order logged to console only.');
    return;
  }

  const { firstName, lastName, phone, displayActivity, servicesList, message } = orderData;

  const tgMessage = `🔔 *НОВЫЙ ЗАКАЗ | NEW ORDER* 🔔\n\n` +
    `👤 *Клиент / Client:* ${firstName} ${lastName || ''}\n` +
    `📞 *Телефон / Phone:* \`${phone}\`\n` +
    `🏢 *Сфера / Activity:* \`${displayActivity}\`\n` +
    `🛠 *Услуги / Services:* \`${servicesList}\`\n` +
    (message ? `📝 *Детали / Details:* _${message}_\n` : '') +
    `\n` +
    `📅 *Дата / Date:* ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })} (Dushanbe)`;

  const chatIds = chatIdsStr.split(',').map(id => id.trim()).filter(Boolean);

  await Promise.all(chatIds.map(async (chatId) => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: tgMessage,
          parse_mode: 'Markdown'
        })
      });
      const data = await response.json();
      if (!data.ok) {
        console.error(`Telegram API error for chat ${chatId}:`, data.description);
      }
    } catch (err) {
      console.error(`Failed to send Telegram message to chat ${chatId}:`, err.message);
    }
  }));
}

// Order Submission Endpoint (used by both /order form and Loft AI Assistant)
app.post('/api/order', async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    let { firstName, lastName, phone, activityType, services, customActivity, message } = body || {};

    if (!firstName || !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: firstName and phone are required.' 
      });
    }

    activityType = activityType || 'Консультация / Бриф';
    services = services && (Array.isArray(services) ? services.length > 0 : services.trim().length > 0) 
               ? services 
               : ['Общая консультация / Бриф'];

    const displayActivity = activityType === 'Other' && customActivity ? `${activityType} (${customActivity})` : activityType;
    const servicesList = Array.isArray(services) ? services.join(', ') : services;

    // Send order via Telegram API
    await sendTelegramOrder({ firstName, lastName, phone, displayActivity, servicesList, message });

    console.log(`[ORDER] Received order from ${firstName} (${phone})`);

    return res.status(200).json({ 
      success: true, 
      message: 'Order received and processed successfully' 
    });
  } catch (err) {
    console.error('[API ERROR] /api/order failed:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error processing order' 
    });
  }
});

// Chat API Endpoint (powers Loft AI Assistant)
const chatHandler = require('./api/chat');
app.post('/api/chat', (req, res) => {
  return chatHandler(req, res);
});

// Start local listener only outside of Vercel and when executed directly
if (require.main === module && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`[SERVER] Express running on http://localhost:${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;
