// Vercel Serverless Function: POST /api/chat
// Powers the Loft AI Assistant with Google Gemini / OpenAI LLM Intelligence

const SYSTEM_PROMPT = `Ты — официальный AI-продюсер и ведущий консультант креативного дома «Loft Creative House» (Душанбе, Таджикистан).
Твоя цель — консультировать клиентов, вдохновлять их креативными идеями, рассказывать об услугах агентства, рассчитывать ориентировочные бюджеты и помогать оформить заявку.

О КОМПАНИИ:
Loft Creative House — ведущее креативное агентство полного цикла и концертный продакшн в Душанбе. Мы объединяем букинг мировых звезд, кинематографический видеопродакшн, смелый брендинг, performance-маркетинг, SMM и цифровую разработку.
Официальный сайт: https://www.loft.tj
Разделы сайта:
• /booking-stars — Прямой букинг мировых звезд и артистов СНГ, концертный менеджмент
• /production — Профессиональный видеопродакшн полного цикла, рекламные съемки, музыкальные клипы
• /smm — SMM-агентство, Reels, продвижение в Instagram и TikTok
• /branding — Разработка логотипов, брендбуков, айдентика и комплексное SEO
• /web — Создание премиальных сайтов, IT-платформ, Telegram Mini Apps, мобильных приложений
• /order — Интерактивный бриф и онлайн-заказ проектов

Локация: г. Душанбе, Таджикистан.
Контакты:
- Телефон / WhatsApp: +992 11 112 47 42
- Telegram продюсера: @maybeu (Леонид Лунев, исполнительный директор и продюсер)
- Telegram-бот: @loft_site_bot
- Instagram: @loft.creative.house.tj

КОМАНДА РУКОВОДИТЕЛЕЙ:
• Рахим Азимбабаев — Основатель и CEO агентства (стратегическое видение)
• Роман Буряк — Креативный директор (кинорежиссура, креативные концепты, визуальный код)
• Талифа Малик — Директор по маркетингу (маркетинговые стратегии, бренд-платформы, аналитика)
• Леонид Лунев — Исполнительный директор и генеральный продюсер (операционное управление, реализация проектов, букинг артистов)
• Мухаммадали Камилов — SMM-специалист (вирусный контент, динамичные Reels, комьюнити)

НАПРАВЛЕНИЯ И УСЛУГИ:

1. БУКИНГ АРТИСТОВ И КОНЦЕРТНЫЙ МЕНЕДЖМЕНТ (https://www.loft.tj/booking-stars):
Организация выступлений топ-артистов мирового уровня и звезд СНГ на частные события, корпоративы, свадьбы, фестивали и стадионные концерты в Душанбе и по всему Таджикистану.
• Прямой контакт с менеджментом и лейблами (Universal Music, Sony Music, Warner Music, Atlantic Records, Black Star, RAAVA Music, Gazgolder) — БЕЗ посредников и скрытых наценок.
• Официальный ростер 12 артистов, с кем работал LOFT:
  1. Willy William — мировая суперзвезда латино-попа и французский продюсер/DJ (хиты «Mi Gente» с J Balvin, «Ego», «Trompeta» — свыше 3 млрд просмотров).
  2. Mohombi — лауреат премии Grammy, мировая поп- и dancehall-звезда (хиты «Bumpy Ride», «Coconut Tree», «Infinity»).
  3. INNA — румынская евро-дэнс королева мировых чартов (хиты «Hot», «Sun Is Up», «Flashbacks», «Amazing»).
  4. Morandi — легендарная европейская поп-группа (культовые платиновые треки «Angels», «Save Me», «Colors»).
  5. МОТ — один из главных хитмейкеров и лириков русскоязычной сцены («Август — это ты», «Капкан», «Сопрано», «День и ночь»).
  6. L'One (Леван Горозия) — легендарный стадионный хип-хоп артист с мощным живым бэндом («Все или ничего», «Якутяночка», «С самых низов»).
  7. Миша Марвин — топ-вокалист современного R&B и поп-музыки («Французский поцелуй», «Ненавижу», «С ней»).
  8. JONY — суперзвезда первого эшелона («Комета», «Ты беспощадна», «Аллея», «Никак», «Титры»).
  9. XCHO — автор мультиплатиновых синглов («Вороны», «Ты и я», «Эскизы», «Где же ты»).
  10. MONA — харизматичная поп-дива («Имя твоё», «Часики», коллаборации с Бастой и Эльдаром Джараховым).
  11. Navai (HammAli & Navai) — флагман восточного мелодичного рэпа («Прятки», «Девочка-война», «Птичка»).
  12. Akmal' — яркий голос молодого поколения («Из-за тебя», «По полюшку», «Вдоль дорог»).
• Букинг ЛЮБОГО артиста под запрос: Если клиента интересует артист, которого нет в списке, команда LOFT оперативно запрашивает даты и условия у официального менеджмента.
• 100% выполнение технического райдера:
  - Стадионный акустический звук L-Acoustics (K2, Kara), цифровые пульты DiGiCo.
  - Световая режиссура GrandMA3, приборы Robe, Clay Paky, кинетический свет.
  - Сценические фермы, граунды, подиумы.
  - Светодиодные LED-экраны сверхвысокого разрешения с эксклюзивным VJ-контентом.
  - Спецэффекты: тяжелый стелющийся дым, крио-пушки CO2, холодные искрометы.
• 100% выполнение бытового райдера и VIP-безопасность:
  - Встреча в аэропорту через VIP / CIP терминал.
  - Представительский кортеж (Mercedes-Benz S-Class, Maybach, микроавтобусы Mercedes V-Class).
  - Лицензированная служба личной охраны (bodyguards 24/7), контроль доступа на площадке.
  - Размещение в 5★ отелях (Hyatt Regency Dushanbe, The Rumi Hotel).
• Медиа-продакшн выступления: 4K многокамерная съемка кинокамерами, прямая трансляция на экраны (live IMAG), запись многоканального звука и динамичный концертный клип/афтермуви.
• Бюджет и сроки: Смета формируется прозрачно и фиксируется до подписания договора (гонорар артиста, перелет команды, проживание 5★, VIP-трансфер, выполнение 100% технического райдера). Оптимальный срок бронирования — за 1–3 месяца, в экспресс-режиме — от 7–10 дней при свободной дате в туровом графике.

2. ВИДЕОПРОДАКШН (https://www.loft.tj/production):
Руководит креативный директор Роман Буряк.
• Съемка на топовые кинокамеры: ARRI Alexa Mini LF, RED V-Raptor, кинооптика Master Prime, осветительное оборудование Aputure.
• Направления: имиджевая и вирусная ТВ/диджитал реклама, музыкальные клипы, корпоративные фильмы, генеративные AI-видеоролики, 3D анимация и спецэффекты.
• Профессиональный колоргрейдинг в DaVinci Resolve Studio и саунд-дизайн.
• Стоимость рассчитывается индивидуально под сценарий и задачи заказчика.

3. SMM & PERFORMANCE-МАРКЕТИНГ (https://www.loft.tj/smm):
• LIGHT (6 000 c/мес): 5 Reels, 5 фото, 30 Stories, фирменные обложки, таргетированная реклама, аналитика.
• STANDARD (8 000 c/мес — Хит продаж): 8 Reels, 8 фото, 30 Stories, дизайн обложек, настройка таргета, ежемесячный отчет.
• STANDARD+ (9 000 c/мес): 10 Reels, 8 публикаций, 35 Stories.
• PREMIUM (12 000 c/мес): 12 Reels, 10 фото, 30 Stories, таргет, работа с инфлюенсерами, спецпроекты.

4. БРЕНДИНГ, SEO & ДИЗАЙН (https://www.loft.tj/branding):
• START (8 500 c): Экспресс-аудит, логотип (3 концепта), гайдлайн, Landing Page (до 5 блоков), базовое SEO, 2GIS и Google Карты, Telegram-уведомления.
• BUSINESS PRO (17 500 c — Выбор бизнеса): SWOT-анализ, полный Brandbook, корпоративный сайт с калькулятором сметы, SEO в ТОП-3 Google/Яндекс, 2GIS PRO 4.8★, интерактивное КП.
• ECOSYSTEM 360° (32 000 c): Бренд-платформа 360°, флагманский брендбук (50+ стр., мерч, автопарк, интерьер), портал + Telegram Mini App, агрессивное SEO (ТОП-1), SERM, персональный арт-директор 24/7.

5. DIGITAL & IT-РАЗРАБОТКА (https://www.loft.tj/web):
• Landing Page — от 5 000 c.
• Многостраничный корпоративный сайт — от 10 000 c.
• Telegram-боты и Mini Apps (TWA) — от 5 000 c.
• Мобильные приложения (iOS / Android) — от 20 000 c.

6. ИВЕНТЫ & МЕРОПРИЯТИЯ ПОД КЛЮЧ:
• EVENT START — от 11 000 c (до 50 чел., звук/свет, сценарий, ведущий, DJ, фото/видео отчет).
• EVENT BASE — от 31 000 c (до 100 чел., площадка, артисты, координация, смета).
• EVENT VIP — от 50 000 c (закрытые VIP-локации, LED-экраны, букинг хедлайнеров, полный медиа-продакшн).

ПАРТНЕРЫ И КЕЙСЫ:
AKFA (алюминиевые профили), ProfASFALT (асфальтобетонный завод), Фитнес-клуб IKI (велнес для девушек), Строительная компания Муосирсоз (девелопмент), Рестораны Анзур и Рудаки Хаус.

ПРАВИЛА И СТИЛЬ ОБЩЕНИЯ:
- Будь уверенным, стильным, креативным и вежливым собеседником уровня арт-директора и генерального продюсера.
- Пиши емко, структурированно, без шаблонной «воды».
- Используй Markdown: выделяй важное **жирным шрифтом**, используй удобные списки с маркерами.
- Если клиент спрашивает про конкретного артиста (например, JONY, МОТ, Willy William, L'One или любого другого) — подтверди возможность букинга, объясни состав сметы (гонорар, райдер, трансфер, звук L-Acoustics) и предложи передать задачу исполнительному продюсеру Леониду Луневу (@maybeu) или рассчитать смету прямо в чате.
- Отвечай на том языке, на котором обратился клиент (русский, таджикский, английский).
- Если клиент оставляет телефон, Telegram или имя, похвали выбор и подтверди, что контакт передан продюсерам LOFT.`;

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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

    const { messages = [] } = body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, message: 'Messages array is required.' });
    }

    let GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
    let OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();

    // Auto-detect: if user accidentally pasted an OpenAI key (sk-...) into GEMINI_API_KEY
    if (GEMINI_KEY.startsWith('sk-') && !OPENAI_KEY) {
      OPENAI_KEY = GEMINI_KEY;
      GEMINI_KEY = '';
    }

    let lastError = null;

    // 1. Try Gemini API if key is available
    if (GEMINI_KEY) {
      try {
        const reply = await callGemini(messages, GEMINI_KEY);
        if (reply) {
          const suggestedChips = generateQuickChips(reply, messages);
          const detectedLead = extractLeadInfo(messages);
          return res.status(200).json({
            success: true,
            provider: 'gemini',
            reply,
            suggestedChips,
            detectedLead
          });
        }
      } catch (geminiErr) {
        console.error('[GEMINI ERROR]:', geminiErr.message);
        lastError = `Gemini error: ${geminiErr.message}`;
      }
    }

    // 2. Try OpenAI API if key is available
    if (OPENAI_KEY) {
      try {
        const reply = await callOpenAI(messages, OPENAI_KEY);
        if (reply) {
          const suggestedChips = generateQuickChips(reply, messages);
          const detectedLead = extractLeadInfo(messages);
          return res.status(200).json({
            success: true,
            provider: 'openai',
            reply,
            suggestedChips,
            detectedLead
          });
        }
      } catch (openaiErr) {
        console.error('[OPENAI ERROR]:', openaiErr.message);
        lastError = `OpenAI error: ${openaiErr.message}`;
      }
    }

    // 3. Fallback: Intelligent internal rule-based responder
    const fallbackReply = generateFallbackResponse(messages);
    const suggestedChips = generateQuickChips(fallbackReply, messages);
    const detectedLead = extractLeadInfo(messages);

    return res.status(200).json({
      success: true,
      provider: 'internal-fallback',
      reply: fallbackReply,
      suggestedChips,
      detectedLead,
      debug: {
        hasGeminiKey: Boolean(GEMINI_KEY),
        hasOpenAIKey: Boolean(OPENAI_KEY),
        error: lastError
      }
    });

  } catch (error) {
    console.error('[API /api/chat ERROR]:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing chat'
    });
  }
};

// ── Google Gemini API Integration with Fast Timeout ──
async function callGemini(messages, apiKey) {
  const cleanKey = String(apiKey).trim();
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-1.5-flash'
  ].filter(Boolean);

  const contents = [];
  const recentMessages = messages.slice(-10);

  for (const m of recentMessages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    });
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Привет' }] });
  }

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800,
      topP: 0.95
    }
  };

  let lastError = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4500) // Fast 4.5s timeout prevents Vercel FUNCTION_INVOCATION_TIMEOUT
      });

      if (response.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } else {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || response.statusText;
        lastError = `${model} (${response.status}): ${errMsg}`;
        // If 404, try next model quickly
        if (response.status === 404) continue;
        // If quota exceeded or invalid key, break quickly
        if (response.status === 400 || response.status === 403) break;
      }
    } catch (err) {
      lastError = `${model}: ${err.name === 'TimeoutError' ? 'Request timed out after 4.5s' : err.message}`;
    }
  }

  throw new Error(lastError || 'Gemini request failed');
}

// ── OpenAI API Integration ──
async function callOpenAI(messages, apiKey) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const formattedMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '')
    }))
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: formattedMessages,
      temperature: 0.7,
      max_tokens: 800
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API returned ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  return text ? text.trim() : null;
}

// ── Smart Rule-based Fallback (No Key / Offline) ──
function generateFallbackResponse(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  const q = (lastUserMsg?.content || '').toLowerCase();

  if (q.match(/^(привет|здравствуй|салом|добрый день|добрый вечер|hello|hi|hey)/i)) {
    return "Приветствую! Рад общению ✦. Я AI-продюсер **Loft Creative House**. Чем наша команда может усилить ваш бренд или событие сегодня?";
  }

  if (q.match(/(букинг|звезд|артист|певец|певц|привезти|концерт|райдер|l-acoustics|acoustics|willy william|вилли|мохомби|mohombi|инна|inna|моранди|morandi|мот|l.one|леван|миша марвин|марвин|джони|jony|xcho|хчо|мона|mona|наваи|navai|акмал|akmal)/i)) {
    return "Команда **Loft Creative House** организует букинг артистов первой величины в Душанбе и по всему Таджикистану под ключ (https://www.loft.tj/booking-stars):\n\n" +
      "• **Мировые хедлайнеры:** Willy William («Mi Gente»), Mohombi («Bumpy Ride»), INNA («Hot»), Morandi («Angels»)\n" +
      "• **Топ-артисты СНГ:** МОТ, L'One (Леван Горозия), JONY, Миша Марвин, XCHO, MONA, Navai, Akmal'\n" +
      "• **Любой артист под ваш запрос:** прямые контакты с мировыми лейблами (Universal, Sony, Warner, Black Star, RAAVA) БЕЗ посредников и переплат.\n" +
      "• **100% выполнение технического райдера:** стадионный звук L-Acoustics (K2, Kara), пульты DiGiCo, световая режиссура GrandMA3, LED-экраны сверхвысокого разрешения, сцена и крио-пушки.\n" +
      "• **100% выполнение бытового райдера и VIP-безопасность:** VIP/CIP зал в аэропорту, кортеж Maybach / Mercedes S-Class, личная охрана bodyguards 24/7, проживание в 5★ отелях.\n" +
      "• **Сроки:** от 1 до 3 месяцев, а в экспресс-режиме — от 7–10 дней при свободной дате в туровом графике.\n\n" +
      "Какого артиста вы хотите пригласить на мероприятие? Назовите имя, и мы рассчитаем точную прозрачную смету!";
  }

  if (q.match(/(брендинг|бренд|seo|сео|лого|логотип|айдентик|brandbook|карты|2gis)/i)) {
    return "В направлении **Брендинг & SEO** мы упаковываем бизнес под ключ:\n\n" +
      "• **START (8 500 c)** — логотип (3 концепта), гайдлайн, конверсионный Landing Page, базовое SEO и оформление карт 2GIS / Google Maps.\n" +
      "• **BUSINESS PRO (17 500 c, Хит)** — полный Brandbook, многостраничный корпоративный сайт с калькулятором сметы, SEO в ТОП-3 и 2GIS PRO.\n" +
      "• **ECOSYSTEM 360° (32 000 c)** — комплексная бренд-платформа 360°, флагманский брендбук (мерч, автопарк), портал + Telegram Web App, агрессивное SEO (ТОП-1) и персональный арт-директор 24/7.\n\n" +
      "Какой тариф лучше всего подходит под масштаб вашей компании?";
  }

  if (q.match(/(smm|смм|рилс|reels|инста|инстаграм|stories|сторис|пост|таргет)/i)) {
    return "Комплексное ведение и рост в соцсетях (**SMM**):\n\n" +
      "• **LIGHT (6 000 c/мес)** — 5 Reels, 5 фото, 30 Stories, фирменные обложки, таргет, аналитика.\n" +
      "• **STANDARD (8 000 c/мес, Топ выбор)** — 8 Reels, 8 фото, 30 Stories, дизайн обложек, настройка рекламы, ежемесячный отчет.\n" +
      "• **PREMIUM (12 000 c/мес)** — 12 Reels, 10 фото, 30 Stories, таргет, инфлюенс-маркетинг.\n\n" +
      "Хотите запустить SMM со следующей недели?";
  }

  if (q.match(/(видео|клип|ролик|съемк|съёмк|реклам|продакшн|arri|red|ai видео)/i)) {
    return "Наш **видеопродакшн полного цикла** возглавляет креативный директор Роман Буряк:\n\n" +
      "• **Музыкальные клипы** и кинематографичные кампейны\n" +
      "• **Коммерческая и ТВ-реклама** с глубоким сторителлингом\n" +
      "• **AI-генеративные видео** и 3D анимация\n\n" +
      "Снимаем на кинокамеры Arri Alexa и Red V-Raptor с профессиональным светом и полным циклом цветокоррекции DaVinci. Смета рассчитывается индивидуально под ваш сценарий!";
  }

  if (q.match(/(сайт|лендинг|landing|разработк|веб|приложен|app|twa|бот)/i)) {
    return "Направление **Digital & IT** в Loft Creative House:\n\n" +
      "• **Landing Page (от 5 000 c)** — стильный посадочный сайт с высокой конверсией.\n" +
      "• **Корпоративный портал (от 10 000 c)** — многостраничные платформы с интеграциями.\n" +
      "• **Telegram-боты & Mini Apps (от 5 000 c)** — продажи и сервисы прямо в Telegram.\n" +
      "• **Мобильные приложения (от 20 000 c)** — iOS & Android.";
  }

  if (q.match(/(ивент|event|мероприят|концерт|шоу|праздник|корпоратив)/i)) {
    return "Организация мероприятий под ключ (**Events & Шоу**):\n\n" +
      "• **EVENT START (от 11 000 c)** — сценарий, звук/свет (до 50 чел), ведущий, DJ, фото/видео отчет.\n" +
      "• **EVENT BASE (от 31 000 c)** — премиум-площадка, звук/свет (до 100 чел), артисты, координация.\n" +
      "• **EVENT VIP (от 50 000 c)** — масштабные закрытые шоу, LED-экраны, букинг звезд, полное медиа-сопровождение.";
  }

  if (q.match(/(команд|кто вы|состав|рахим|роман|леонид|талифа|мухаммад|руковод)/i)) {
    return "Команда лидеров **Loft Creative House**:\n\n" +
      "• **Рахим Азимбабаев** — Основатель и CEO агентства\n" +
      "• **Роман Буряк** — Креативный директор\n" +
      "• **Талифа Малик** — Директор по маркетингу\n" +
      "• **Леонид Лунев** — Исполнительный директор и продюсер\n" +
      "• **Мухаммадали Камилов** — SMM-специалист\n\n" +
      "Каждый проект курируется лично директорами направлений.";
  }

  if (q.match(/(клиент|партнер|кейс|портфолио|akfa|акфа|асфальт|iki|муосирсоз)/i)) {
    return "Нам доверяют лидеры рынка:\n\n" +
      "• **AKFA** — промышленный флагман\n" +
      "• **ProfASFALT** — асфальтобетонный завод и инфраструктурные проекты\n" +
      "• **Фитнес-клуб IKI** — велнес-пространство для девушек\n" +
      "• **Строительная компания Муосирсоз** — девелопмент\n" +
      "• **Рестораны Анзур и Рудаки Хаус** — премиальная кухня.";
  }

  if (q.match(/(цен|стоимост|прайс|скольк|расчет|смет)/i)) {
    return "Прайс-лист на ключевые направления **Loft Creative House**:\n\n" +
      "• **SMM-ведение:** от 6 000 до 12 000 с/мес\n" +
      "• **Брендинг & SEO:** от 8 500 до 32 000 с\n" +
      "• **Сайты и разработка:** от 5 000 до 10 000 с\n" +
      "• **Организация ивентов:** от 11 000 до 50 000 с\n" +
      "• **Видеопродакшн:** точный расчет сметы под ваш сценарий.\n\n" +
      "На какое направление рассчитать смету?";
  }

  if (q.match(/(контакт|телефон|номер|адрес|где вы|написат|вотсап|телеграм|whatsapp|telegram)/i)) {
    return "Прямые контакты **Loft Creative House**:\n\n" +
      "• **Телефон / WhatsApp:** [+992 11 112 47 42](tel:+992111124742)\n" +
      "• **Telegram исполнительного продюсера:** [@maybeu](https://t.me/maybeu)\n" +
      "• **Официальный Telegram-бот:** [@loft_site_bot](https://t.me/loft_site_bot)\n" +
      "• **Instagram:** [@loft.creative.house.tj](https://www.instagram.com/loft.creative.house.tj/)\n\n" +
      "Локация: Душанбе, Таджикистан.";
  }

  return "Я зафиксировал ваш вопрос! Команда **Loft Creative House** готова реализовать задачу любой сложности — от вирусных Reels и съемок клипа до упаковки бренда и веб-разработки.\n\n" +
    "Расскажите немного о вашем бренде или оставьте контактный номер, и наш продюсер оперативно свяжется с вами!";
}

// ── Context-Aware Quick Action Chips ──
function generateQuickChips(botReply, messages) {
  const replyLower = (botReply || '').toLowerCase();

  if (replyLower.includes('брендинг') || replyLower.includes('start') || replyLower.includes('brandbook')) {
    return [
      { label: '📝 Заказать START (8 500 c)', action: 'order:Брендинг START' },
      { label: '⭐ Заказать BUSINESS PRO (17 500 c)', action: 'order:Брендинг BUSINESS PRO' },
      { label: '👑 ECOSYSTEM 360°', action: 'order:Брендинг ECOSYSTEM 360°' },
      { label: '🚀 Тарифы SMM', action: 'topic:smm' }
    ];
  }

  if (replyLower.includes('smm') || replyLower.includes('reels') || replyLower.includes('light')) {
    return [
      { label: '📝 SMM LIGHT (6 000 c)', action: 'order:SMM LIGHT' },
      { label: '⭐ SMM STANDARD (8 000 c)', action: 'order:SMM STANDARD' },
      { label: '🔥 SMM PREMIUM (12 000 c)', action: 'order:SMM PREMIUM' },
      { label: '🎬 Видеопродакшн', action: 'topic:video' }
    ];
  }

  if (replyLower.includes('видео') || replyLower.includes('клип') || replyLower.includes('arri')) {
    return [
      { label: '🎬 Заказать съемку клипа/рекламы', action: 'order:Видеопродакшн' },
      { label: '🤖 AI Видео & Анимация', action: 'order:AI Видео' },
      { label: '👥 О команде', action: 'topic:team' },
      { label: '💰 Рассчитать смету', action: 'order:Расчет сметы видео' }
    ];
  }

  if (replyLower.includes('сайт') || replyLower.includes('разработк') || replyLower.includes('digital')) {
    return [
      { label: '💻 Заказать Landing Page', action: 'order:Landing Page' },
      { label: '🌐 Корпоративный сайт', action: 'order:Корпоративный сайт' },
      { label: '🤖 Telegram-бот / Mini App', action: 'order:Telegram Mini App' },
      { label: '🎯 Брендинг & SEO', action: 'topic:branding' }
    ];
  }

  if (replyLower.includes('букинг') || replyLower.includes('артист') || replyLower.includes('звезд') || replyLower.includes('jony') || replyLower.includes('l-acoustics') || replyLower.includes('райдер')) {
    return [
      { label: '⭐ Запросить букинг артиста', action: 'order:Букинг звезды' },
      { label: '🌐 Каталог звезд на сайте', action: 'url:/booking-stars' },
      { label: '🔊 Технический райдер / Звук', action: 'topic:events' },
      { label: '👤 Связаться с продюсером', action: 'lead_capture' }
    ];
  }

  return [
    { label: '⭐ Букинг Артистов', action: 'topic:booking' },
    { label: '🎬 Видео & Клипы', action: 'topic:video' },
    { label: '🚀 SMM & Reels', action: 'topic:smm' },
    { label: '🎯 Брендинг & SEO', action: 'topic:branding' },
    { label: '📝 Оставить заявку', action: 'lead_capture' }
  ];
}

// ── Lead Detection in Free Chat ──
function extractLeadInfo(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return null;

  const text = lastUserMsg.content || '';
  
  // Detect phone pattern (e.g. +992..., 992..., +7..., 89..., or 9 digits)
  const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}|\+?\d{9,13}/);
  
  // Detect Telegram handle (@username)
  const tgMatch = text.match(/@([a-zA-Z0-9_]{4,32})/);

  if (phoneMatch || tgMatch) {
    return {
      contact: phoneMatch ? phoneMatch[0] : `@${tgMatch[1]}`,
      raw: text
    };
  }
  return null;
}
