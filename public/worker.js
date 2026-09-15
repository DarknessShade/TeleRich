// TeleRich Studio — Telegram Bot API 10.3
// Deploy exactly two ES modules: worker.js (entry point) and index.js (exported from Studio).
// Secrets: BOT_TOKEN, ADMIN_KEY, WEBHOOK_SECRET. Optional: ADMINS_ID="123,456".
// Never expose BOT_TOKEN or ADMIN_KEY in index.js. ADMIN_KEY is a trusted operator credential.
import html, { guides, releases, setup, workerSource } from './index.js';

const encoder = new TextEncoder();
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const admins = env => String(env.ADMINS_ID || '').split(/[\s,]+/).filter(Boolean);
const allowed = (env, id) => !admins(env).length || admins(env).includes(String(id));
const result = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
async function equal(a, b) {
  const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(s)));
  const [aa, bb] = await Promise.all([hash(a), hash(b)]);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, encoder.encode(data));
}
async function telegram(env, method, data = {}) {
  if (!env.BOT_TOKEN) throw fail('BOT_TOKEN is not configured on the Worker.', 503);
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const body = await response.json();
  if (!body.ok) throw fail(body.description || 'Telegram request failed.', body.error_code >= 500 ? 502 : 400);
  return body.result;
}
async function authenticate(request, env) {
  const token = request.headers.get('Authorization') || '';
  if (env.ADMIN_KEY && token.startsWith('Bearer ') && await equal(token.slice(7), env.ADMIN_KEY)) return { operator: true };
  const raw = request.headers.get('X-Telegram-Init-Data');
  if (!raw) throw fail('Open this app from your Telegram bot, or connect using ADMIN_KEY.', 401);
  const params = new URLSearchParams(raw);
  const signature = params.get('hash') || '';
  params.delete('hash');
  params.sort();
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', env.BOT_TOKEN);
  const computed = [...new Uint8Array(await hmac(secret, check))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (!await equal(computed, signature)) throw fail('Invalid Telegram session signature.', 401);
  const age = Date.now() / 1000 - Number(params.get('auth_date'));
  if (!Number.isFinite(age) || age < -30 || age > 3600) throw fail('Your Telegram session expired. Reopen the Mini App.', 401);
  const user = JSON.parse(params.get('user') || '{}');
  if (!Number.isSafeInteger(user.id)) throw fail('No Telegram user in session.', 401);
  if (!allowed(env, user.id)) throw fail('This bot is restricted to its configured administrators.', 403);
  return { operator: false, user };
}
async function authorizeChat(env, identity, chatId) {
  if (!chatId) throw fail('A chat ID is required. Send /start to your bot first.');
  const chat = await telegram(env, 'getChat', { chat_id: chatId });
  if (identity.operator) {
    if (chat.type === 'channel' || chat.type === 'supergroup' || chat.type === 'group') {
      const me = await telegram(env, 'getMe');
      const member = await telegram(env, 'getChatMember', { chat_id: chat.id, user_id: me.id });
      if (!['administrator', 'creator'].includes(member.status)) throw fail('Add the bot as a chat administrator before publishing.', 403);
      if (chat.type === 'channel' && member.status !== 'creator' && !member.can_post_messages) throw fail('The bot needs Post messages permission.', 403);
    }
    return chat;
  }
  if (chat.type === 'private') {
    if (String(chat.id) !== String(identity.user.id)) throw fail('You may only send to your own private chat.', 403);
    return chat;
  }
  const me = await telegram(env, 'getMe');
  const [user, bot] = await Promise.all([
    telegram(env, 'getChatMember', { chat_id: chat.id, user_id: identity.user.id }),
    telegram(env, 'getChatMember', { chat_id: chat.id, user_id: me.id })
  ]);
  if (!['administrator', 'creator'].includes(user.status)) throw fail('You must be an administrator of the destination.', 403);
  if (!['administrator', 'creator'].includes(bot.status)) throw fail('The bot must be an administrator of the destination.', 403);
  if (chat.type === 'channel' && bot.status !== 'creator' && !bot.can_post_messages) throw fail('The bot needs Post messages permission.', 403);
  return chat;
}
function validateRich(rich) {
  if (!rich || typeof rich !== 'object') throw fail('rich_message is required.');
  const keys = ['html', 'markdown', 'blocks'].filter(k => rich[k] !== undefined);
  if (keys.length !== 1) throw fail('Use exactly one of html, markdown or blocks.');
  if (keys[0] !== 'blocks' && (typeof rich[keys[0]] !== 'string' || !rich[keys[0]].trim() || rich[keys[0]].length > 32768)) throw fail('Message must contain 1–32,768 characters.');
  if (keys[0] === 'blocks' && !Array.isArray(rich.blocks)) throw fail('blocks must be an array.');
  return rich;
}
const copyFields = (source, names) => Object.fromEntries(names.filter(k => source[k] !== undefined).map(k => [k, source[k]]));

async function webApi(request, env, url) {
  if (request.method !== 'POST') throw fail('POST required.', 405);
  if (Number(request.headers.get('content-length') || 0) > 524288) throw fail('Request too large.', 413);
  const identity = await authenticate(request, env);
  const raw = await request.text();
  if (raw.length > 524288) throw fail('Request too large.', 413);
  let data;
  try { data = JSON.parse(raw || '{}'); } catch { throw fail('Invalid JSON.'); }
  const action = url.pathname.slice(5);
  if (action === 'connect') return telegram(env, 'getMe');
  if (action === 'webhook') {
    if (!identity.operator) throw fail('Only the operator may change the webhook.', 403);
    if (!env.WEBHOOK_SECRET) throw fail('Set WEBHOOK_SECRET first.');
    const webhook = await telegram(env, 'setWebhook', { url: `${url.origin}/webhook`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query', 'my_chat_member', 'stopped_message_generation'] });
    const commands = await telegram(env, 'setMyCommands', { commands: [
      { command: 'start', description: 'Open TeleRich · باز کردن تله‌ریچ' },
      { command: 'guide', description: 'Rich text guide · راهنمای متن ریچ' },
      { command: 'html', description: 'Blocks & layout guide · راهنمای بلوک‌ها' },
      { command: 'media', description: 'Media guide · راهنمای مدیا' },
      { command: 'buttons', description: 'Rich buttons example · نمونه دکمه ریچ' },
      { command: 'table', description: 'Table example · نمونه جدول' },
      { command: 'demo', description: 'Full feature demo · دموی کامل' },
      { command: 'setup', description: 'Deployment guide · راهنمای راه‌اندازی' },
      { command: 'updates', description: 'Bot API 10.3 changes · تازه‌های نسخه' },
      { command: 'webapp', description: 'Open the studio · باز کردن استودیو' },
      { command: 'post', description: 'Channel studio · پست‌ساز کانال' },
      { command: 'whoami', description: 'Your numeric ID · شناسه عددی شما' },
      { command: 'about', description: 'Credits · درباره' },
    ] });
    return { webhook, commands };
  }
  if (!['send', 'edit', 'delete', 'channel', 'draft', 'editEphemeralMessageText', 'editEphemeralMessageCaption', 'editEphemeralMessageReplyMarkup', 'deleteEphemeralMessage'].includes(action)) throw fail('Unknown API route.', 404);
  const chatId = data.chat_id || identity.user?.id;
  const chat = await authorizeChat(env, identity, chatId);
  if (action === 'channel') return { id: chat.id, title: chat.title, type: chat.type };
  if (action === 'send') {
    const fields = copyFields(data, ['disable_notification', 'protect_content', 'ephemeral_message_parameters', 'reply_markup', 'reply_parameters', 'message_thread_id']);
    if (fields.ephemeral_message_parameters && chat.type === 'channel') throw fail('Ephemeral messages are not supported in channels. Use a group.');
    return telegram(env, 'sendRichMessage', { ...fields, chat_id: chat.id, rich_message: validateRich(data.rich_message) });
  }
  if (action === 'draft') return telegram(env, 'sendRichMessageDraft', { ...copyFields(data, ['draft_id', 'can_stop', 'keep_on_stop', 'message_thread_id']), chat_id: chat.id, rich_message: validateRich(data.rich_message) });
  if (action === 'edit') {
    if (!Number.isSafeInteger(data.message_id)) throw fail('A valid message_id is required.');
    return telegram(env, 'editMessageText', { chat_id: chat.id, message_id: data.message_id, rich_message: validateRich(data.rich_message), ...copyFields(data, ['reply_markup']) });
  }
  if (action === 'delete') {
    if (!Number.isSafeInteger(data.message_id)) throw fail('A valid message_id is required.');
    return telegram(env, 'deleteMessage', { chat_id: chat.id, message_id: data.message_id });
  }
  const fields = copyFields(data, ['receiver_user_id', 'ephemeral_message_id', 'rich_message', 'text', 'parse_mode', 'caption', 'caption_entities', 'show_caption_above_media', 'reply_markup']);
  if (!Number.isSafeInteger(fields.receiver_user_id) || !Number.isSafeInteger(fields.ephemeral_message_id)) throw fail('receiver_user_id and ephemeral_message_id are required.');
  if (!identity.operator && fields.receiver_user_id !== identity.user.id) throw fail('Cannot modify another user’s ephemeral messages.', 403);
  if (fields.rich_message) validateRich(fields.rich_message);
  return telegram(env, action, { ...fields, chat_id: chat.id });
}

function menu(lang, origin) {
  const fa = lang === 'fa';
  return { inline_keyboard: [
    [{ text: fa ? '✨ استودیوی پیام و پست‌ساز' : '✨ Message & channel studio', web_app: { url: origin }, style: 'primary' }],
    [{ text: fa ? '📖 راهنمای متن ریچ' : '📖 Rich text guide', callback_data: `list:${lang}:Rich text:0` }, { text: fa ? '🧩 بلوک‌ها' : '🧩 Blocks', callback_data: `list:${lang}:Blocks:0` }],
    [{ text: fa ? '🖼 راهنمای مدیا' : '🖼 Media guide', callback_data: `list:${lang}:Media:0` }, { text: fa ? '🎨 دمو کامل' : '🎨 Full demo', callback_data: `demo:${lang}:0`, style: 'success' }],
    [{ text: fa ? '🚀 راه‌اندازی' : '🚀 Deployment', callback_data: `setup:${lang}` }, { text: 'Bot API 10.3', callback_data: `updates:${lang}` }],
    [{ text: fa ? '🌐 English' : '🌐 فارسی', callback_data: `home:${fa ? 'en' : 'fa'}` }]
  ] };
}
const back = (lang, origin) => ({ inline_keyboard: [[{ text: lang === 'fa' ? '← بازگشت به منو' : '← Back to menu', callback_data: `home:${lang}` }, { text: lang === 'fa' ? 'باز کردن استودیو' : 'Open studio', web_app: { url: origin }, style: 'primary' }]] });
async function plain(env, chatId, text, markup, messageId) {
  return telegram(env, messageId ? 'editMessageText' : 'sendMessage', { chat_id: chatId, ...(messageId ? { message_id: messageId } : {}), text, parse_mode: 'HTML', reply_markup: markup, link_preview_options: { is_disabled: true } });
}
async function home(env, chatId, lang, origin, messageId) {
  const en = '<b>✨ TeleRich · Rich Message Studio</b>\n\nSend HTML or Markdown to render a rich message with Bot API 10.3.\n\nExplore individual guides, code examples and live demos. Open the studio for button styles, row layout, media and channel publishing.\n\n/start — menu\n/help — guides\n/post — channel studio\n/about — credits';
  const fa = '<b>✨ TeleRich · استودیوی پیام ریچ</b>\n\nمتن HTML یا Markdown بفرستید تا با Bot API 10.3 به پیام ریچ تبدیل شود.\n\nراهنمای هر قابلیت، نمونه کد و دموی زنده در دسترس است. برای تنظیم رنگ و ردیف دکمه، مدیا و ارسال به کانال، استودیو را باز کنید.\n\n/start — منو\n/help — راهنما\n/post — پست‌ساز\n/about — درباره';
  const text = en + '\n\n〰️〰️〰️〰️〰️〰️〰️〰️\n\n' + fa;
  return plain(env, chatId, text, menu(lang, origin), messageId);
}
function reconstruct(message) {
  const text = message.text || message.caption || '';
  const entities = message.entities || message.caption_entities || [];
  if (!entities.length) return { [/<\/?[a-z][\s\S]*?>/i.test(text) ? 'html' : 'markdown']: text };
  const starts = new Map(), ends = new Map();
  const tags = { bold: ['<b>', '</b>'], italic: ['<i>', '</i>'], underline: ['<u>', '</u>'], strikethrough: ['<s>', '</s>'], spoiler: ['<tg-spoiler>', '</tg-spoiler>'], code: ['<code>', '</code>'], pre: ['<pre><code>', '</code></pre>'], blockquote: ['<blockquote>', '</blockquote>'], expandable_blockquote: ['<blockquote expandable>', '</blockquote>'] };
  for (const e of [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length)) {
    let pair = tags[e.type];
    if (e.type === 'text_link') pair = [`<a href="${escape(e.url)}">`, '</a>'];
    if (e.type === 'text_mention') pair = [`<a href="tg://user?id=${e.user.id}">`, '</a>'];
    if (e.type === 'custom_emoji') pair = [`<tg-emoji emoji-id="${escape(e.custom_emoji_id)}">`, '</tg-emoji>'];
    if (!pair) continue;
    starts.set(e.offset, (starts.get(e.offset) || '') + pair[0]);
    ends.set(e.offset + e.length, pair[1] + (ends.get(e.offset + e.length) || ''));
  }
  let output = '';
  for (let i = 0; i <= text.length; i++) output += (ends.get(i) || '') + (starts.get(i) || '') + (i < text.length ? escape(text[i]) : '');
  return { html: output };
}
function guideIndexByName(name) { return guides.findIndex(g => g.name === name); }
async function sendList(env, chatId, lang, group, offset, origin, messageId) {
  const list = guides.map((g, i) => ({ ...g, i })).filter(g => g.group === group);
  offset = Math.max(0, offset || 0);
  const slice = list.slice(offset, offset + 8);
  const keyboard = slice.map(g => [{ text: lang === 'fa' ? `${g.fa} · ${g.name}` : g.name, callback_data: `guide:${lang}:${g.i}` }]);
  const nav = [];
  if (offset > 0) nav.push({ text: '←', callback_data: `list:${lang}:${group}:${offset - 8}`, style: 'danger' });
  if (offset + 8 < list.length) nav.push({ text: '→', callback_data: `list:${lang}:${group}:${offset + 8}`, style: 'primary' });
  if (nav.length) keyboard.push(nav);
  keyboard.push(back(lang, origin).inline_keyboard[0]);
  return plain(env, chatId, `<b>${escape(group)} · Bot API 10.3</b>\n\n${lang === 'fa' ? 'برای توضیح و نمونه، یک قابلیت انتخاب کنید.' : 'Choose a feature for its explanation and example.'}`, { inline_keyboard: keyboard }, messageId);
}
async function sendGuide(env, chatId, lang, index, origin, messageId) {
  const guide = guides[index];
  if (!guide) return;
  const text = `<b>${escape(guide.name)}</b>\n\n${escape(lang === 'fa' ? guide.descriptionFa : guide.description)}\n\n<pre>${escape(guide.code)}</pre>\n\n<a href="https://core.telegram.org/bots/api#${guide.name.toLowerCase()}">Telegram API reference</a>`;
  return plain(env, chatId, text, { inline_keyboard: [[{ text: lang === 'fa' ? '▶ نمایش نمونه رندرشده' : '▶ Render this example', callback_data: `render:${lang}:${index}`, style: 'success' }], ...back(lang, origin).inline_keyboard] }, messageId);
}
async function sendDemo(env, chatId, lang, offset, origin, messageId) {
  offset = Math.max(0, offset || 0);
  const examples = guides.slice(offset, offset + 5);
  const nav = [];
  if (offset > 0) nav.push({ text: lang === 'fa' ? '← بخش قبل' : '← Previous section', callback_data: `demo:${lang}:${Math.max(0, offset - 5)}`, style: 'danger' });
  if (offset + 5 < guides.length) nav.push({ text: lang === 'fa' ? 'بخش بعد →' : 'Next section →', callback_data: `demo:${lang}:${offset + 5}`, style: 'primary' });
  const rich_message = { markdown: examples.map(g => `## ${g.name}\n\n${g.code}`).join('\n\n') };
  const reply_markup = { inline_keyboard: [...(nav.length ? [nav] : []), ...back(lang, origin).inline_keyboard] };
  // Bot API 10.2+: editMessageText accepts rich_message, so paging through the demo edits
  // the same message instead of sending a new one each time next/back is pressed.
  return telegram(env, messageId ? 'editMessageText' : 'sendRichMessage', { chat_id: chatId, ...(messageId ? { message_id: messageId } : {}), rich_message, reply_markup });
}
async function sendSetup(env, chatId, lang, origin, messageId) {
  const text = '<b>TeleRich · Deployment / راه‌اندازی</b>\n\n' + setup.map((s, i) => `<b>${i + 1}. ${escape(s[lang === 'fa' ? 1 : 0])}</b>\n${escape(s[lang === 'fa' ? 3 : 2])}`).join('\n\n');
  return plain(env, chatId, text.slice(0, 4000), back(lang, origin), messageId);
}
async function sendUpdates(env, chatId, lang, origin, messageId) {
  const release = releases[0];
  const text = `<b>Bot API ${release.version} · ${release.date}</b>\n\n` + release.items.map(item => `<b>${escape(item[0])}</b>\n${escape(item[lang === 'fa' ? 2 : 1])}`).join('\n\n') + '\n\n<a href="https://core.telegram.org/bots/api#august-24-2026">Official changelog</a>';
  return plain(env, chatId, text, back(lang, origin), messageId);
}
async function sendWebapp(env, chatId, lang, origin) {
  return plain(env, chatId, lang === 'fa' ? '✨ استودیوی پیام و پست‌ساز را باز کنید.' : '✨ Open the message & channel studio.', { inline_keyboard: [[{ text: lang === 'fa' ? '✨ باز کردن استودیو' : '✨ Open studio', web_app: { url: origin }, style: 'primary' }], back(lang, origin).inline_keyboard[0]] });
}
async function sendWhoami(env, chatId, lang, origin, user) {
  const restricted = admins(env).length > 0;
  const isAdmin = !restricted || admins(env).includes(String(user.id));
  const text = lang === 'fa'
    ? `<b>شناسه عددی شما</b>\n<code>${user.id}</code>\n\n${restricted ? (isAdmin ? '✅ شما در فهرست ADMINS_ID هستید.' : '⛔ شما در فهرست ADMINS_ID نیستید و به استودیو دسترسی ندارید.') : 'ℹ️ ADMINS_ID تنظیم نشده؛ استفاده از ربات برای همه آزاد است.'}`
    : `<b>Your numeric ID</b>\n<code>${user.id}</code>\n\n${restricted ? (isAdmin ? '✅ You are listed in ADMINS_ID.' : '⛔ You are not listed in ADMINS_ID and cannot use the studio.') : 'ℹ️ ADMINS_ID is not set; anyone may use this bot.'}`;
  return plain(env, chatId, text, back(lang, origin));
}

async function onUpdate(update, env, origin) {
  const callback = update.callback_query;
  const message = callback?.message || update.message;
  const user = callback?.from || update.message?.from;
  if (!user || !message) return;
  // /whoami is exempt: it is how an owner discovers a user's numeric ID before adding it to ADMINS_ID.
  if (!callback && message.chat.type === 'private' && (message.text || '').split(' ')[0] === '/whoami') {
    return sendWhoami(env, message.chat.id, user.language_code?.startsWith('fa') ? 'fa' : 'en', origin, user);
  }
  if (!allowed(env, user.id)) {
    if (callback) await telegram(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: 'Access restricted / دسترسی محدود', show_alert: true });
    else if (message.chat.type === 'private') await plain(env, message.chat.id, 'Access restricted / دسترسی محدود');
    return;
  }
  // Interactive menus are private-chat only; a bot must not expose another user's draft to a group.
  if (message.chat.type !== 'private') return;
  const chatId = message.chat.id;
  const detectedLang = user.language_code?.startsWith('fa') ? 'fa' : 'en';
  if (callback) {
    const [action, rawLang, arg, page] = (callback.data || '').split(':');
    const lang = rawLang === 'fa' ? 'fa' : 'en';
    await telegram(env, 'answerCallbackQuery', { callback_query_id: callback.id, text: ['home','list','guide','render','demo','setup','updates','publish','edit','delete'].includes(action) ? undefined : `Callback: ${callback.data || ''}` });
    if (action === 'home') return home(env, chatId, lang, origin, message.message_id);
    if (action === 'list') return sendList(env, chatId, lang, ['Rich text','Blocks','Media'].includes(arg) ? arg : 'Rich text', Number(page) || 0, origin, message.message_id);
    if (action === 'guide') return sendGuide(env, chatId, lang, Number(arg), origin, message.message_id);
    if (action === 'render') {
      const guide = guides[Number(arg)];
      if (guide) return telegram(env, 'sendRichMessage', { chat_id: chatId, rich_message: { markdown: guide.code }, reply_markup: back(lang, origin) });
    }
    if (action === 'demo') return sendDemo(env, chatId, lang, Number(arg) || 0, origin, message.message_id);
    if (action === 'setup') return sendSetup(env, chatId, lang, origin, message.message_id);
    if (action === 'updates') return sendUpdates(env, chatId, lang, origin, message.message_id);
    if (action === 'publish' || action === 'edit') {
      const label = action === 'publish' ? (lang === 'fa' ? 'آدرس @کانال یا شناسه -100… را در پاسخ بفرستید. شما و ربات باید مدیر باشید.' : 'Reply with the destination @channel or -100… ID. You and the bot must be administrators.') : (lang === 'fa' ? 'متن جدید HTML یا Markdown را در پاسخ بفرستید.' : 'Reply with your replacement HTML or Markdown.');
      return plain(env, chatId, `${label}\n\n<code>TR:${action}:${arg}:${lang}</code>`, { force_reply: true, selective: true });
    }
    if (action === 'delete') {
      await telegram(env, 'deleteMessage', { chat_id: chatId, message_id: Number(arg) });
      return home(env, chatId, lang, origin);
    }
    return;
  }
  const text = message.text || '';
  const command = text.split(' ')[0];
  if (['/start','/help','/post'].includes(command)) return home(env, chatId, detectedLang, origin);
  if (command === '/about') return plain(env, chatId, '<b>TeleRich · DarknessShade</b>\n\n<a href="https://github.com/DarknessShade/TeleRich">GitHub</a>\n<a href="https://t.me/Paradise_Of_Freedom">Paradise Of Freedom</a>\n<a href="https://t.me/ConfigWireguard">ConfigWireguard</a>', back(detectedLang, origin));
  if (command === '/whoami') return sendWhoami(env, chatId, detectedLang, origin, user);
  if (command === '/guide' || command === '/markdown') return sendList(env, chatId, detectedLang, 'Rich text', 0, origin);
  if (command === '/html') return sendList(env, chatId, detectedLang, 'Blocks', 0, origin);
  if (command === '/media') return sendList(env, chatId, detectedLang, 'Media', 0, origin);
  if (command === '/buttons') { const i = guideIndexByName('RichBlockButtons'); return i >= 0 ? sendGuide(env, chatId, detectedLang, i, origin) : sendList(env, chatId, detectedLang, 'Blocks', 0, origin); }
  if (command === '/table') { const i = guideIndexByName('RichBlockTable'); return i >= 0 ? sendGuide(env, chatId, detectedLang, i, origin) : sendList(env, chatId, detectedLang, 'Blocks', 0, origin); }
  if (command === '/demo') return sendDemo(env, chatId, detectedLang, 0, origin);
  if (command === '/setup') return sendSetup(env, chatId, detectedLang, origin);
  if (command === '/updates') return sendUpdates(env, chatId, detectedLang, origin);
  if (command === '/webapp') return sendWebapp(env, chatId, detectedLang, origin);
  const reply = message.reply_to_message;
  const marker = reply?.from?.is_bot && reply.text?.match(/TR:(publish|edit):(\d+):(en|fa)/);
  if (marker) {
    const [, action, messageId, lang] = marker;
    if (action === 'publish') {
      if (!/^(@[A-Za-z][\w]{3,}|-100\d+)$/.test(text.trim())) throw fail('Reply with a valid @channel or -100… identifier.');
      const target = await authorizeChat(env, { operator: false, user }, text.trim());
      await telegram(env, 'copyMessage', { chat_id: target.id, from_chat_id: chatId, message_id: Number(messageId) });
      return plain(env, chatId, lang === 'fa' ? '✅ پست منتشر شد.' : '✅ Your post is published.', back(lang, origin));
    }
    return telegram(env, 'editMessageText', { chat_id: chatId, message_id: Number(messageId), rich_message: reconstruct(message) });
  }
  if (!text.trim()) return plain(env, chatId, detectedLang === 'fa' ? 'برای مدیا، دکمه و چیدمان پیشرفته، استودیو را باز کنید.' : 'Open the studio to add media, buttons and advanced layouts.', back(detectedLang, origin));
  return telegram(env, 'sendRichMessage', { chat_id: chatId, rich_message: validateRich(reconstruct(message)) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const permitted = !env.ALLOWED_ORIGIN || origin === env.ALLOWED_ORIGIN || origin === url.origin;
    const cors = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN ? (permitted ? origin || url.origin : url.origin) : '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: permitted ? 204 : 403, headers: cors });
    if (url.pathname === '/webhook') {
      if (request.method !== 'POST') return new Response('POST required', { status: 405 });
      const received = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
      if (!env.WEBHOOK_SECRET || !await equal(received, env.WEBHOOK_SECRET)) return new Response('Unauthorized', { status: 401 });
      let update;
      try { update = await request.json(); } catch { return new Response('Invalid update', { status: 400 }); }
      ctx.waitUntil(onUpdate(update, env, url.origin).catch(async error => {
        // Log no tokens or source content. User-facing API errors help diagnose unsupported markup/media.
        console.error('TeleRich update error:', error.message);
        const chat = update.message?.chat || update.callback_query?.message?.chat;
        if (chat?.type === 'private') {
          try { await plain(env, chat.id, `⚠️ ${escape(error.message)}\n\n/help — menu / راهنما`); } catch { /* Telegram may be unavailable; keep webhook acknowledged. */ }
        }
      }));
      return new Response('OK');
    }
    if (url.pathname.startsWith('/api/')) {
      if (!permitted) return result({ ok: false, description: 'Origin not allowed.' }, 403, cors);
      try { return result({ ok: true, result: await webApi(request, env, url) }, 200, cors); }
      catch (error) { return result({ ok: false, description: error.message || 'Request failed.' }, error.status || 500, cors); }
    }
    if (request.method === 'GET' && url.pathname === '/worker.js') return new Response(workerSource, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' } });
    if (request.method === 'GET' && url.pathname === '/') return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Cache-Control': 'no-cache' } });
    return new Response('Not found', { status: 404 });
  }
};
