// Vercel Serverless Function: POST /api/order
// Delivers leads from both /order page and the Loft AI Assistant directly to Telegram

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

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

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_IDS_STR = process.env.TELEGRAM_CHAT_ID || '279223241'; // Defaults to Leonid (@MaybeU)

    if (!BOT_TOKEN) {
      console.error('[ERROR] TELEGRAM_BOT_TOKEN is not configured on Vercel!');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Telegram bot token is missing.'
      });
    }

    activityType = activityType || 'Консультация / Бриф';
    services = services && (Array.isArray(services) ? services.length > 0 : services.trim().length > 0)
      ? services
      : ['Общая консультация / Бриф'];

    const displayActivity = activityType === 'Other' && customActivity ? `${activityType} (${customActivity})` : activityType;
    const servicesList = Array.isArray(services) ? services.join(', ') : services;

    const tgMessage = `🔔 *НОВЫЙ ЗАКАЗ | NEW ORDER* 🔔\n\n` +
      `👤 *Клиент / Client:* ${firstName} ${lastName || ''}\n` +
      `📞 *Телефон / Phone:* \`${phone}\`\n` +
      `🏢 *Сфера / Activity:* \`${displayActivity}\`\n` +
      `🛠 *Услуги / Services:* \`${servicesList}\`\n` +
      (message ? `📝 *Детали / Details:* _${message}_\n` : '') +
      `\n` +
      `📅 *Дата / Date:* ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Dushanbe' })} (Dushanbe)`;

    const chatIds = CHAT_IDS_STR.split(',').map(id => id.trim()).filter(Boolean);

    const sendPromises = chatIds.map(async (chatId) => {
      const tgUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
      const response = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: tgMessage,
          parse_mode: 'Markdown'
        })
      });
      const result = await response.json();
      if (!result.ok) {
        console.error(`Telegram API error for chat ${chatId}:`, result.description);
      }
      return result;
    });

    await Promise.all(sendPromises);

    return res.status(200).json({
      success: true,
      message: 'Order received and processed successfully'
    });
  } catch (error) {
    console.error('[API ERROR] /api/order failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing order'
    });
  }
};
