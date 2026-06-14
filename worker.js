/**
 * Telegram Rich Markdown Bot — Cloudflare Worker
 * ÐΛɌ₭ᑎΞ𐒡𐒡 https://github.com/DarknessShade
 * Bot API 10.1
 */

const BOT_TOKEN = "Enter your Telegram bot token";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export default {
  async fetch(request) {
    if (request.method === "GET") return new Response("✅ Bot is running!", { status: 200 });
    if (request.method !== "POST") return new Response("OK");

    let update;
    try { update = await request.json(); } catch { return new Response("Bad JSON", { status: 400 }); }

    try {
      const message       = update.message;
      const callbackQuery = update.callback_query;
      if (callbackQuery) await handleCallback(callbackQuery);
      else if (message?.text) await handleMessage(message);
    } catch (err) {
      console.error("Handler error:", err && err.stack ? err.stack : err);
      // Try to notify the chat if possible, but never fail the response
      try {
        const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
        if (chatId) {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `⚠️ Internal error: ${err?.message || err}` }),
          });
        }
      } catch {}
    }

    // ALWAYS return 200 — Telegram disables webhooks after repeated non-200 responses
    return new Response("OK", { status: 200 });
  },
};

// ─── Keyboards ────────────────────────────────────────────────────────────────
function mainKeyboard(lang) {
  if (lang === "fa") return {
    inline_keyboard: [
      [
        { text: "📖 راهنمای Markdown", callback_data: "fa_help_md"   },
        { text: "🌐 راهنمای HTML",     callback_data: "fa_help_html" },
      ],
      [
        { text: "🖼 راهنمای مدیا", callback_data: "fa_help_media" },
      ],
      [
        { text: "🎨 دمو کامل",   callback_data: "fa_demo"  },
        { text: "ℹ️ درباره بات", callback_data: "fa_about" },
      ],
      [
        { text: "🇬🇧 Switch to English", callback_data: "en_start" },
      ],
    ],
  };
  return {
    inline_keyboard: [
      [
        { text: "📖 Markdown Guide", callback_data: "en_help_md"   },
        { text: "🌐 HTML Guide",     callback_data: "en_help_html" },
      ],
      [
        { text: "🖼 Media Guide", callback_data: "en_help_media" },
      ],
      [
        { text: "🎨 Full Demo", callback_data: "en_demo"  },
        { text: "ℹ️ About",     callback_data: "en_about" },
      ],
      [
        { text: "🇮🇷 تغییر به فارسی", callback_data: "fa_start" },
      ],
    ],
  };
}

function backKeyboard(lang) {
  return {
    inline_keyboard: [
      [
        lang === "fa"
          ? { text: "⬅️ بازگشت به منو", callback_data: "fa_back" }
          : { text: "⬅️ Back to Menu",  callback_data: "en_back" },
        lang === "fa"
          ? { text: "🇬🇧 English", callback_data: "en_start" }
          : { text: "🇮🇷 فارسی",  callback_data: "fa_start" },
      ],
    ],
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────
async function handleMessage(message) {
  const chatId  = message.chat.id;
  const rawText = message.text;
  const trimmed = rawText.trim();

  if (trimmed === "/start" || trimmed === "/help") {
    // Show language selection first
    await sendPlain(chatId, LANG_SELECT_MESSAGE, LANG_SELECT_KEYBOARD);
    return;
  }

  // Telegram clients auto-format `**bold**`, ```code```, etc. typed by the user
  // into formatting entities and STRIP the raw markdown syntax from message.text.
  // Reconstruct the original Markdown/HTML from text + entities before echoing it.
  let text = entitiesToMarkdown(rawText, message.entities).trim();
  if (!text) text = trimmed;

  if (text.startsWith("<") || /<\/?\w/.test(text)) {
    await sendRichHtml(chatId, text);
  } else {
    await sendRichMarkdown(chatId, text);
  }
}

// ─── Convert Telegram message entities back into Markdown/HTML source ─────────
function entitiesToMarkdown(text, entities) {
  if (!entities || !entities.length) return text;

  const items = entities.map((e, idx) => ({ e, idx, start: e.offset, end: e.offset + e.length }));

  function isTopLevel(item, pool) {
    return !pool.some(other => {
      if (other.idx === item.idx) return false;
      const strictlyLarger =
        other.start <= item.start && other.end >= item.end &&
        (other.start < item.start || other.end > item.end);
      const sameSpanOuter =
        other.start === item.start && other.end === item.end && other.idx < item.idx;
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
      // Exclude this item itself to avoid infinite recursion on its own range
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
    case "bold":          return `**${content}**`;
    case "italic":        return `*${content}*`;
    case "underline":     return `<u>${content}</u>`;
    case "strikethrough": return `~~${content}~~`;
    case "spoiler":       return `||${content}||`;
    case "code":          return `\`${content}\``;
    case "pre": {
      const lang = e.language || "";
      return "```" + lang + "\n" + content + "\n```";
    }
    case "text_link":
      return `[${content}](${e.url})`;
    case "text_mention":
      return e.user ? `[${content}](tg://user?id=${e.user.id})` : content;
    case "blockquote":
    case "expandable_blockquote":
      return content.split("\n").map(l => `>${l}`).join("\n");
    default:
      // mention, hashtag, cashtag, bot_command, url, email, phone_number, custom_emoji, etc.
      return content;
  }
}

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const msgId  = cb.message.message_id;
  const data   = cb.data;

  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cb.id }),
  });

  // Parse lang prefix: "fa_help_md" → lang="fa", action="help_md"
  const lang   = data.startsWith("fa_") ? "fa" : "en";
  const action = data.slice(3); // remove "fa_" or "en_"

  const kb   = backKeyboard(lang);
  const main = mainKeyboard(lang);

  if (action === "start" || action === "back") {
    await editRichMarkdown(chatId, msgId, WELCOME[lang], main);
  } else if (action === "help_md") {
    await editRichMarkdown(chatId, msgId, HELP_MD[lang], kb);
  } else if (action === "help_html") {
    await editRichMarkdown(chatId, msgId, HELP_HTML[lang], kb);
  } else if (action === "help_media") {
    await editRichMarkdown(chatId, msgId, HELP_MEDIA[lang], kb);
  } else if (action === "demo") {
    await editRichMarkdown(chatId, msgId, DEMO[lang], kb);
  } else if (action === "about") {
    await editRichMarkdown(chatId, msgId, ABOUT[lang], kb);
  }
}

// ─── Language select (plain sendMessage so it's always fresh) ─────────────────
const LANG_SELECT_MESSAGE = "🌐 Please choose your language / زبان خود را انتخاب کنید:";
const LANG_SELECT_KEYBOARD = {
  inline_keyboard: [[
    { text: "🇮🇷 فارسی", callback_data: "fa_start" },
    { text: "🇬🇧 English", callback_data: "en_start" },
  ]],
};

// ─── API helpers ──────────────────────────────────────────────────────────────
async function sendPlain(chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi("sendMessage", body);
}

async function sendRichMarkdown(chatId, markdown, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { markdown } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi("sendRichMessage", body);
}

async function sendRichHtml(chatId, html, replyMarkup) {
  const body = { chat_id: chatId, rich_message: { html } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi("sendRichMessage", body);
}

async function editRichMarkdown(chatId, messageId, markdown, replyMarkup) {
  const body = { chat_id: chatId, message_id: messageId, rich_message: { markdown } };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi("editMessageText", body);
}

async function callApi(method, body) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[${method}] ${res.status}: ${err}`);
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: body.chat_id, text: `⚠️ Error (${res.status}): ${err}` }),
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

const WELCOME = {
  fa: `# 🤖 Rich Markdown Bot

هر متن **Markdown** یا **HTML** بفرستید، به صورت Rich Message رندر میشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

از دکمه‌های زیر برای دیدن راهنما و دمو استفاده کنید 👇`,

  en: `# 🤖 Rich Markdown Bot

Send any **Markdown** or **HTML** text and it will be echoed back as a rendered Rich Message.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

Use the buttons below to explore 👇`,
};

// ─── About ────────────────────────────────────────────────────────────────────
const ABOUT = {
  fa: `# ÐΛɌ₭ᑎΞ𐒡𐒡|𓄂𓆃

[ÐΛɌ₭ᑎΞ𐒡𐒡](https://darkness-web.pages.dev/)

---

🗽 [GitHub](https://github.com/DarknessShade)

🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom)

🗽 [ConfigWireguard](https://t.me/ConfigWireguard)`,

  en: `# ÐΛɌ₭ᑎΞ𐒡𐒡|𓄂𓆃

[ÐΛɌ₭ᑎΞ𐒡𐒡](https://darkness-web.pages.dev/)

---

🗽 [GitHub](https://github.com/DarknessShade)

🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom)

🗽 [ConfigWireguard](https://t.me/ConfigWireguard)`,
};

// ─── Markdown Help ────────────────────────────────────────────────────────────
const HELP_MD = {
  fa: `# 📖 راهنمای Markdown

متن Markdown بفرستید، رندر شده برمیگرده.
کادر خاکستری = چیزی که تایپ میکنید ↓ نتیجه بعدشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
**bold**  *italic*  ~~strike~~  \`code\`  ==marked==  ||spoiler||
\`\`\`

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||

---

## Headings

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Lists

\`\`\`
- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it
\`\`\`

- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it

---

## Links & Quotes

\`\`\`
[Telegram](https://telegram.org)

>To be, or not to be.
\`\`\`

[Telegram](https://telegram.org)

>To be, or not to be.

---

## Block Quote (چند خط)

\`\`\`
>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation
\`\`\`

>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation

---

## Unordered List (علامت‌های مختلف)

\`\`\`
- unordered list item
* unordered list item
+ unordered list item
\`\`\`

- unordered list item
* unordered list item
+ unordered list item

---

## Divider

\`\`\`
---
\`\`\`

---

## Code Blocks

\`\`\`\`
\`\`\`python
print("hello")
\`\`\`
\`\`\`\`

\`\`\`python
print("hello")
\`\`\`

---

## Tables

\`\`\`\`
| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |
\`\`\`\`

| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |

---

## Math

\`\`\`\`
Inline $E = mc^2$ and a block:
$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
\`\`\`\`

Inline $E = mc^2$ and a block:

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$

---

## Details

\`\`\`\`
<details><summary>**کلیک کن**</summary>
محتوای مخفی!
</details>
\`\`\`\`

<details><summary>**کلیک کن**</summary>
محتوای مخفی!
</details>

---

*محدودیت: تا 32,768 کاراکتر در هر پیام* ✨`,

  en: `# 📖 Markdown Guide

Send Markdown text and get it echoed back rendered.
Grey box = what you type ↓ result comes right after.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)
---

## Text Styles

\`\`\`
**bold**  *italic*  ~~strike~~  \`code\`  ==marked==  ||spoiler||
\`\`\`

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||

---

## Headings

\`\`\`
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6
\`\`\`

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## Lists

\`\`\`
- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it
\`\`\`

- milk
- eggs
- [ ] todo
- [x] done

1. wake up
2. ship it

---

## Unordered List (all markers)

\`\`\`
- unordered list item
* unordered list item
+ unordered list item
\`\`\`

- unordered list item
* unordered list item
+ unordered list item

---

## Links & Quotes

\`\`\`
[Telegram](https://telegram.org)

>To be, or not to be.
\`\`\`

[Telegram](https://telegram.org)

>To be, or not to be.

---

## Block Quote (multi-line)

\`\`\`
>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation
\`\`\`

>Block quotation started
>
>Block quotation continued on the next line
>Block quotation continued on the same line

>The last line of the block quotation

---

## Divider

\`\`\`
---
\`\`\`

---

## Code Blocks

\`\`\`\`
\`\`\`python
print("hello")
\`\`\`
\`\`\`\`

\`\`\`python
print("hello")
\`\`\`

---

## Tables

\`\`\`
| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |
\`\`\`

| Lang | Speed |
|:-----|------:|
| Rust | fast  |
| Py   | comfy |

---

## Math

\`\`\`
Inline $E = mc^2$ and a block:
$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
\`\`\`

Inline $E = mc^2$ and a block:

$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$

---

## Details (Collapsible)

\`\`\`
<details><summary>**Click me**</summary>
Hidden content!
</details>
\`\`\`

<details><summary>**Click me**</summary>
Hidden content!
</details>

---

*Limit: up to 32,768 characters per message* ✨`,
};

// ─── HTML Help ────────────────────────────────────────────────────────────────
const HELP_HTML = {
  fa: `# 🌐 راهنمای HTML

اگه پیامت با \`<\` شروع بشه، بات به عنوان HTML رندر میکنه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
<b>bold</b> <i>italic</i> <u>underline</u>
<s>strike</s> <code>code</code> <mark>marked</mark>
<tg-spoiler>spoiler</tg-spoiler>
<sup>superscript</sup> <sub>subscript</sub>
\`\`\`

<b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>code</code> <mark>marked</mark> <tg-spoiler>spoiler</tg-spoiler> <sup>sup</sup> <sub>sub</sub>

---

## Headings

\`\`\`
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>
\`\`\`

<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>

---

## Lists

\`\`\`
<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul>
  <li><input type="checkbox" checked>done</li>
  <li><input type="checkbox">todo</li>
</ul>
\`\`\`

<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">todo</li></ul>

---

## Links & Quotes

\`\`\`
<a href="https://telegram.org">Telegram</a>
<blockquote>متن نقل‌قول<cite>نویسنده</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>
\`\`\`

<a href="https://telegram.org">Telegram</a>
<blockquote>متن نقل‌قول<cite>نویسنده</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>

---

## Superscript & Subscript

\`\`\`
<sub>subscript text</sub>
<sup>superscript text</sup>
\`\`\`

متن نرمال با <sub>subscript text</sub> و <sup>superscript text</sup>

---

## Footnotes

\`\`\`
Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.
\`\`\`

Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.

---

## Code

\`\`\`
<pre><code class="language-python">print("hello")</code></pre>
\`\`\`

<pre><code class="language-python">print("hello")</code></pre>

---

## Table

\`\`\`
<table>
  <tr><th>Lang</th><th>Speed</th></tr>
  <tr><td>Rust</td><td>fast</td></tr>
  <tr><td>Py</td><td>comfy</td></tr>
</table>
\`\`\`

<table><tr><th>Lang</th><th>Speed</th></tr><tr><td>Rust</td><td>fast</td></tr><tr><td>Py</td><td>comfy</td></tr></table>

---

## Math

\`\`\`
<tg-math>x^2 + y^2</tg-math>
<tg-math-block>E = mc^2</tg-math-block>
\`\`\`

<tg-math>x^2 + y^2</tg-math>

<tg-math-block>E = mc^2</tg-math-block>

---

## Details

\`\`\`
<details open><summary>عنوان</summary>محتوا</details>
\`\`\`

<details open><summary>عنوان</summary>محتوا</details>

---

*یه HTML بفرست و ببین چطور رندر میشه* ✨`,

  en: `# 🌐 HTML Guide

If your message starts with \`<\`, the bot renders it as HTML.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

\`\`\`
<b>bold</b> <i>italic</i> <u>underline</u>
<s>strike</s> <code>code</code> <mark>marked</mark>
<tg-spoiler>spoiler</tg-spoiler>
<sup>superscript</sup> <sub>subscript</sub>
\`\`\`

<b>bold</b> <i>italic</i> <u>underline</u> <s>strike</s> <code>code</code> <mark>marked</mark> <tg-spoiler>spoiler</tg-spoiler> <sup>sup</sup> <sub>sub</sub>

---

## Headings

\`\`\`
<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>
\`\`\`

<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>
<h4>Heading 4</h4>
<h5>Heading 3</h5>

---

## Lists

\`\`\`
<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul>
  <li><input type="checkbox" checked>done</li>
  <li><input type="checkbox">todo</li>
</ul>
\`\`\`

<ul><li>milk</li><li>eggs</li></ul>
<ol><li>wake up</li><li>ship it</li></ol>
<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">todo</li></ul>

---

## Links & Quotes

\`\`\`
<a href="https://telegram.org">Telegram</a>
<blockquote>Quote text<cite>Author</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>
\`\`\`

<a href="https://telegram.org">Telegram</a>
<blockquote>Quote text<cite>Author</cite></blockquote>
<aside>Pull quote<cite>The Author</cite></aside>

---

## Superscript & Subscript

\`\`\`
<sub>subscript text</sub>
<sup>superscript text</sup>
\`\`\`

Normal text with <sub>subscript text</sub> and <sup>superscript text</sup>

---

## Footnotes

\`\`\`
Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.
\`\`\`

Text with a reference[^id1] and another one[^id2].

[^id1]: Definition of the first footnote.
[^id2]: Definition of the second footnote.

---

## Code

\`\`\`
<pre><code class="language-python">print("hello")</code></pre>
\`\`\`

<pre><code class="language-python">print("hello")</code></pre>

---

## Table

\`\`\`
<table>
  <tr><th>Lang</th><th>Speed</th></tr>
  <tr><td>Rust</td><td>fast</td></tr>
  <tr><td>Py</td><td>comfy</td></tr>
</table>
\`\`\`

<table><tr><th>Lang</th><th>Speed</th></tr><tr><td>Rust</td><td>fast</td></tr><tr><td>Py</td><td>comfy</td></tr></table>

---

## Math

\`\`\`
<tg-math>x^2 + y^2</tg-math>
<tg-math-block>E = mc^2</tg-math-block>
\`\`\`

<tg-math>x^2 + y^2</tg-math>

<tg-math-block>E = mc^2</tg-math-block>

---

## Details (Collapsible)

\`\`\`
<details open><summary>Title</summary>Content here</details>
\`\`\`

<details open><summary>Title</summary>Content here</details>

---

*Send some HTML and watch it render* ✨`,
};

// ─── Media Help ───────────────────────────────────────────────────────────────
const HELP_MEDIA = {
  fa: `# 🖼 راهنمای مدیا

برای ارسال مدیا در Rich Message از سینتکس تصویر Markdown استفاده کنید.
URL پسوند فایل تعیین می‌کنه چه نوع مدیایی نمایش داده بشه.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## نقشه

\`\`\`
<tg-map lat="41.9" long="12.5" zoom="14"/>
\`\`\`

<tg-map lat="41.9" long="12.5" zoom="14"/>

---

## عکس

\`\`\`
![](https://telegram.org/example/photo.jpg)
\`\`\`

![](https://telegram.org/example/photo.jpg)

---

## ویدیو

\`\`\`
![](https://telegram.org/example/video.mp4)
\`\`\`

![](https://telegram.org/example/video.mp4)

---

## فایل صوتی

\`\`\`
![](https://telegram.org/example/audio.mp3)
\`\`\`

![](https://telegram.org/example/audio.mp3)

---

## ویس نوت (ogg)

\`\`\`
![](https://telegram.org/example/audio.ogg)
\`\`\`

![](https://telegram.org/example/audio.ogg)

---

## انیمیشن (gif)

\`\`\`
![](https://telegram.org/example/animation.gif)
\`\`\`

![](https://telegram.org/example/animation.gif)

---

## مدیا با کپشن

\`\`\`
![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")
\`\`\`

![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")

---

## اسلایدشو (ترکیبی)

\`\`\`
<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>
\`\`\`

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

*پسوند URL = نوع مدیا: jpg/png=عکس · mp4=ویدیو · mp3=صوت · ogg=ویس · gif=انیمیشن* ✨`,

  en: `# 🖼 Media Guide

Use Markdown image syntax to embed media in Rich Messages.
The URL file extension determines the media type rendered.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Map

\`\`\`
<tg-map lat="41.9" long="12.5" zoom="14"/>
\`\`\`

<tg-map lat="41.9" long="12.5" zoom="14"/>

---

## Photo

\`\`\`
![](https://telegram.org/example/photo.jpg)
\`\`\`

![](https://telegram.org/example/photo.jpg)

---

## Video

\`\`\`
![](https://telegram.org/example/video.mp4)
\`\`\`

![](https://telegram.org/example/video.mp4)

---

## Audio

\`\`\`
![](https://telegram.org/example/audio.mp3)
\`\`\`

![](https://telegram.org/example/audio.mp3)

---

## Voice Note (ogg)

\`\`\`
![](https://telegram.org/example/audio.ogg)
\`\`\`

![](https://telegram.org/example/audio.ogg)

---

## Animation (gif)

\`\`\`
![](https://telegram.org/example/animation.gif)
\`\`\`

![](https://telegram.org/example/animation.gif)

---

## Media with Captions

\`\`\`
![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")
\`\`\`

![](https://telegram.org/example/photo.jpg "Photo caption")
![](https://telegram.org/example/video.mp4 "Video caption")
![](https://telegram.org/example/audio.mp3 "Audio caption")
![](https://telegram.org/example/audio.ogg "Voice note caption")
![](https://telegram.org/example/animation.gif "Animation caption")

---

## Slideshow (Combined)

\`\`\`
<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>
\`\`\`

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

*URL extension = media type: jpg/png=photo · mp4=video · mp3=audio · ogg=voice · gif=animation* ✨`,
};

// ─── Demo ─────────────────────────────────────────────────────────────────────
const DEMO = {
  fa: `# 🎨 دمو کامل — نمونه خروجی

این پیام نمونه خروجی واقعی همه قابلیت‌هاست.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||
<u>underline</u> <sup>super</sup> <sub>sub</sub>

---

## Nested Formatting

**Bold _italic <u>underlined italic bold</u> italic_ bold**

>نقل‌قول با **bold**، ~~strikethrough~~، و ||spoiler||، و [لینک](https://t.me/).

---

## Lists

- آیتم با \`inline code\` و **bold**
- آیتم با ~~strikethrough~~ و ==highlight==
- [ ] کار انجام نشده
- [x] کار انجام شده

1. اول
2. دوم
3. سوم

---

## Code Block

\`\`\`python
def greet(name: str) -> str:
    return f"سلام، {name}!"

print(greet("تلگرام"))
\`\`\`

---

## Table

| متریک  | مقدار     | وضعیت    |
|:--------|:---------:|---------:|
| سرعت   | **42** ms | ==fast== |
| حافظه  | 128 MB    | ==ok==   |
| آپتایم | 99.9%     | ~~down~~ |

---

## Math

Inline: $E = mc^2$ و $x^2 + y^2 = r^2$

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

---

## Details

<details open><summary>**جزئیات بیشتر — کلیک کن**</summary>

### داخل Details

- **Markdown** داخل details کار میکنه
- جدول، کد، لیست همه سازگارن

| Key | Value |
|:----|------:|
| A   | 1     |
| B   | 2     |

\`\`\`js
console.log("inside details!");
\`\`\`

</details>

---

## Media — اسلایدشو ترکیبی

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

🗽 [GitHub](https://github.com/DarknessShade) •|• 🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom) •|• 🗽 [ConfigWireguard](https://t.me/ConfigWireguard)`,

  en: `# 🎨 Full Demo — Live Output Sample

This message demonstrates every supported feature rendered live.

[Rich Markdown Telegram](https://core.telegram.org/bots/api#rich-message-formatting-options)

---

## Text Styles

**bold** *italic* ~~strike~~ \`code\` ==marked== ||spoiler||
<u>underline</u> <sup>super</sup> <sub>sub</sub>

---

## Nested Formatting

**Bold _italic <u>underlined italic bold</u> italic_ bold**

>Quote with **bold**, ~~strikethrough~~, and ||spoiler||, plus [a link](https://t.me/).

---

## Lists

- Item with \`inline code\` and **bold**
- Item with ~~strikethrough~~ and ==highlight==
- [ ] Task todo
- [x] Task done

1. First
2. Second
3. Third

---

## Code Block

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Telegram"))
\`\`\`

---

## Table

| Metric  | Value      | Status    |
|:--------|:----------:|---------:|
| Speed   | **42** ms  | ==fast==  |
| Memory  | 128 MB     | ==ok==    |
| Uptime  | 99.9%      | ~~down~~  |

---

## Math

Inline: $E = mc^2$ and $x^2 + y^2 = r^2$

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

---

## Details (Collapsible)

<details open><summary>**More details — click me**</summary>

### Inside Details

- **Markdown** works inside details
- Tables, code, lists all supported

| Key | Value |
|:----|------:|
| A   | 1     |
| B   | 2     |

\`\`\`js
console.log("inside details!");
\`\`\`

</details>

---

## Media — Combined Slideshow

<tg-slideshow>
<img src="https://telegram.org/example/photo.jpg"/>
<img src="https://telegram.org/example/animation.gif"/>
<video src="https://telegram.org/example/video.mp4"/><figcaption>Slideshow caption<cite>The Author</cite></figcaption>
</tg-slideshow>

---

🗽 [GitHub](https://github.com/DarknessShade) •|• 🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom) •|• 🗽 [ConfigWireguard](https://t.me/ConfigWireguard)`,
};
