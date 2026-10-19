const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('\x1b[31m[ERROR] TELEGRAM_BOT_TOKEN is missing in the .env file!\x1b[0m');
  process.exit(1);
}

// Subscriptions file path
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');

// Initialize subscribers file if not exists
if (!fs.existsSync(SUBSCRIBERS_FILE)) {
  fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify([], null, 2));
}

// Helper to get subscribers (Async)
async function getSubscribers() {
  try {
    const data = await fs.promises.readFile(SUBSCRIBERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading subscribers file:', err);
    return [];
  }
}

// Helper to add subscriber (Async)
async function addSubscriber(chatId, username, firstName) {
  const subscribers = await getSubscribers();
  if (!subscribers.some(sub => sub.chatId === chatId)) {
    subscribers.push({
      chatId,
      username: username || null,
      firstName: firstName || null,
      subscribedAt: new Date().toISOString()
    });
    await fs.promises.writeFile(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2));
    return true; // Newly added
  }
  return false; // Already subscribed
}

// Helper to remove subscriber (Async)
async function removeSubscriber(chatId) {
  const subscribers = await getSubscribers();
  const filtered = subscribers.filter(sub => sub.chatId !== chatId);
  if (filtered.length !== subscribers.length) {
    await fs.promises.writeFile(SUBSCRIBERS_FILE, JSON.stringify(filtered, null, 2));
    return true;
  }
  return false;
}

// Simple, high-performance in-memory Rate Limiter to prevent spamming /api/order
const ipRequestHistory = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 submissions per 15 minutes

function rateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  
  if (!ipRequestHistory.has(ip)) {
    ipRequestHistory.set(ip, []);
  }
  
  let timestamps = ipRequestHistory.get(ip);
  // Filter out timestamps older than the rate limit window
  timestamps = timestamps.filter(time => now - time < RATE_LIMIT_WINDOW_MS);
  
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    console.warn(`\x1b[33m[RATE LIMIT BLOCK] Too many requests from IP: ${ip}\x1b[0m`);
    return res.status(429).json({
      success: false,
      message: 'Too many order submissions. Please try again in 15 minutes.'
    });
  }
  
  // Record current request time
  timestamps.push(now);
  ipRequestHistory.set(ip, timestamps);
  next();
}

// Initialize Telegram Bot
// polling: true will activate long polling to listen for messages
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Handle bot startup and print info
bot.getMe().then((botInfo) => {
  console.log(`\x1b[32m[TELEGRAM] Bot is active: @${botInfo.username}\x1b[0m`);
  console.log(`\x1b[36m[TELEGRAM] Search @${botInfo.username} in Telegram and press /start to receive orders.\x1b[0m`);
}).catch((err) => {
  console.error('\x1b[31m[TELEGRAM-ERROR] Failed to start bot. Check your token and network connection:\x1b[0m', err.message);
});

// Bot Commands (Async-safe)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const username = msg.chat.username;
  const firstName = msg.chat.first_name;

  const isNew = await addSubscriber(chatId, username, firstName);

  let responseTextEn = '';
  let responseTextRu = '';

  if (isNew) {
    responseTextEn = `🖤 *Welcome to Loft Creative House Order Bot!*\n\nYou have successfully subscribed to order notifications! All new submissions from the website will be sent here in real-time.\n\n👤 *User:* ${firstName || 'Guest'} (${username ? '@' + username : 'No username'})\n🆔 *Chat ID:* \`${chatId}\``;
    responseTextRu = `🖤 *Добро пожаловать в Loft Creative House Order Bot!*\n\nВы успешно подписались на уведомления о заказах! Все новые заявки с сайта будут мгновенно приходить сюда.\n\n👤 *Пользователь:* ${firstName || 'Гость'} (${username ? '@' + username : 'Нет юзернейма'})\n🆔 *ID чата:* \`${chatId}\``;
  } else {
    responseTextEn = `🖤 *Loft Creative House Order Bot*\n\nYou are already subscribed to order notifications!\n\nTo stop notifications, send /stop.`;
    responseTextRu = `🖤 *Loft Creative House Order Bot*\n\nВы уже подписаны на уведомления о заказах!\n\nЧтобы отключить уведомления, отправьте /stop.`;
  }

  // Send message in both languages
  const finalResponse = `${responseTextRu}\n\n───\n\n${responseTextEn}`;

  bot.sendMessage(chatId, finalResponse, { parse_mode: 'Markdown' });
  console.log(`\x1b[35m[TELEGRAM] New command /start from chat ${chatId} (${firstName || 'Guest'})\x1b[0m`);
});

bot.onText(/\/stop/, async (msg) => {
  const chatId = msg.chat.id;
  const wasRemoved = await removeSubscriber(chatId);

  let response = '';
  if (wasRemoved) {
    response = `🖤 *Loft Creative House Bot*\n\nВы успешно отписались от уведомлений.\n\nYou have successfully unsubscribed from notifications.`;
  } else {
    response = `🖤 *Loft Creative House Bot*\n\nВы не были подписаны.\n\nYou were not subscribed.`;
  }

  bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
  console.log(`\x1b[35m[TELEGRAM] Subscriber ${chatId} unsubscribed via /stop\x1b[0m`);
});

// Help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpText = `🖤 *Loft Creative House Bot Help*\n\nCommands:\n/start - Subscribe to order notifications\n/stop - Unsubscribe from notifications\n/status - Check your subscription status`;
  bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Status command
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  const subscribers = await getSubscribers();
  const sub = subscribers.find(s => s.chatId === chatId);

  let statusMsg = '';
  if (sub) {
    statusMsg = `🖤 *Subscription Status*\n\n🟢 *Active*\nSubscribed since: \`${new Date(sub.subscribedAt).toLocaleString()}\``;
  } else {
    statusMsg = `🖤 *Subscription Status*\n\n🔴 *Not Subscribed*\nSend /start to receive order notifications.`;
  }
  bot.sendMessage(chatId, statusMsg, { parse_mode: 'Markdown' });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security middleware to prevent serving sensitive system/backend files
app.use((req, res, next) => {
  const forbiddenFiles = ['.env', 'server.js', 'subscribers.json', 'package.json', 'package-lock.json', '.gitignore'];
  const requestedFile = path.basename(req.path).toLowerCase();
  
  if (forbiddenFiles.includes(requestedFile) || req.path.startsWith('/.')) {
    console.warn(`\x1b[33m[SECURITY WARNING] Blocked unauthorized request to: ${req.path}\x1b[0m`);
    return res.status(403).send('Forbidden: Access to sensitive file is denied.');
  }
  next();
});

// Serve static assets from root folder
app.use(express.static(__dirname, { extensions: ['html'] }));

app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'order.html'));
});

// Order Submission Endpoint with custom in-memory Rate Limiter
app.post('/api/order', rateLimiter, async (req, res) => {
  let { firstName, lastName, phone, activityType, services, customActivity, message } = req.body;

  // Validate required fields
  if (!firstName || !phone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: firstName and phone are required.' 
    });
  }

  // Provide robust defaults for on-page bot or direct API calls
  activityType = activityType || 'Консультация / Бриф';
  services = services && (Array.isArray(services) ? services.length > 0 : services.trim().length > 0) 
             ? services 
             : ['Общая консультация / Бриф'];

  const subscribers = await getSubscribers();

  if (subscribers.length === 0) {
    console.warn('\x1b[33m[WARNING] Received order, but no subscribers have started the bot yet.\x1b[0m');
  }

  // Format activity type and services for the message
  const displayActivity = activityType === 'Other' && customActivity ? `${activityType} (${customActivity})` : activityType;
  const servicesList = Array.isArray(services) ? services.join(', ') : services;

  // Render Telegram Message (beautiful format)
  const tgMessage = `🔔 *НОВЫЙ ЗАКАЗ | NEW ORDER* 🔔\n` +
                    `\n` +
                    `👤 *Клиент / Client:* ${firstName} ${lastName || ''}\n` +
                    `📞 *Телефон / Phone:* \`${phone}\`\n` +
                    `🏢 *Сфера / Activity:* \`${displayActivity}\`\n` +
                    `🛠 *Услуги / Services:* \`${servicesList}\`\n` +
                    (message ? `📝 *Детали / Details:* _${message}_\n` : '') +
                    `\n` +
                    `📅 *Дата / Date:* ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })} (Dushanbe)`;

  // Send to all subscribers with self-healing block handler
  const sendPromises = subscribers.map(sub => {
    return bot.sendMessage(sub.chatId, tgMessage, { parse_mode: 'Markdown' })
      .catch(async err => {
        console.error(`Failed to send order to chat ${sub.chatId}:`, err.message);
        // If the user blocked the bot or left the chat, automatically prune their record from subscribers.json
        if (err.message.includes('403') || err.message.includes('blocked') || err.message.includes('deactivated')) {
          console.log(`\x1b[33m[PRUNING] Auto-removing inactive subscriber chatId: ${sub.chatId}\x1b[0m`);
          await removeSubscriber(sub.chatId);
        }
      });
  });

  await Promise.all(sendPromises);

  console.log(`\x1b[32m[ORDER] Order from ${firstName} received and sent to ${subscribers.length} subscribers!\x1b[0m`);

  res.status(200).json({ 
    success: true, 
    message: 'Order received and processed successfully' 
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`\x1b[32m[SERVER] Express server running on http://localhost:${PORT}\x1b[0m`);
});
