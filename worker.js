/**
 * Telegram Rich Markdown & Channel Formatter Bot — Cloudflare Worker
 *
 * Core:
 * - DMs: render Markdown (with inline HTML) as Rich Messages.
 * - Channels: auto-format posts on publish (smart edit detection).
 * - Per-channel disconnect, channel-only tag guide.
 * - Admin Panel, KV cache.
 * - Manual spacing preserved (NBSP), auto-slideshow, pull-quote, map shortcut.
 *
 * NEW:
 * 1) Live preview: every DM render shows "📤 Publish to channel" buttons.
 * 2) Time shortcut: [زمان: ...] / [time: ...] -> <tg-time>.
 * 3) Auto channel footer (multi-link), set & remove anytime. (FIXED)
 * 4) Better /stats dashboard (channels, footers, today, 7-day chart).
 * 5) Undo: /undo in PM -> bot asks to revert the channel's last render to raw.
 * 6) Tag Render Settings: Per-channel toggle for specific tags via glass buttons.
 */

const BOT_TOKEN = "TOKEN BOT IN PLACE"; // ⚠️ revoke the leaked one
const ADMIN_ID = 12345678987; // admin user id
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TTL_PROCESSED_SEC = 30 * 24 * 60 * 60; // 30 days
const TTL_CHANNEL_SEC = 30 * 24 * 60 * 60;   // 30 days
const TTL_RENDER_SEC = 7 * 24 * 60 * 60;     // 7 days (undo window)
const TTL_PREVIEW_SEC = 60 * 60;             // 1 hour (pending preview)
const TTL_AWAIT_SEC = 10 * 60;               // 10 min (footer input)

const DEFAULT_CONFIG = { quote: true, time: true, map: true, code: true, expand: true, media: true, spoiler: true };

export default {
	async fetch(request, env) {
		if (request.method === "GET") return new Response("✅ Bot is running!", { status: 200 });
		if (request.method !== "POST") return new Response("OK");
		if (!env.DB) {
			console.error("KV Namespace 'DB' is not bound!");
			return new Response("KV Setup Error", { status: 500 });
		}
		let update;
		try {
			update = await request.json();
		} catch {
			return new Response("Bad JSON", { status: 400 });
		}
		try {
			if (update.message) {
				await handleMessage(update.message, env);
			} else if (update.callback_query) {
				await handleCallback(update.callback_query, env);
			} else if (update.channel_post) {
				await handleChannelPost(update.channel_post, env);
			}
		} catch (err) {
			console.error("Handler error:", err && err.stack ? err.stack : err);
		}
		return new Response("OK", { status: 200 });
	},
};

// ─── KV Storage Helpers & Stats ───────────────────────────────────────────────
async function registerUser(env, userId) {
	const key = `user:${userId}`;
	const exists = await env.DB.get(key);
	if (!exists) {
		await env.DB.put(key, "1");
		await incrementStat(env, "stats:users");
	}
}
async function kvAuthorizeChannel(env, channelId) {
	await env.DB.put(`channel:${channelId}`, "authorized", { expirationTtl: TTL_CHANNEL_SEC });
}
async function kvDeauthorizeChannel(env, channelId) {
	await env.DB.delete(`channel:${channelId}`);
}
async function kvIsChannelAuthorized(env, channelId) {
	return (await env.DB.get(`channel:${channelId}`)) !== null;
}
async function kvHasProcessedMessage(env, channelId, messageId) {
	return (await env.DB.get(`processed:${channelId}:${messageId}`)) !== null;
}
async function kvMarkMessageProcessed(env, channelId, messageId) {
	await env.DB.put(`processed:${channelId}:${messageId}`, "1", { expirationTtl: TTL_PROCESSED_SEC });
}
async function incrementStat(env, key) {
	let count = parseInt(await env.DB.get(key)) || 0;
	await env.DB.put(key, (count + 1).toString());
}
async function getCachedBot(env) {
	let botStr = await env.DB.get("cache:bot");
	if (botStr) return JSON.parse(botStr);
	const me = await callApi("getMe", {});
	const bot = { id: me?.result?.id, username: me?.result?.username };
	if (!bot.id) throw new Error("getMe failed");
	await env.DB.put("cache:bot", JSON.stringify(bot), { expirationTtl: 86400 });
	return bot;
}
async function kvLinkUserToChannel(env, userId, channelId, title) {
	const key = `user_channels:${userId}`;
	let channels = await env.DB.get(key, "json");
	if (!channels || !Array.isArray(channels)) channels = [];
	if (!channels.find(c => String(c.id) === String(channelId))) {
		channels.push({ id: channelId, title: title });
		await env.DB.put(key, JSON.stringify(channels));
	}
}
async function kvUnlinkUserFromChannel(env, userId, channelId) {
	const key = `user_channels:${userId}`;
	let channels = await env.DB.get(key, "json");
	if (!channels || !Array.isArray(channels)) return;
	channels = channels.filter(c => String(c.id) !== String(channelId));
	await env.DB.put(key, JSON.stringify(channels));
}
async function kvGetUserChannels(env, userId) {
	const key = `user_channels:${userId}`;
	const channels = await env.DB.get(key, "json");
	return channels || [];
}
async function getChannelConfig(env, channelId) {
	const conf = await env.DB.get(`config:${channelId}`, "json");
	return { ...DEFAULT_CONFIG, ...(conf || {}) };
}
async function setChannelConfig(env, channelId, config) {
	await env.DB.put(`config:${channelId}`, JSON.stringify(config));
}

// Stats / dashboard helpers
function dateKey(offsetDays = 0) {
	const ms = Date.now() + 3.5 * 3600 * 1000 - offsetDays * 24 * 3600 * 1000;
	const d = new Date(ms);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
async function incrementDailyPosts(env) {
	const key = `stats:posts:${dateKey(0)}`;
	let c = parseInt(await env.DB.get(key)) || 0;
	await env.DB.put(key, (c + 1).toString(), { expirationTtl: 9 * 24 * 3600 });
}
async function countPrefix(env, prefix) {
	let n = 0, cursor = null;
	do {
		const list = await env.DB.list({ prefix, cursor });
		n += list.keys.length;
		cursor = list.list_complete ? null : list.cursor;
	} while (cursor);
	return n;
}

// ─── Keyboards ────────────────────────────────────────────────────────────────
function mainKeyboard(lang, botUsername) {
	const isFa = lang === "fa";
	return {
		inline_keyboard: [
			[
				{ text: isFa ? "📖 راهنمای Markdown" : "📖 Markdown Guide", callback_data: `${lang}_help_md` },
				{ text: isFa ? "🌐 راهنمای HTML" : "🌐 HTML Guide", callback_data: `${lang}_help_html` },
			],
			[
				{ text: isFa ? "🖼 راهنمای مدیا" : "🖼 Media Guide", callback_data: `${lang}_help_media` },
				{ text: isFa ? "📢 راهنمای کانال" : "📢 Channel Guide", callback_data: `${lang}_help_channel` },
			],
			[
				{ text: isFa ? "🎨 دمو کامل" : "🎨 Full Demo", callback_data: `${lang}_demo` },
				{ text: isFa ? "ℹ️ درباره بات" : "ℹ️ About", callback_data: `${lang}_about` },
			],
			[
				{
					text: isFa ? "➕ افزودن به کانال" : "➕ Add to Channel",
					url: `https://t.me/${botUsername}?startchannel&admin=post_messages+edit_messages`,
				},
			],
			[
				{ text: isFa ? "🇬🇧 Switch to English" : "🇮🇷 تغییر به فارسی", callback_data: isFa ? "en_start" : "fa_start" },
			],
		],
	};
}
function backKeyboard(lang) {
	const isFa = lang === "fa";
	return {
		inline_keyboard: [
			[
				{ text: isFa ? "⬅️ بازگشت به منو" : "⬅️ Back to Menu", callback_data: `${lang}_back` },
				{ text: isFa ? "🇬🇧 English" : "🇮🇷 فارسی", callback_data: isFa ? "en_start" : "fa_start" },
			],
		],
	};
}
// Channel guide keyboard
function channelGuideKeyboard(lang, userChannels) {
	const isFa = lang === "fa";
	const rows = [];
	rows.push([
		{ text: isFa ? "🏷 تگ‌های مخصوص کانال" : "🏷 Channel-only Tags", callback_data: `${lang}_chtags` },
	]);
	rows.push([
		{ text: isFa ? "⚙️ تنظیمات رندر (تگ‌ها)" : "⚙️ Render Settings", callback_data: `${lang}_rendermenu` },
		{ text: isFa ? "✍️ امضای کانال" : "✍️ Channel Footer", callback_data: `${lang}_footermenu` },
	]);
	for (const c of userChannels || []) {
		rows.push([
			{
				text: (isFa ? "🔌 قطع اتصال: " : "🔌 Disconnect: ") + (c.title || c.id),
				callback_data: `${lang}_off_${c.id}`,
			},
		]);
	}
	rows.push([
		{ text: isFa ? "⬅️ بازگشت به منو" : "⬅️ Back to Menu", callback_data: `${lang}_back` },
		{ text: isFa ? "🇬🇧 English" : "🇮🇷 فارسی", callback_data: isFa ? "en_start" : "fa_start" },
	]);
	return { inline_keyboard: rows };
}
function backToChannelKeyboard(lang) {
	const isFa = lang === "fa";
	return {
		inline_keyboard: [[
			{ text: isFa ? "⬅️ بازگشت به راهنمای کانال" : "⬅️ Back to Channel Guide", callback_data: `${lang}_help_channel` },
		]],
	};
}
// Config menus
function renderMenuKeyboard(lang, userChannels) {
	const isFa = lang === "fa";
	const rows = [];
	for (const c of userChannels || []) {
		rows.push([{ text: `⚙️ ${c.title || c.id}`, callback_data: `${lang}_rcfg_${c.id}` }]);
	}
	rows.push([{ text: isFa ? "⬅️ بازگشت" : "⬅️ Back", callback_data: `${lang}_help_channel` }]);
	return { inline_keyboard: rows };
}
function renderTogglesKeyboard(lang, channelId, config) {
	const isFa = lang === "fa";
	const rows = [];
	const mkBtn = (key, labelFa, labelEn) => {
		const status = config[key] ? "✅" : "❌";
		return { text: `${status} ${isFa ? labelFa : labelEn}`, callback_data: `${lang}_rtgl_${channelId}_${key}` };
	};
	rows.push([mkBtn("quote", "نقل‌قول (\"\")", "Quote (\"\")"), mkBtn("time", "زمان", "Time")]);
	rows.push([mkBtn("map", "نقشه", "Map"), mkBtn("code", "کد (///)", "Code (///)")]);
	rows.push([mkBtn("expand", "کشویی (???)", "Expand (???)"), mkBtn("media", "مدیا (اسلایدشو)", "Media")]);
	rows.push([mkBtn("spoiler", "اسپویلر (🙈)", "Spoiler (🙈)")]);
	rows.push([{ text: isFa ? "⬅️ بازگشت به لیست" : "⬅️ Back to list", callback_data: `${lang}_rendermenu` }]);
	return { inline_keyboard: rows };
}
// Footer set/remove menu.
function footerMenuKeyboard(lang, userChannels) {
	const isFa = lang === "fa";
	const rows = [];
	for (const c of userChannels || []) {
		rows.push([
			{ text: (isFa ? "✍️ تنظیم: " : "✍️ Set: ") + (c.title || c.id), callback_data: `${lang}_setfooter_${c.id}` },
			{ text: "🗑", callback_data: `${lang}_delfooter_${c.id}` },
		]);
	}
	rows.push([
		{ text: isFa ? "⬅️ بازگشت به راهنمای کانال" : "⬅️ Back to Channel Guide", callback_data: `${lang}_help_channel` },
	]);
	return { inline_keyboard: rows };
}
// Live preview
function previewKeyboard(userChannels) {
	const rows = [];
	for (const c of userChannels || []) {
		rows.push([{ text: `📤 ارسال به / Publish: ${c.title || c.id}`, callback_data: `pub_${c.id}` }]);
	}
	rows.push([{ text: "❌ بستن پیش‌نمایش / Close", callback_data: "preview_close" }]);
	return { inline_keyboard: rows };
}
// Undo confirmation.
function undoConfirmKeyboard(lang, channelId) {
	const isFa = lang === "fa";
	return {
		inline_keyboard: [[
			{ text: isFa ? "✅ بله، خام کن" : "✅ Yes, revert", callback_data: `${lang}_undoyes_${channelId}` },
			{ text: isFa ? "❌ خیر" : "❌ No", callback_data: `${lang}_undono` },
		]],
	};
}
const LANG_SELECT_MESSAGE = "🌐 Please choose your language / زبان خود را انتخاب کنید:";
const LANG_SELECT_KEYBOARD = {
	inline_keyboard: [[
		{ text: "🇮🇷 فارسی", callback_data: "fa_start" },
		{ text: "🇬🇧 English", callback_data: "en_start" },
	]],
};

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleMessage(message, env) {
	const chatId = message.chat.id;
	const userId = message.from?.id;
	if (!userId) return;
	const rawText = message.text || "";
	const trimmed = rawText.trim();
	await registerUser(env, userId);

	// --- FOOTER INPUT STATE ---
	const awaitFooter = await env.DB.get(`await_footer:${userId}`);
	if (awaitFooter) {
		if (trimmed.startsWith("/")) {
			await env.DB.delete(`await_footer:${userId}`);
		} else {
			const footerText = renderUserText(rawText, message.entities, DEFAULT_CONFIG) || trimmed;
			await env.DB.put(`footer:${awaitFooter}`, footerText);
			await env.DB.delete(`await_footer:${userId}`);
			await sendPlain(chatId, "✅ امضای کانال ذخیره شد. از این پس ته هر پستِ همان کانال اضافه می‌شود.\nبرای حذف، از منوی «✍️ امضای کانال» دکمه‌ی 🗑 را بزن.");
			return;
		}
	}

	// --- ADMIN COMMANDS ---
	if (userId === ADMIN_ID) {
		if (trimmed === "/stats") {
			const users = (await env.DB.get("stats:users")) || "0";
			const processed = (await env.DB.get("stats:processed")) || "0";
			const channels = await countPrefix(env, "channel:");
			const footers = await countPrefix(env, "footer:");
			const today = parseInt(await env.DB.get(`stats:posts:${dateKey(0)}`)) || 0;
			let chart = "";
			for (let i = 6; i >= 0; i--) {
				const k = dateKey(i);
				const c = parseInt(await env.DB.get(`stats:posts:${k}`)) || 0;
				const bar = c > 0 ? "▇".repeat(Math.min(c, 20)) : "·";
				chart += `${k.slice(5)}  ${bar} ${c}\n`;
			}
			const msg =
`📊 *داشبورد بات*

👥 کاربران: ${users}
🔄 کل پست‌های رندرشده: ${processed}
📢 کانال‌های فعال: ${channels}
✍️ امضاهای تنظیم‌شده: ${footers}
🗓 پست‌های امروز: ${today}

📈 ۷ روز اخیر:
\`\`\`
${chart}\`\`\``;
			await sendPlain(chatId, msg);
			return;
		}
		if (trimmed.startsWith("/broadcast ")) {
			const bText = trimmed.replace("/broadcast ", "");
			await sendPlain(chatId, "⏳ Broadcasting message...");
			let cursor = null;
			let count = 0;
			do {
				const list = await env.DB.list({ prefix: "user:", cursor });
				for (const key of list.keys) {
					const uid = key.name.split(":")[1];
					await callApi("sendMessage", { chat_id: uid, text: bText });
					count++;
				}
				cursor = list.list_complete ? null : list.cursor;
			} while (cursor);
			await sendPlain(chatId, `✅ Broadcast sent to ${count} users.`);
			return;
		}
	}

	// --- UNDO ---
	if (trimmed === "/undo") {
		const chs = await kvGetUserChannels(env, userId);
		if (!chs.length) {
			await sendPlain(chatId, "❌ هنوز کانالی ثبت نکرده‌ای.");
			return;
		}
		const rows = chs.map(c => [{ text: `↩️ ${c.title || c.id}`, callback_data: `fa_undo_${c.id}` }]);
		await callApi("sendMessage", {
			chat_id: chatId,
			text: "↩️ آخرین رندرِ کدام کانال را به متن خام برگردانم؟",
			reply_markup: { inline_keyboard: rows },
		});
		return;
	}

	// --- FOOTER command ---
	if (trimmed === "/footer") {
		const chs = await kvGetUserChannels(env, userId);
		if (!chs.length) {
			await sendPlain(chatId, "❌ اول یک کانال ثبت کن (یک پیام از کانال فوروارد کن).");
			return;
		}
		await callApi("sendMessage", {
			chat_id: chatId,
			text: "✍️ امضای کدام کانال را تنظیم/حذف کنم؟",
			reply_markup: footerMenuKeyboard("fa", chs),
		});
		return;
	}

	// --- CHANNEL AUTHORIZATION VIA FORWARD ---
	const fwdChat = message.forward_from_chat || message.forward_origin?.chat;
	if (fwdChat && fwdChat.type === "channel") {
		const channelId = fwdChat.id;
		const botInfo = await getCachedBot(env);
		const member = await callApi("getChatMember", { chat_id: channelId, user_id: botInfo.id });
		const status = member?.result?.status;
		const canEdit = member?.result?.can_edit_messages;

		if ((status === "administrator" || status === "creator") && canEdit) {
			await kvAuthorizeChannel(env, channelId);
			await kvLinkUserToChannel(env, userId, channelId, fwdChat.title || channelId.toString());

			const guideText = `✅ **کانال با موفقیت ثبت شد:** ${fwdChat.title || channelId}\n\nربات از این پس پست‌های دارای فرمت (مارک‌داون/HTML/فرمول/تگ‌های فارسی) را هنگام انتشار، به‌صورت خودکار در این کانال رندر می‌کند.\n\n---\n\n` + HELP_CHANNEL["fa"];
			const userChannels = await kvGetUserChannels(env, userId);
			await sendRichMarkdown(chatId, guideText, channelGuideKeyboard("fa", userChannels));
		} else {
			await sendPlain(chatId, `❌ **احراز هویت شکست خورد.**\nربات باید در کانال ادمین باشد و دسترسی ویرایش پیام (Edit Messages) داشته باشد.`);
		}
		return;
	}

	// --- NORMAL COMMANDS & MESSAGES ---
	if (trimmed === "/start" || trimmed === "/help") {
		await sendPlain(chatId, LANG_SELECT_MESSAGE, LANG_SELECT_KEYBOARD);
		return;
	}

	let text = renderUserText(rawText, message.entities, DEFAULT_CONFIG);
	if (!text) text = trimmed;
	if (!text) return;

	const userChannels = await kvGetUserChannels(env, userId);
	if (userChannels.length > 0) {
		await env.DB.put(`preview:${userId}`, text, { expirationTtl: TTL_PREVIEW_SEC });
		await sendRichMarkdown(chatId, text, previewKeyboard(userChannels));
	} else {
		await sendRichMarkdown(chatId, text);
	}
}

async function handleCallback(cb, env) {
	const chatId = cb.message.chat.id;
	const msgId = cb.message.message_id;
	const userId = cb.from.id;
	const data = cb.data;
	await callApi("answerCallbackQuery", { callback_query_id: cb.id });

	// --- Non-language-prefixed actions ---
	if (data.startsWith("pub_")) {
		const channelId = data.slice(4);
		const text = await env.DB.get(`preview:${userId}`);
		if (!text) {
			await sendPlain(chatId, "⛔️ پیش‌نمایش منقضی شده. دوباره متن را بفرست.");
			return;
		}
		const res = await sendRichMarkdown(channelId, text);
		if (res?.ok && res.result?.message_id) {
			await kvMarkMessageProcessed(env, channelId, res.result.message_id);
			await env.DB.put(
				`last_render:${channelId}`,
				JSON.stringify({ messageId: res.result.message_id, isCaption: false, raw: text }),
				{ expirationTtl: TTL_RENDER_SEC }
			);
			await incrementStat(env, "stats:processed");
			await incrementDailyPosts(env);
			await callApi("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
			await sendPlain(chatId, "✅ به کانال ارسال شد.");
		} else {
			await sendPlain(chatId, "⚠️ ارسال ناموفق بود. مطمئن شو ربات در کانال ادمین با دسترسی ارسال پیام است.");
		}
		return;
	}
	if (data === "preview_close") {
		await callApi("editMessageReplyMarkup", { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] } });
		return;
	}

	// --- Language-prefixed actions ---
	const lang = data.startsWith("fa_") ? "fa" : "en";
	const action = data.slice(3);
	const kb = backKeyboard(lang);
	const botInfo = await getCachedBot(env);
	const main = mainKeyboard(lang, botInfo.username);

	if (action === "start" || action === "back") {
		await editRichMarkdown(chatId, msgId, WELCOME[lang], main);
	} else if (action === "help_md") {
		await editRichMarkdown(chatId, msgId, HELP_MD[lang], kb);
	} else if (action === "help_html") {
		await editRichMarkdown(chatId, msgId, HELP_HTML[lang], kb);
	} else if (action === "help_media") {
		await editRichMarkdown(chatId, msgId, HELP_MEDIA[lang], kb);
	} else if (action === "help_channel") {
		const userChannels = await kvGetUserChannels(env, userId);
		let prefix = "";
		if (userChannels.length > 0) {
			const list = userChannels.map(c => `• ${c.title}`).join("\n");
			prefix = lang === "fa"
				? `✅ **کانال‌های ثبت‌شده‌ی شما:**\n${list}\n\nبرای افزودن کانال جدید، من را در کانال ادمین کنید و یک پیام از آنجا به اینجا فوروارد کنید.\n\n---\n`
				: `✅ **Your Authorized Channels:**\n${list}\n\nTo add a new channel, make me an admin there and forward a message here.\n\n---\n`;
		} else {
			prefix = lang === "fa"
				? `❌ **شما هنوز هیچ کانالی ثبت نکرده‌اید.**\n\nبرای افزودن کانال، من را در کانال ادمین کنید و یک پیام از آنجا به اینجا فوروارد کنید.\n\n---\n`
				: `❌ **You haven't authorized any channels yet.**\n\nTo add a channel, make me an admin there and forward a message here.\n\n---\n`;
		}
		await editRichMarkdown(chatId, msgId, prefix + HELP_CHANNEL[lang], channelGuideKeyboard(lang, userChannels));
	} else if (action === "chtags") {
		await editRichMarkdown(chatId, msgId, HELP_CHANNEL_TAGS[lang], backToChannelKeyboard(lang));
	} else if (action === "rendermenu") {
		const chs = await kvGetUserChannels(env, userId);
		await editRichMarkdown(
			chatId, msgId,
			lang === "fa" ? "⚙️ برای کدام کانال تگ‌ها را تنظیم کنم؟" : "⚙️ Choose a channel to configure tags:",
			renderMenuKeyboard(lang, chs)
		);
	} else if (action.startsWith("rcfg_")) {
		const channelId = action.slice(5);
		const conf = await getChannelConfig(env, channelId);
		await editRichMarkdown(
			chatId, msgId,
			lang === "fa" ? "⚙️ فعال/غیرفعال‌سازی تگ‌ها:" : "⚙️ Enable/Disable tags:",
			renderTogglesKeyboard(lang, channelId, conf)
		);
	} else if (action.startsWith("rtgl_")) {
		const actParts = action.match(/^rtgl_(-?\d+)_([a-z]+)$/);
		if (actParts) {
			const channelId = actParts[1];
			const key = actParts[2];
			const conf = await getChannelConfig(env, channelId);
			conf[key] = !conf[key];
			await setChannelConfig(env, channelId, conf);
			await editRichMarkdown(
				chatId, msgId,
				lang === "fa" ? "⚙️ فعال/غیرفعال‌سازی تگ‌ها:" : "⚙️ Enable/Disable tags:",
				renderTogglesKeyboard(lang, channelId, conf)
			);
		}
	} else if (action === "footermenu") {
		const chs = await kvGetUserChannels(env, userId);
		await editRichMarkdown(
			chatId, msgId,
			lang === "fa" ? "✍️ امضای کدام کانال را تنظیم/حذف کنم؟" : "✍️ Set/remove footer for which channel?",
			footerMenuKeyboard(lang, chs)
		);
	} else if (action.startsWith("setfooter_")) {
		const channelId = action.slice("setfooter_".length);
		await env.DB.put(`await_footer:${userId}`, channelId, { expirationTtl: TTL_AWAIT_SEC });
		await editRichMarkdown(
			chatId, msgId,
			lang === "fa"
				? "✍️ حالا **متن امضا** را بفرست. می‌تونی چند لینک و استایل بذاری. مثال:\n\n`📌 کانال ما` — [عضویت](https://t.me/yourchannel) | [سایت](https://example.com)"
				: "✍️ Now send the **footer text**. You can include multiple links/styles. Example:\n\n`📌 Our channel` — [Join](https://t.me/yourchannel) | [Site](https://example.com)",
			null
		);
	} else if (action.startsWith("delfooter_")) {
		const channelId = action.slice("delfooter_".length);
		await env.DB.delete(`footer:${channelId}`);
		const chs = await kvGetUserChannels(env, userId);
		await editRichMarkdown(
			chatId, msgId,
			lang === "fa" ? "🗑 امضای این کانال حذف شد." : "🗑 Footer removed for this channel.",
			footerMenuKeyboard(lang, chs)
		);
	} else if (action.startsWith("off_")) {
		const channelId = action.slice(4);
		await kvDeauthorizeChannel(env, channelId);
		await kvUnlinkUserFromChannel(env, userId, channelId);
		const userChannels = await kvGetUserChannels(env, userId);
		const confirm = lang === "fa"
			? `🔌 **اتصال قطع شد.** ربات دیگر پست‌های آن کانال را قالب‌بندی نمی‌کند.\nهر زمان خواستی دوباره وصل کنی، کافیست یک پیام از کانال را به اینجا فوروارد کنی.\n\n---\n`
			: `🔌 **Disconnected.** The bot will no longer format posts in that channel.\nTo reconnect anytime, just forward a message from the channel here.\n\n---\n`;
		await editRichMarkdown(chatId, msgId, confirm + HELP_CHANNEL[lang], channelGuideKeyboard(lang, userChannels));
	} else if (action.startsWith("undoyes_")) {
		const channelId = action.slice("undoyes_".length);
		const last = await env.DB.get(`last_render:${channelId}`, "json");
		if (!last) {
			await editRichMarkdown(chatId, msgId, "❌ چیزی برای بازگردانی پیدا نشد.", null);
			return;
		}
		let r;
		if (last.isCaption) {
			r = await callApi("editMessageCaption", { chat_id: channelId, message_id: last.messageId, caption: last.raw });
		} else {
			r = await callApi("editMessageText", { chat_id: channelId, message_id: last.messageId, text: last.raw });
		}
		if (r?.ok) {
			await env.DB.delete(`last_render:${channelId}`);
			await env.DB.delete(`processed:${channelId}:${last.messageId}`);
			await editRichMarkdown(chatId, msgId, "✅ آخرین رندر به متن خام برگردانده شد.", null);
		} else {
			await editRichMarkdown(chatId, msgId, "⚠️ بازگردانی ناموفق بود (شاید پیام خیلی قدیمی است یا حذف شده).", null);
		}
	} else if (action === "undono") {
		await editRichMarkdown(chatId, msgId, "باشه، تغییری اعمال نشد.", null);
	} else if (action.startsWith("undo_")) {
		const channelId = action.slice("undo_".length);
		const last = await env.DB.get(`last_render:${channelId}`, "json");
		if (!last) {
			await editRichMarkdown(chatId, msgId, "❌ برای این کانال رندری ثبت نشده.", null);
			return;
		}
		await editRichMarkdown(
			chatId, msgId,
			"⚠️ آخرین رندرِ این کانال را به **متن خام** برگردانم؟",
			undoConfirmKeyboard(lang, channelId)
		);
	} else if (action === "demo") {
		await editRichMarkdown(chatId, msgId, DEMO[lang], kb);
	} else if (action === "about") {
		await editRichMarkdown(chatId, msgId, ABOUT[lang], kb);
	}
}

// ─── Channel Post Formatter ───────────────────────────────────────────────────
async function handleChannelPost(post, env) {
	const channelId = post.chat?.id;
	const messageId = post.message_id;
	if (!channelId || !messageId) return;
	if (!(await kvIsChannelAuthorized(env, channelId))) return;
	if (await kvHasProcessedMessage(env, channelId, messageId)) return;

	const isCaption = post.caption !== undefined;
	const rawText = isCaption ? post.caption : post.text;
	const entities = isCaption ? post.caption_entities : post.entities;
	if (!rawText || !rawText.trim()) return;

	const footer = await env.DB.get(`footer:${channelId}`);
	const config = await getChannelConfig(env, channelId);

	// Skip posts with no real formatting, UNLESS a footer is set (so we still append it).
	if (!hasRealFormatting(rawText) && !isAllMediaUrls(rawText) && !footer) return;

	let text = renderUserText(rawText, entities, config);
	if (!text) text = rawText.trim();

	// Append auto channel footer
	if (footer) text = text + "\n\n" + footer;

	await env.DB.put(
		`last_render:${channelId}`,
		JSON.stringify({ messageId, isCaption, raw: rawText }),
		{ expirationTtl: TTL_RENDER_SEC }
	);

	await kvMarkMessageProcessed(env, channelId, messageId);

	let res;
	if (isCaption) {
		res = await callApi("editMessageCaption", {
			chat_id: channelId,
			message_id: messageId,
			caption: mdInlineToHtml(text),
			parse_mode: "HTML",
		});
	} else {
		res = await callApi("editMessageText", {
			chat_id: channelId,
			message_id: messageId,
			rich_message: { markdown: text, is_rtl: isRtl(text) },
		});
	}

	if (res?.ok) {
		await kvAuthorizeChannel(env, channelId);
		await incrementStat(env, "stats:processed");
		await incrementDailyPosts(env);
	}
}

// ─── Render pipeline ──────────────────────────────────────────────────────────
function renderUserText(rawText, entities, config) {
	let text = entitiesToMarkdown(rawText, entities);
	if (config.media) text = autoGroupMedia(text);
	text = applyCustomSyntax(text, config);
	text = text.trim();
	text = preserveManualSpacing(text);
	return text;
}

function applyCustomSyntax(text, config) {
	if (config.quote) {
		text = applyPullQuote(text);
	}
	if (config.time) {
		text = text.replace(/\[(?:زمان|تایمر|time|timer)\s*:\s*([^\]]+)\]/g, (_, v) => {
			const t = Date.parse(v.trim());
			return isNaN(t) ? `<tg-time>${v.trim()}</tg-time>` : `<tg-time unix="${Math.floor(t / 1000)}"/>`;
		});
	}
	if (config.map) {
		text = text.replace(
			/\[(?:نقشه|map)\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\]/g,
			'<tg-map latitude="$1" longitude="$2"/>'
		);
	}
	if (config.code) {
		text = text.replace(/\/\/\/([\s\S]+?)\/\/\//g, "```\n$1\n```");
	}
	if (config.expand) {
		text = text.replace(/\?\?\?([\s\S]+?)\?\?\?/g, "<details>\n<summary>🔽</summary>\n\n$1\n\n</details>");
		text = text.replace(/\[(?:کشویی|expand)\]([\s\S]+?)\[\/(?:کشویی|expand)\]/g, "<details>\n<summary>🔽</summary>\n\n$1\n\n</details>");
	}
	if (config.media) {
		text = text.replace(/\[(?:اسلایدشو|slideshow)\]([\s\S]+?)\[\/(?:اسلایدشو|slideshow)\]/g, "<tg-slideshow>\n$1\n</tg-slideshow>");
		text = text.replace(/\[(?:کلاژ|collage)\]([\s\S]+?)\[\/(?:کلاژ|collage)\]/g, "<tg-collage>\n$1\n</tg-collage>");
	}
	if (config.spoiler) {
		text = text.replace(/^🙈[ \t]*(.+)$/gm, "<tg-spoiler>$1</tg-spoiler>");
	}
	return text;
}

function applyPullQuote(text) {
	return text.replace(/"""([\s\S]+?)"""/g, (_, body) => {
		const lines = body.trim().split("\n");
		let credit = "";
		if (lines.length > 1 && /^\s*[—\-]\s*/.test(lines[lines.length - 1])) {
			credit = lines.pop().replace(/^\s*[—\-]\s*/, "").trim();
		}
		const quote = lines.join("\n").trim();
		return credit ? `<aside>${quote}<cite>${credit}</cite></aside>` : `<aside>${quote}</aside>`;
	});
}

function autoGroupMedia(text) {
	if (!isAllMediaUrls(text)) return text;
	const media = text.split("\n").map(l => l.trim()).filter(Boolean).map(u => `![](${u})`).join("\n");
	return `<tg-slideshow>\n${media}\n</tg-slideshow>`;
}

// ─── Preserve manual spacing ──────────────────────────────────────────────────
function preserveManualSpacing(text) {
	const NBSP = "\u00A0";
	const fences = [];
	text = text.replace(/```[\s\S]*?```/g, m => {
		fences.push(m);
		return `\u0000F${fences.length - 1}\u0000`;
	});
	const out = text.split("\n").map(line => {
		if (/\u0000F\d+\u0000/.test(line)) return line;
		if (/^\s*\|.*\|\s*$/.test(line)) return line;
		const codes = [];
		let l = line.replace(/`[^`\n]*`/g, m => {
			codes.push(m);
			return `\u0000C${codes.length - 1}\u0000`;
		});
		l = l.replace(/ {2,}/g, m => NBSP.repeat(m.length));
		l = l.replace(/\u0000C(\d+)\u0000/g, (_, i) => codes[Number(i)]);
		return l;
	}).join("\n");
	return out.replace(/\u0000F(\d+)\u0000/g, (_, i) => fences[Number(i)]);
}

// ─── Format Detectors & Helpers ───────────────────────────────────────────────
function hasRealFormatting(t) {
	return (
		/\*\*[^\n]+?\*\*/.test(t) ||
		/__[^\n]+?__/.test(t) ||
		/~~[^\n]+?~~/.test(t) ||
		/`[^`\n]+?`/.test(t) ||
		/```[\s\S]+?```/.test(t) ||
		/\/\/\/[\s\S]+?\/\/\//.test(t) ||
		/\?\?\?[\s\S]+?\?\?\?/.test(t) ||
		/"""[\s\S]+?"""/.test(t) ||
		/\[(?:زمان|تایمر|time|timer)\s*:/.test(t) ||
		/\[(?:نقشه|map)\s*:/.test(t) ||
		/\[(?:اسلایدشو|slideshow|کلاژ|collage|کشویی|expand)\]/.test(t) ||
		/[🙈🔽]/.test(t) ||
		/(^|\n)\s{0,3}#{1,6}\s+\S/.test(t) ||
		/(^|\n)\s*[-*+]\s*\[[ xX]\]\s+\S/.test(t) ||
		/(^|\n)\s*[-*+]\s+\S/.test(t) ||
		/(^|\n)\s*\d+\.\s+\S/.test(t) ||
		/(^|\n)\s*>\s+\S/.test(t) ||
		/\[[^\]\n]+\]\([^)\n]+\)/.test(t) ||
		/(^|\n)\s*\|.+\|\s*(\n|$)/.test(t) ||
		/\$\$[\s\S]+?\$\$/.test(t) ||
		/\$[^$\n]+\$/.test(t) ||
		/<\/?\w+[^>]*>/.test(t)
	);
}
function isAllMediaUrls(t) {
	const lines = (t || "").split("\n").map(l => l.trim()).filter(Boolean);
	return lines.length >= 2 && lines.every(l => /^https?:\/\/\S+$/.test(l));
}
function isRtl(s) {
	return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(s || "");
}
function escapeHtml(s) {
	return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mdInlineToHtml(md) {
	let s = escapeHtml(String(md));
	s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
	s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
	s = s.replace(/\|\|(.+?)\|\|/g, "<tg-spoiler>$1</tg-spoiler>");
	s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<i>$2</i>");
	s = s.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
	s = s.replace(/\[([^\]\n]+?)\]\((https?:\/\/[^)\n]+)\)/g, '<a href="$2">$1</a>');
	return s;
}

// ─── Convert Telegram message entities back into Markdown source ──────────────
function entitiesToMarkdown(text, entities) {
	if (!entities || !entities.length) return text;
	const items = entities.map((e, idx) => ({ e, idx, start: e.offset, end: e.offset + e.length }));
	function isTopLevel(item, pool) {
		return !pool.some(other => {
			if (other.idx === item.idx) return false;
			const strictlyLarger = other.start <= item.start && other.end >= item.end &&
				(other.start < item.start || other.end > item.end);
			const sameSpanOuter = other.start === item.start && other.end === item.end && other.idx < item.idx;
			return strictlyLarger || sameSpanOuter;
		});
	}
	function render(start, end, pool) {
		const inRange = pool.filter(it => it.start >= start && it.end <= end);
		const top = inRange.filter(it => isTopLevel(it, inRange)).sort((a, b) => a.start - b.start);
		let out = "";
		let pos = start;
		for (const item of top) {
			out += text.slice(pos, item.start);
			const innerPool = pool.filter(p => p.idx !== item.idx);
			const inner = render(item.start, item.end, innerPool);
			out += wrapEntity(item.e, inner);
			pos = item.end;
		}
		out += text.slice(pos, end);
		return out;
	}
	return render(0, text.length, items);
}
function wrapEntity(e, content) {
	switch (e.type) {
		case "bold": return `**${content}**`;
		case "italic": return `*${content}*`;
		case "underline": return `<u>${content}</u>`;
		case "strikethrough": return `~~${content}~~`;
		case "spoiler": return `<tg-spoiler>${content}</tg-spoiler>`;
		case "code": return "`" + content + "`";
		case "pre": return "```" + (e.language || "") + "\n" + content + "\n```";
		case "text_link": return `[${content}](${e.url})`;
		case "text_mention": return e.user ? `[${content}](tg://user?id=${e.user.id})` : content;
		case "blockquote":
		case "expandable_blockquote":
			return content.split("\n").map(l => `> ${l}`).join("\n");
		default: return content;
	}
}

// ─── API helpers ──────────────────────────────────────────────────────────────
async function sendPlain(chatId, text, replyMarkup) {
	const body = { chat_id: chatId, text, parse_mode: "Markdown" };
	if (replyMarkup) body.reply_markup = replyMarkup;
	await callApi("sendMessage", body);
}
async function sendRichMarkdown(chatId, markdown, replyMarkup) {
	const body = { chat_id: chatId, rich_message: { markdown, is_rtl: isRtl(markdown) } };
	if (replyMarkup) body.reply_markup = replyMarkup;
	const res = await callApi("sendRichMessage", body);
	if (!res?.ok) {
		const fb = { chat_id: chatId, text: markdown };
		if (replyMarkup) fb.reply_markup = replyMarkup;
		const fbRes = await callApi("sendMessage", fb);
		return fbRes;
	}
	return res;
}
async function editRichMarkdown(chatId, messageId, markdown, replyMarkup) {
	const body = { chat_id: chatId, message_id: messageId, rich_message: { markdown, is_rtl: isRtl(markdown) } };
	if (replyMarkup) body.reply_markup = replyMarkup;
	await callApi("editMessageText", body);
}
async function callApi(method, body) {
	const res = await fetch(`${TELEGRAM_API}/${method}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	let json = null;
	try { json = await res.json(); } catch { json = null; }
	if (!res.ok) {
		console.error(`[${method}] failed`, res.status, json || await res.text().catch(() => ""));
	}
	return json;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT
// ═══════════════════════════════════════════════════════════════════════════════
const WELCOME = {
	fa: [
		"# 🤖 Rich Markdown Bot",
		"",
		"هر متن **Markdown** بفرستید، به‌صورت Rich Message رندر می‌شود. می‌توانید وسط همان متن، تگ‌های HTML تلگرام (مثل `<tg-spoiler>` یا `<details>`) یا فرمول (`$x^2$`) هم بگذارید؛ بقیه‌ی فرمت‌های دستی‌تان سالم می‌ماند.",
		"همچنین می‌توانید بات را به کانال خود اضافه کنید تا پست‌ها خودکار قالب‌بندی شوند.",
		"",
		"🧰 دستورها: `/footer` (امضای کانال) · `/undo` (بازگردانی آخرین پست)",
		"از دکمه‌های زیر برای دیدن راهنما و دمو استفاده کنید 👇",
	].join("\n"),
	en: [
		"# 🤖 Rich Markdown Bot",
		"",
		"Send any **Markdown** text and it is echoed back as a rendered Rich Message. You can mix in Telegram HTML tags (e.g. `<tg-spoiler>`, `<details>`) or formulas (`$x^2$`) right inside it — the rest of your manual formatting stays intact.",
		"You can also add this bot to your channel to auto-format posts.",
		"",
		"🧰 Commands: `/footer` (channel footer) · `/undo` (revert last post)",
		"Use the buttons below to explore 👇",
	].join("\n"),
};
const ABOUT = {
	fa: [
		"# ℹ️ درباره بات",
		"",
		"این بات پیام‌های شما را با فرمت مدرن **Rich Message** تلگرام رندر می‌کند. حالت پایه «مارک‌داون» است و چون مارک‌داونِ تلگرام می‌تواند HTML را هم در خودش جا بدهد، برای استفاده از یک تگ یا فرمول، دیگر لازم نیست کل متن را HTML کنید؛ همین یعنی فاصله‌ها و بولدهای دستی‌تان هیچ‌وقت نمی‌پرند.",
	].join("\n"),
	en: [
		"# ℹ️ About",
		"",
		"This bot renders your messages using Telegram's modern **Rich Message** format. The base mode is Markdown, and since Telegram Markdown can embed HTML, you can drop in a single tag or formula without forcing the whole message into HTML — so your manual spacing and bold never get wiped.",
	].join("\n"),
};
const HELP_CHANNEL = {
	fa: [
		"### 🛠 آموزش اتصال کانال:",
		"1. ربات را به کانال خود به‌عنوان **ادمین** اضافه کنید.",
		"2. دسترسی **Edit Messages** (ویرایش پیام‌ها) را به آن بدهید.",
		"3. یک پیام از کانال خود به همین‌جا (داخل بات) **Forward** کنید.",
		"",
		"پس از تأیید، هر پستی که فرمت داشته باشد (مارک‌داون، HTML، فرمول، یا تگ‌های فارسی) در لحظه رندر می‌شود!",
		"",
		"*(پست‌های بدون هیچ فرمتی نادیده گرفته می‌شوند تا برچسب «Edited» نخورند)* ✨",
		"",
		"🧰 **امکانات مدیریتی:**",
		"- ✍️ **امضای کانال**: یک فوتر ثابت (با چند لینک) ته هر پست. از دکمه‌ی زیر یا `/footer`.",
		"- ⚙️ **تنظیمات تگ‌ها**: فعال/غیرفعال کردن قابلیت‌های رندر (مثل اسلایدشو، نقشه و...) برای هر کانال.",
		"- ↩️ **بازگردانی**: با `/undo` آخرین رندر کانال را به متن خام برگردان.",
		"",
		"برای دیدن تگ‌های مخصوص کانال و میان‌بُرهای فارسی، دکمه‌ی زیر را بزنید 👇",
	].join("\n"),
	en: [
		"### 🛠 How to setup:",
		"1. Add the bot to your channel as an **administrator**.",
		"2. Grant it the **Edit Messages** permission.",
		"3. **Forward** any message from your channel to this bot.",
		"",
		"Once authorized, any post containing formatting (Markdown, HTML, formulas, or the shorthand tags) is rendered instantly!",
		"",
		"*(Posts without any formatting are safely ignored to avoid the \"Edited\" label)* ✨",
		"",
		"🧰 **Management:**",
		"- ✍️ **Channel footer**: a fixed footer (with multiple links) appended to every post. Use the button below or `/footer`.",
		"- ⚙️ **Render Settings**: Enable/Disable specific formatting tags (like map, slideshow) per channel.",
		"- ↩️ **Undo**: use `/undo` to revert a channel's last render back to raw text.",
		"",
		"Tap below to see channel-only tags and shortcuts 👇",
	].join("\n"),
};
const HELP_CHANNEL_TAGS = {
	fa: [
		"# 🏷 تگ‌های مخصوص کانال و میان‌بُرها",
		"",
		"چون حالت پایه مارک‌داون است، می‌توانی هر تگ یا فرمول را وسط متن عادی بگذاری و **بقیه‌ی متن دست‌نخورده** می‌ماند.",
		"",
		"---",
		"## ✍️ میان‌بُرهای ساده (بدون تگ خام)",
		"- `///کد///` → بلوک کد",
		"- `???متن???` → بلوک **کشویی/بازشو**",
		"- `\"\"\"نقل‌قول — نویسنده\"\"\"` → **نقل‌قول وسط‌چین** با امضا",
		"- `[زمان: 2026-07-01 20:00]` → **زمان زنده** (در تایم‌زون هر کاربر)",
		"- `[نقشه: 35.7, 51.4]` → **نقشه**",
		"- `[اسلایدشو] ... [/اسلایدشو]` / `[کلاژ] ... [/کلاژ]` / `[کشویی] ... [/کشویی]`",
		"- خط شروع‌شده با 🙈 → آن خط **اسپویلر** می‌شود",
		"- فقط چند **لینک مدیا** پشت‌سرهم بفرست → خودکار **اسلایدشو** می‌شود",
		"",
		"---",
		"## ✅ روی پیام متنی کانال کار می‌کند",
		"- هدینگ (`# عنوان`)، نقل‌قول (`> ...`)",
		"- لیست و تسک (`- [ ]` و `- [x]`)",
		"- جدول، بلوک کد، و فرمول (`$...$` و `$$...$$`)",
		"- بلوک کشویی `<details>` و اسپویلر `<tg-spoiler>`",
		"- همه‌ی استایل‌های inline (بولد، ایتالیک، خط‌خورده، کد، لینک)",
		"",
		"---",
		"## ⚠️ روی کپشن مدیا کار نمی‌کند",
		"فقط استایل‌های inline رندر می‌شوند:",
		"**بولد** · *ایتالیک* · ~~خط‌خورده~~ · `کد` · [لینک](https://t.me/) · ||اسپویلر||",
		"هدینگ، لیست، جدول، بلوک کد و فرمول روی کپشن نمایش داده **نمی‌شوند**.",
		"",
		"> 💡 اگر به todo / جدول / هدینگ نیاز داری، پست را به‌صورت **متنی** (بدون عکس) بفرست.",
	].join("\n"),
	en: [
		"# 🏷 Channel-only Tags & Shortcuts",
		"",
		"Since the base mode is Markdown, you can drop any tag or formula into normal text and **the rest stays untouched**.",
		"",
		"---",
		"## ✍️ Simple shortcuts (no raw tags)",
		"- `///code///` → code block",
		"- `???text???` → **expandable/collapsible** block",
		"- `\"\"\"quote — author\"\"\"` → **centered pull-quote** with credit",
		"- `[time: 2026-07-01 20:00]` → **live time** (in each user's timezone)",
		"- `[map: 35.7, 51.4]` → **map** embed",
		"- `[slideshow] ... [/slideshow]` / `[collage] ... [/collage]` / `[expand] ... [/expand]`",
		"- a line starting with 🙈 → that line becomes a **spoiler**",
		"- send just a few **media URLs** in a row → auto **slideshow**",
		"",
		"---",
		"## ✅ Works on channel text posts",
		"- Headings (`# Title`), quotes (`> ...`)",
		"- Lists & tasks (`- [ ]`, `- [x]`)",
		"- Tables, code blocks, formulas (`$...$`, `$$...$$`)",
		"- Expandable `<details>` and `<tg-spoiler>`",
		"- All inline styles (bold, italic, strike, code, links)",
		"",
		"---",
		"## ⚠️ Does NOT work on media captions",
		"Only inline styles render:",
		"**bold** · *italic* · ~~strike~~ · `code` · [link](https://t.me/) · ||spoiler||",
		"Headings, lists, tables, code blocks and formulas are **not** shown on captions.",
		"",
		"> 💡 If you need todos / tables / headings, send the post as **text** (no photo).",
	].join("\n"),
};
const HELP_MD = {
	fa: [
		"# 📖 راهنمای Markdown",
		"",
		"متن Markdown بفرست، رندرشده برمی‌گردد. کادر خاکستری = چیزی که تایپ می‌کنی ↓ نتیجه بعدش می‌آید.",
		"",
		"---",
		"## استایل متن",
		"```",
		"**بولد** *ایتالیک* ~~خط‌خورده~~",
		"`کد`  ==های‌لایت==  <u>آندرلاین</u>  <tg-spoiler>اسپویلر</tg-spoiler>",
		"```",
		"**بولد** *ایتالیک* ~~خط‌خورده~~ `کد` ==های‌لایت== <u>آندرلاین</u> <tg-spoiler>اسپویلر</tg-spoiler>",
		"",
		"---",
		"## هدینگ",
		"```",
		"# هدینگ ۱",
		"## هدینگ ۲",
		"### هدینگ ۳",
		"```",
		"",
		"---",
		"## لیست‌ها",
		"```",
		"- شیر",
		"- تخم‌مرغ",
		"- [ ] کار انجام‌نشده",
		"- [x] کار انجام‌شده",
		"",
		"1. بیدار شو",
		"2. منتشر کن",
		"```",
		"",
		"---",
		"## نقل‌قول و فرمول",
		"```",
		"> نقل‌قول با **بولد**",
		"فرمول داخل‌خطی $E = mc^2$",
		"$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$",
		"```",
		"",
		"---",
		"## بلوک کد",
		"```",
		"///",
		"print(\"hello\")",
		"///",
		"```",
		"💡 می‌توانی هر تگ HTML تلگرام را هم وسط همین مارک‌داون بگذاری؛ لازم نیست کل پیام HTML شود.",
	].join("\n"),
	en: [
		"# 📖 Markdown Guide",
		"",
		"Send Markdown text and get it echoed back rendered. Grey box = what you type ↓ result comes right after.",
		"",
		"---",
		"## Text styles",
		"```",
		"**bold** *italic* ~~strike~~",
		"`code`  ==marked==  <u>underline</u>  <tg-spoiler>spoiler</tg-spoiler>",
		"```",
		"**bold** *italic* ~~strike~~ `code` ==marked== <u>underline</u> <tg-spoiler>spoiler</tg-spoiler>",
		"",
		"---",
		"## Headings",
		"```",
		"# Heading 1",
		"## Heading 2",
		"### Heading 3",
		"```",
		"",
		"---",
		"## Lists",
		"```",
		"- milk",
		"- eggs",
		"- [ ] todo",
		"- [x] done",
		"",
		"1. wake up",
		"2. ship it",
		"```",
		"",
		"---",
		"## Quotes & formulas",
		"```",
		"> Quote with **bold**",
		"Inline formula $E = mc^2$",
		"$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$",
		"```",
		"",
		"---",
		"## Code block",
		"```",
		"///",
		"print(\"hello\")",
		"///",
		"```",
		"💡 You can also drop any Telegram HTML tag right inside this Markdown — no need to make the whole message HTML.",
	].join("\n"),
};
const HELP_HTML = {
	fa: [
		"# 🌐 راهنمای HTML",
		"",
		"تگ‌های HTML تلگرام را می‌توانی **هرجای متن** بگذاری (لازم نیست پیام با `<` شروع شود).",
		"",
		"---",
		"## استایل متن",
		"```",
		"<b>بولد</b> <i>ایتالیک</i> <u>آندرلاین</u>",
		"<s>خط‌خورده</s> <code>کد</code> <mark>های‌لایت</mark>",
		"<tg-spoiler>اسپویلر</tg-spoiler>",
		"```",
		"<b>بولد</b> <i>ایتالیک</i> <u>آندرلاین</u> <s>خط‌خورده</s> <code>کد</code> <mark>های‌لایت</mark> <tg-spoiler>اسپویلر</tg-spoiler>",
		"",
		"---",
		"## بلوک کشویی و نقل‌قول",
		"```",
		"<details><summary>عنوان</summary>محتوای بازشو</details>",
		"<blockquote>نقل‌قول</blockquote>",
		"<aside>نقل‌قول وسط‌چین<cite>نویسنده</cite></aside>",
		"```",
		"",
		"---",
		"## لیست و جدول",
		"```",
		"<ul><li>شیر</li><li>تخم‌مرغ</li></ul>",
		"<ol><li>اول</li><li>دوم</li></ol>",
		"<table><tr><th>سر</th><th>ستون</th></tr><tr><td>۱</td><td>۲</td></tr></table>",
		"```",
		"",
		"---",
		"## فرمول",
		"```",
		"<tg-math>x^2 + y^2</tg-math>",
		"<tg-math-block>E = mc^2</tg-math-block>",
		"```",
	].join("\n"),
	en: [
		"# 🌐 HTML Guide",
		"",
		"You can put Telegram HTML tags **anywhere** in your text (the message doesn't need to start with `<`).",
		"",
		"---",
		"## Text styles",
		"```",
		"<b>bold</b> <i>italic</i> <u>underline</u>",
		"<s>strike</s> <code>code</code> <mark>marked</mark>",
		"<tg-spoiler>spoiler</tg-spoiler>",
		"```",
		"<b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>code</code> <mark>marked</mark> <tg-spoiler>spoiler</tg-spoiler>",
		"",
		"---",
		"## Expandable & quotes",
		"```",
		"<details><summary>Title</summary>Collapsible content</details>",
		"<blockquote>Quote</blockquote>",
		"<aside>Centered pull-quote<cite>Author</cite></aside>",
		"```",
		"",
		"---",
		"## Lists & tables",
		"```",
		"<ul><li>milk</li><li>eggs</li></ul>",
		"<ol><li>first</li><li>second</li></ol>",
		"<table><tr><th>Head</th><th>Col</th></tr><tr><td>1</td><td>2</td></tr></table>",
		"```",
		"",
		"---",
		"## Formulas",
		"```",
		"<tg-math>x^2 + y^2</tg-math>",
		"<tg-math-block>E = mc^2</tg-math-block>",
		"```",
	].join("\n"),
};
const HELP_MEDIA = {
	fa: [
		"# 🖼 راهنمای مدیا",
		"",
		"می‌توانی عکس/ویدیو/فایل را داخل پیام Rich جاسازی کنی یا چند مدیا را گروهی نمایش بدهی.",
		"",
		"---",
		"## عکس و ویدیو تکی",
		"```",
		"![کپشن](https://example.com/photo.jpg)",
		"<video src=\"[https://example.com/clip.mp4](https://example.com/clip.mp4)\"></video>",
		"```",
		"💡 لینک باید مستقیم و http/https باشد.",
		"",
		"---",
		"## اسلایدشو و کلاژ",
		"```",
		"[اسلایدشو]",
		"![](https://example.com/1.jpg)",
		"![](https://example.com/2.jpg)",
		"[/اسلایدشو]",
		"```",
		"یا با تگ خام:",
		"```",
		"<tg-slideshow>",
		"![]([https://example.com/1.jpg](https://example.com/1.jpg))",
		"![]([https://example.com/2.jpg](https://example.com/2.jpg))",
		"</tg-slideshow>",
		"```",
		"💡 میان‌بُر: اگر فقط چند **لینک مدیا** را پشت‌سرهم (هر خط یکی) بفرستی، خودکار به اسلایدشو تبدیل می‌شود.",
		"",
		"---",
		"## نقشه",
		"```",
		"[نقشه: 35.6892, 51.3890]",
		"```",
	].join("\n"),
	en: [
		"# 🖼 Media Guide",
		"",
		"You can embed photos/videos/files in a Rich message or display several media as a group.",
		"",
		"---",
		"## Single photo & video",
		"```",
		"![caption](https://example.com/photo.jpg)",
		"<video src=\"[https://example.com/clip.mp4](https://example.com/clip.mp4)\"></video>",
		"```",
		"💡 The link must be a direct http/https URL.",
		"",
		"---",
		"## Slideshow & collage",
		"```",
		"[slideshow]",
		"![](https://example.com/1.jpg)",
		"![](https://example.com/2.jpg)",
		"[/slideshow]",
		"```",
		"Or with the raw tag:",
		"```",
		"<tg-slideshow>",
		"![]([https://example.com/1.jpg](https://example.com/1.jpg))",
		"![]([https://example.com/2.jpg](https://example.com/2.jpg))",
		"</tg-slideshow>",
		"```",
		"💡 Shortcut: send just a few **media URLs** in a row (one per line) and they auto-group into a slideshow.",
		"",
		"---",
		"## Map",
		"```",
		"[map: 35.6892, 51.3890]",
		"```",
	].join("\n"),
};
const DEMO = {
	fa: [
		"# 🎨 دمو کامل",
		"",
		"این یک نمونه از همه‌ی امکانات با هم است:",
		"",
		"## ۱) استایل‌ها",
		"**بولد** · *ایتالیک* · ~~خط‌خورده~~ · `کد` · <u>آندرلاین</u> · <tg-spoiler>اسپویلر</tg-spoiler>",
		"",
		"## ۲) لیست و تسک",
		"- مورد اول",
		"- مورد دوم",
		"- [x] انجام شد",
		"- [ ] در انتظار",
		"",
		"## ۳) نقل‌قول",
		"> دانش، قدرت است. **همیشه**.",
		"",
		"## ۴) نقل‌قول وسط‌چین",
		"<aside>سادگی، اوجِ ظرافت است.<cite>داوینچی</cite></aside>",
		"",
		"## ۵) فرمول",
		"داخل‌خطی $a^2 + b^2 = c^2$ و بلوکی:",
		"$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$",
		"",
		"## ۶) بلوک کد",
		"```python",
		"def hi():",
		"    print(\"سلام دنیا\")",
		"```",
		"",
		"## ۷) جدول",
		"| نام | امتیاز |",
		"|-----|--------|",
		"| علی | ۹۵ |",
		"| رضا | ۸۸ |",
		"",
		"## ۸) بلوک کشویی",
		"<details><summary>برای دیدن بزن</summary>محتوای مخفی اینجاست 🎉</details>",
		"",
		"## ۹) زمان زنده و نقشه",
		"[زمان: 2026-07-01 20:00]",
		"[نقشه: 35.6892, 51.3890]",
	].join("\n"),
	en: [
		"# 🎨 Full Demo",
		"",
		"A sample showing every feature together:",
		"",
		"## 1) Styles",
		"**bold** · *italic* · ~~strike~~ · `code` · <u>underline</u> · <tg-spoiler>spoiler</tg-spoiler>",
		"",
		"## 2) Lists & tasks",
		"- first item",
		"- second item",
		"- [x] done",
		"- [ ] pending",
		"",
		"## 3) Quote",
		"> Knowledge is power. **Always**.",
		"",
		"## 4) Pull-quote",
		"<aside>Simplicity is the ultimate sophistication.<cite>Da Vinci</cite></aside>",
		"",
		"## 5) Formulas",
		"Inline $a^2 + b^2 = c^2$ and block:",
		"$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$",
		"",
		"## 6) Code block",
		"```python",
		"def hi():",
		"    print(\"hello world\")",
		"```",
		"",
		"## 7) Table",
		"| Name | Score |",
		"|------|-------|",
		"| Ali  | 95 |",
		"| Reza | 88 |",
		"",
		"## 8) Expandable",
		"<details><summary>Tap to reveal</summary>Hidden content here 🎉</details>",
		"",
		"## 9) Live time & map",
		"[time: 2026-07-01 20:00]",
		"[map: 35.6892, 51.3890]",
	].join("\n"),
};
