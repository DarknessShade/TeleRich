<div align="center">
   
# 🤖 Telegram [Rich Markdown](https://core.telegram.org/bots/api#rich-message-formatting-options) & HTML Bot

<a href="#english-version-us">🇺🇸 English</a> | <a href="#نسخه-فارسی-ir">🇮🇷 فارسی</a>
  
Live Demo Bot: [@MarkdownRenderBot](https://t.me/MarkdownRenderBot)

[![GitHub Repo](https://img.shields.io/badge/Repo-TeleRich-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/DarknessShade/TeleRich)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram%20Bot%20API-10.1-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-brightgreen?style=for-the-badge)](https://github.com/DarknessShade/TeleRich/blob/main/LICENSE)

![Status](https://img.shields.io/badge/status-active-success?style=flat-square)
![Markdown](https://img.shields.io/badge/Markdown-supported-blue?style=flat-square&logo=markdown)
![HTML](https://img.shields.io/badge/HTML-supported-orange?style=flat-square&logo=html5)
![Bilingual](https://img.shields.io/badge/Languages-EN%20%7C%20FA-9cf?style=flat-square)
![No Database](https://img.shields.io/badge/Database-none%20needed-lightgrey?style=flat-square)

</div>

### [TeleRich Python arshiaCP](https://github.com/arshiacomplus/TeleRich)

---
<a id="english-version-us"></a>
## 🇬🇧 English

### ✨ Overview
#### Use this code to send rendered messages inside your channel [Code and tutorial link](https://github.com/DarknessShade/TeleRich/tree/main/Channel%20Forwarder%20Bot)

A lightweight, serverless **Telegram bot** running entirely on **Cloudflare Workers**. Send it any **Markdown** or **HTML** text and it instantly echoes it back as a beautifully rendered **Rich Message**, using Telegram's Bot API 10.1 `sendRichMessage` / `rich_message` formatting layer.

No servers, no databases, no dependencies — just one `worker.js` file.

### 🚀 Features

- **🔁 Live Markdown → Rich Message rendering** — type Markdown, get a fully rendered rich message back.
- **🌐 Live HTML → Rich Message rendering** — messages starting with `<` (or containing HTML tags) are rendered as HTML.
- **🧠 Entity reconstruction engine** — Telegram strips raw `**bold**`, `` ```code``` ``, etc. from `message.text` and converts them into formatting *entities*. This bot **rebuilds the original Markdown/HTML source** from those entities (including nested formatting like bold-italic-underline combinations, blockquotes, spoilers, links, mentions, and code blocks) before re-rendering.
- **🌍 Full bilingual interface (English / Persian)** — every menu, button, and help page is available in both languages with one-tap switching.
- **📖 Interactive Markdown Guide** — live, side-by-side "type this → get this" examples covering:
  - Text styles: bold, italic, strikethrough, inline code, highlight (`==mark==`), spoilers
  - Headings (H1–H6)
  - Ordered & unordered lists, task lists (`- [ ]` / `- [x]`)
  - Links, single-line and multi-line blockquotes
  - Dividers, fenced code blocks with syntax highlighting
  - Tables with column alignment
  - Inline and block LaTeX math (`$...$` and `$$...$$`)
  - Collapsible `<details>` / `<summary>` sections (with nested Markdown, tables & code inside)
- **🌐 Interactive HTML Guide** — equivalent reference for raw HTML formatting tags supported by Telegram.
- **🖼 Media Guide** — demonstrates rich media embedding via Markdown image syntax and `<tg-map>` / `<tg-slideshow>` tags:
  - Photos, videos, audio, voice notes (`.ogg`), animations/GIFs
  - Captions for any media type
  - Combined slideshows with multiple items + captions
  - Live location maps (`<tg-map lat="..." long="..." zoom="..."/>`)
- **🎨 Full Demo mode** — a single message showcasing *every* feature at once (nested formatting, tables, math, code, collapsible sections, slideshows).
- **ℹ️ About page** — author/credits page with social links.
- **🛡 Bulletproof error handling** — the worker **always returns HTTP 200** to Telegram (even on internal errors), preventing Telegram from auto-disabling the webhook. Errors are logged and, where possible, reported directly to the chat.
- **⚡ Inline keyboard navigation** — persistent back/menu/language-switch buttons on every screen.

### 🧩 How It Works

1. Telegram sends an `update` (message or callback query) to your Worker via webhook (POST request).
2. If it's a **callback query** (button press) → the bot edits the existing message to show the requested menu/guide/demo.
3. If it's a **text message**:
   - `/start` or `/help` → shows the language selection screen.
   - Otherwise → the bot reconstructs the original Markdown/HTML from the message's formatting entities, detects whether it's HTML or Markdown, and sends it back as a `rich_message`.
4. The Worker responds `200 OK` to Telegram in all cases (per Telegram's webhook requirements).

### 📋 Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account (free tier is enough)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- That's it — **no Node.js, no Wrangler CLI, no installs needed**. Just copy/paste the code into the Cloudflare dashboard.

### 🛠 Setup & Deployment

#### 1. Create your bot with BotFather
1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the **bot token** you receive (looks like `123456789:ABCdefGhIJKlmNoPQRstuVWXyz`)

#### 2. Get the code ready
1. Download/copy `worker.js`
2. Open the file and replace the placeholder on line 8:
   ```js
   const BOT_TOKEN = "Enter your Telegram bot token";
   ```
   with your real token:
   ```js
   const BOT_TOKEN = "123456789:ABCdefGhIJKlmNoPQRstuVWXyz";
   ```

   > 💡 **Recommended (more secure):** instead of hardcoding the token, use a Cloudflare **Secret** (see step 4) and change this line to:
   > ```js
   > const BOT_TOKEN = env.BOT_TOKEN;
   > ```
   > (and update the `fetch(request, env)` signature accordingly)

#### 3. Deploy to Cloudflare Workers (simple upload, no CLI)

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Create Worker**
2. Give it a name (e.g. `telegram-md-bot`) and click **Deploy**
3. Click **Edit code**, delete the default code, paste in your edited `worker.js`
4. Click **Save and Deploy**
5. Note your Worker's URL, e.g. `https://telegram-md-bot.yourname.workers.dev`

#### 4. (Recommended) Store the token as a secret instead of hardcoding it
1. In your Worker's page on the Cloudflare dashboard, go to **Settings → Variables and Secrets**
2. Click **Add** → set type to **Secret**, name it `BOT_TOKEN`, paste your token, and **Save and Deploy**

Then update the worker to read `env.BOT_TOKEN` instead of a hardcoded string, and pass `env` into the `fetch` handler:
```js
export default {
  async fetch(request, env) {
    const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
    // ...
  }
};
```

#### 5. Set the Telegram webhook
Point Telegram at your Worker URL by visiting this URL in a browser (or via `curl`):
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<your-worker>.workers.dev
```
A successful response looks like:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

#### 6. Test it!
1. Open your bot in Telegram and send `/start`
2. Choose your language (🇮🇷 فارسی / 🇬🇧 English)
3. Try the **Markdown Guide**, **HTML Guide**, **Media Guide**, and **Full Demo** buttons
4. Send your own Markdown/HTML text, e.g.:
   ```
   **Hello** _world_! Here's a [link](https://telegram.org) and a table:

   | A | B |
   |---|---|
   | 1 | 2 |
   ```

### 🔍 Verifying the webhook
Check webhook status anytime:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

### ⚠️ Notes & Limits

- Telegram rich messages are limited to **32,768 characters** per message.
- `sendRichMessage` / `rich_message` / `<tg-map>` / `<tg-slideshow>` are part of **Bot API 10.1** — make sure your bot client/library and Telegram app are up to date to see full rendering.
- The worker logs errors via `console.error`, viewable in the Cloudflare dashboard under **Workers & Pages → your worker → Logs** (enable "Real-time Logs" or use `wrangler tail`).

### 📄 License & Credits

Released under the **MIT License** — free to use, modify, and distribute, with attribution appreciated.

Created by **ÐΛɌ₭ᑎΞ𐒡𐒡** — [GitHub](https://github.com/DarknessShade) • [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom) • [ConfigWireguard](https://t.me/ConfigWireguard)

⭐ Star the project: **[github.com/DarknessShade/TeleRich](https://github.com/DarknessShade/TeleRich)**

---
---
<a id="نسخه-فارسی-ir"></a>
## 🇮🇷 فارسی

### ✨ معرفی
#### نمونه ربات اجرا شده: [@MarkdownRenderBot](https://t.me/MarkdownRenderBot)

#### برای ارسال پیام های رندر شده داخل کانال خودتون از این کد استفاده کنید [لینک کد و آموزش](https://github.com/DarknessShade/TeleRich/tree/main/Channel%20Forwarder%20Bot)

یک **بات تلگرام** سبک و کاملاً **سرورلس** که روی **Cloudflare Workers** اجرا می‌شود. هر متن **Markdown** یا **HTML** که برایش بفرستید را فوراً به صورت یک **Rich Message** زیبا و رندر‌شده برمی‌گرداند؛ این کار با استفاده از قابلیت `sendRichMessage` / `rich_message` در **Bot API نسخه 10.1** تلگرام انجام می‌شود.

بدون نیاز به سرور، دیتابیس یا هیچ وابستگی‌ای — فقط یک فایل `worker.js`.

### 🚀 ویژگی‌ها

- **🔁 رندر زنده‌ی Markdown به Rich Message** — هر متن مارک‌داون بفرستید، نسخه‌ی رندر شده‌اش را دریافت می‌کنید.
- **🌐 رندر زنده‌ی HTML به Rich Message** — پیام‌هایی که با `<` شروع شوند (یا تگ HTML داشته باشند) به‌صورت HTML رندر می‌شوند.
- **🧠 موتور بازسازی Entity ها** — تلگرام، نشانه‌های خام مثل `**bold**` یا `` ```code``` `` را از `message.text` حذف کرده و آن‌ها را به *entity*های فرمت‌بندی تبدیل می‌کند. این بات کد اصلی Markdown/HTML را **از روی همین entity ها بازسازی می‌کند** (شامل فرمت‌های تو در تو مثل bold-italic-underline ترکیبی، نقل‌قول‌ها، اسپویلر، لینک‌ها، منشن‌ها و بلوک‌های کد) و سپس آن را دوباره رندر می‌کند.
- **🌍 رابط کاربری کاملاً دوزبانه (فارسی / انگلیسی)** — تمام منوها، دکمه‌ها و صفحات راهنما در هر دو زبان موجودند و با یک کلیک قابل تغییرند.
- **📖 راهنمای تعاملی Markdown** — نمونه‌های زنده‌ی "این رو بنویس ← این رو بگیر" شامل:
  - استایل‌های متنی: بولد، ایتالیک، خط‌خورده، کد درون‌خطی، هایلایت (`==mark==`)، اسپویلر
  - تیترها (H1 تا H6)
  - لیست‌های مرتب و نامرتب، لیست‌های کاری (`- [ ]` / `- [x]`)
  - لینک‌ها، نقل‌قول‌های تک‌خطی و چندخطی
  - خط جداکننده، بلوک‌های کد با هایلایت سینتکس
  - جدول‌ها با چینش ستون‌ها
  - فرمول‌های ریاضی LaTeX به‌صورت اینلاین و بلوکی (`$...$` و `$$...$$`)
  - بخش‌های قابل‌جمع‌شدن `<details>` / `<summary>` (با مارک‌داون، جدول و کد در داخل)
- **🌐 راهنمای تعاملی HTML** — مرجع مشابه برای تگ‌های HTML خام که تلگرام پشتیبانی می‌کند.
- **🖼 راهنمای مدیا** — نمایش embedding مدیای غنی با سینتکس تصویر مارک‌داون و تگ‌های `<tg-map>` / `<tg-slideshow>`:
  - عکس، ویدیو، صدا، ویس‌نوت (`.ogg`)، انیمیشن/گیف
  - کپشن برای هر نوع مدیا
  - اسلایدشوی ترکیبی با چند آیتم + کپشن
  - نقشه‌ی موقعیت زنده (`<tg-map lat="..." long="..." zoom="..."/>`)
- **🎨 حالت دمو کامل** — یک پیام که **همه‌ی** قابلیت‌ها را با هم نمایش می‌دهد (فرمت تو در تو، جدول، فرمول، کد، بخش‌های قابل‌جمع، اسلایدشو).
- **ℹ️ صفحه‌ی درباره** — صفحه‌ی معرفی سازنده و لینک‌های شبکه‌های اجتماعی.
- **🛡 مدیریت خطای ضدخرابی** — این Worker در هر شرایطی (حتی هنگام بروز خطای داخلی) همیشه **HTTP 200** به تلگرام برمی‌گرداند تا تلگرام وبهوک را به‌صورت خودکار غیرفعال نکند. خطاها لاگ می‌شوند و در صورت امکان مستقیماً در چت اطلاع‌رسانی می‌شوند.
- **⚡ ناوبری با کیبورد اینلاین** — دکمه‌های ثابت بازگشت/منو/تغییر زبان در هر صفحه.

### 🧩 نحوه‌ی کارکرد

1. تلگرام یک `update` (پیام یا کلیک روی دکمه) را از طریق وب‌هوک (درخواست POST) به Worker شما ارسال می‌کند.
2. اگر یک **callback query** باشد (کلیک دکمه) → بات پیام موجود را ویرایش کرده و منو/راهنما/دموی درخواستی را نمایش می‌دهد.
3. اگر یک **پیام متنی** باشد:
   - `/start` یا `/help` → صفحه‌ی انتخاب زبان نمایش داده می‌شود.
   - در غیر این صورت → بات کد اصلی Markdown/HTML را از روی entity های فرمت‌بندی پیام بازسازی کرده، تشخیص می‌دهد HTML است یا Markdown، و آن را به‌عنوان `rich_message` پاسخ می‌دهد.
4. Worker در همه‌ی حالات `200 OK` به تلگرام پاسخ می‌دهد (طبق الزامات وب‌هوک تلگرام).

### 📋 پیش‌نیازها

- یک حساب [Cloudflare](https://dash.cloudflare.com/) (پلن رایگان کافیست)
- یک توکن بات تلگرام از [@BotFather](https://t.me/BotFather)
- همین کافیست — **بدون نیاز به Node.js، بدون نیاز به Wrangler CLI، بدون هیچ نصبی**. فقط کافیست کد را در داشبورد Cloudflare کپی/پیست کنید.

### 🛠 راه‌اندازی و دیپلوی

#### ۱. ساخت بات با BotFather
۱. در تلگرام به [@BotFather](https://t.me/BotFather) پیام دهید
۲. دستور `/newbot` را ارسال کرده و مراحل را دنبال کنید
۳. **توکن بات** دریافتی را کپی کنید (شبیه `123456789:ABCdefGhIJKlmNoPQRstuVWXyz`)

#### ۲. آماده‌سازی کد
۱. فایل `worker.js` را دانلود/کپی کنید
۲. فایل را باز کرده و خط ۸ را پیدا کنید:
   ```js
   const BOT_TOKEN = "Enter your Telegram bot token";
   ```
   و آن را با توکن واقعی خود جایگزین کنید:
   ```js
   const BOT_TOKEN = "123456789:ABCdefGhIJKlmNoPQRstuVWXyz";
   ```

   > 💡 **پیشنهاد (امن‌تر):** به‌جای قرار دادن توکن مستقیم در کد، از **Secret** کلودفلر استفاده کنید (مرحله ۴) و این خط را تغییر دهید به:
   > ```js
   > const BOT_TOKEN = env.BOT_TOKEN;
   > ```
   > (و امضای `fetch(request, env)` را متناسب با آن به‌روزرسانی کنید)

#### ۳. دیپلوی روی Cloudflare Workers (آپلود ساده، بدون CLI)

۱. به [داشبورد Cloudflare](https://dash.cloudflare.com/) بروید → **Workers & Pages** → **Create** → **Create Worker**
۲. یک نام انتخاب کنید (مثلاً `telegram-md-bot`) و روی **Deploy** کلیک کنید
۳. روی **Edit code** کلیک کنید، کد پیش‌فرض را حذف کرده و `worker.js` ویرایش‌شده‌ی خود را paste کنید
۴. روی **Save and Deploy** کلیک کنید
۵. آدرس Worker خود را یادداشت کنید، مثلاً: `https://telegram-md-bot.yourname.workers.dev`

#### ۴. (پیشنهادی) ذخیره‌ی توکن به‌صورت Secret به‌جای کد مستقیم
۱. در صفحه‌ی Worker خود در داشبورد Cloudflare، به مسیر **Settings → Variables and Secrets** بروید
۲. روی **Add** کلیک کنید → نوع را روی **Secret** بگذارید، نام را `BOT_TOKEN` بگذارید، توکن خود را وارد کنید و **Save and Deploy** بزنید

سپس Worker را به‌گونه‌ای تغییر دهید که `env.BOT_TOKEN` را به‌جای رشته‌ی هاردکد بخواند و `env` را به handler منتقل کنید:
```js
export default {
  async fetch(request, env) {
    const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
    // ...
  }
};
```

#### ۵. تنظیم وب‌هوک تلگرام
با باز کردن آدرس زیر در مرورگر (یا با `curl`)، تلگرام را به آدرس Worker خود متصل کنید:
```
https://api.telegram.org/bot<TOKEN_خودتان>/setWebhook?url=https://<your-worker>.workers.dev
```
پاسخ موفق این‌گونه است:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

#### ۶. تست کنید!
۱. بات خود را در تلگرام باز کرده و `/start` بفرستید
۲. زبان را انتخاب کنید (🇮🇷 فارسی / 🇬🇧 English)
۳. دکمه‌های **راهنمای Markdown**، **راهنمای HTML**، **راهنمای مدیا** و **دمو کامل** را امتحان کنید
۴. متن Markdown/HTML خودتان را بفرستید، مثلاً:
   ```
   **سلام** _دنیا_! این یک [لینک](https://telegram.org) و یک جدول است:

   | A | B |
   |---|---|
   | 1 | 2 |
   ```

### 🔍 بررسی وضعیت وب‌هوک
هر زمان می‌توانید وضعیت وب‌هوک را بررسی کنید:
```
https://api.telegram.org/bot<TOKEN_خودتان>/getWebhookInfo
```

### ⚠️ نکات و محدودیت‌ها

- پیام‌های Rich تلگرام محدود به **۳۲٬۷۶۸ کاراکتر** در هر پیام هستند.
- قابلیت‌های `sendRichMessage` / `rich_message` / `<tg-map>` / `<tg-slideshow>` بخشی از **Bot API نسخه 10.1** هستند — اطمینان حاصل کنید که اپلیکیشن تلگرام و کتابخانه‌ی شما به‌روز باشد تا رندر کامل را ببینید.
- این Worker خطاها را با `console.error` لاگ می‌کند که از داشبورد Cloudflare، در مسیر **Workers & Pages → your worker → Logs** قابل مشاهده است (با فعال‌سازی "Real-time Logs" یا دستور `wrangler tail`).

### 📄 لایسنس و اعتبارات

این پروژه تحت **لایسنس MIT** منتشر شده — استفاده، تغییر و توزیع آن آزاد است، ولی ذکر منبع باعث خوشحالی‌مون می‌شه. 🙏

**ÐΛɌ₭ᑎΞ𐒡𐒡** — [GitHub](https://github.com/DarknessShade) • [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom) • [ConfigWireguard](https://t.me/ConfigWireguard)

اینم TeleRich نسخه پایتون [TeleRich Python arshiaCP](https://github.com/arshiacomplus/TeleRich)

⭐ اگه پروژه رو دوست داشتید، ستاره بدید: **[github.com/DarknessShade/TeleRich](https://github.com/DarknessShade/TeleRich)**
