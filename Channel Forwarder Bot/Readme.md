
<div align="center">
  <a href="#english-version-us">🇺🇸 English</a> | <a href="#نسخه-فارسی-ir">🇮🇷 فارسی</a>
</div>

---

# <a id="english-version-us"></a> 📨 TeleRich — Send to Channel

A Telegram bot to **create and send formatted posts (Rich Markdown / HTML)** to one or multiple Telegram channels, featuring a **complete admin panel** — no server or hosting required! This bot runs entirely on **Cloudflare Workers** and is 100% free.

---

## ✨ Features

### 📝 Rich Messages
- Full support for advanced Telegram **Markdown** and **HTML**.
- Bold, italic, strikethrough, spoiler, underline, superscript/subscript, inline code, and code blocks with syntax highlighting.
- Tables, bulleted/numbered lists, checklists, and blockquotes.
- Collapsible/expandable sections (`<details>`).
- Math formulas (LaTeX).
- Rich Media support (Photos, Videos, Audio, Voice, GIFs).
- Mixed media slideshows (albums) with captions.
- Display Maps inside messages.

### 🌐 Bilingual Menu
- Full support for **English and Persian** with real-time language switching.
- Built-in comprehensive guides for Markdown, HTML, and Media.
- A "Full Demo" section showcasing real-world examples of all features.

### ⚙️ Admin Panel
- **Admin Management**: Add, remove, and list admins (the main owner cannot be removed).
- **Channel Management**: Add channels via numeric ID or username, remove, and list registered channels.
- **Create New Post**:
  - Send post text (Markdown/HTML) and get a live preview.
  - Edit text or inline buttons before final broadcasting.
  - Add Inline Buttons with URLs (multiple buttons per row supported).
  - Select multiple channels simultaneously for broadcasting a single post.
  - Delivery status reports per channel (Success/Failed).

### 🗄 Storage
- All data (admins list, channels, temporary post creation state) is securely stored in **Cloudflare KV** — no separate database needed.

### 🛡 Error Handling
- In case of errors, the exact error message is sent directly to the Owner's private chat for quick debugging.

---

## 🧰 Prerequisites

Before you start, you will need:

1. A **Cloudflare** account (Free) — [dash.cloudflare.com](https://dash.cloudflare.com)
2. A **Telegram Bot** created via [@BotFather](https://t.me/BotFather) and its **Token**.
3. Your personal **Numeric Telegram ID** (Owner ID) — obtainable via bots like [@userinfobot](https://t.me/userinfobot).

---

## 🚀 Complete Setup (No Terminal Required)

All the steps below are done entirely via your **Browser** and **Cloudflare Dashboard**; no software installation or commands are needed.

### Step 1 — Create a Bot on Telegram
1. Message [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Choose a name and username (must end in `bot`) for your bot.
3. BotFather will provide a **Token**, e.g.:
   ```
   123456789:AAExampleTokenXXXXXXXXXXXXXXXXXXXXXXX
   ```
   Keep this token safe — you will need it later.

### Step 2 — Get Your Numeric ID (Owner ID)
1. Message [@userinfobot](https://t.me/userinfobot).
2. Copy the number shown as `Id` — this is your numeric ID and will be set as the Owner of the bot.

### Step 3 — Create a Cloudflare Worker
1. Log into [dash.cloudflare.com](https://dash.cloudflare.com).
2. Go to **Workers & Pages** on the left menu.
3. Click **Create** or **Create Application**, then click **Create Worker**.
4. Name your worker (e.g., `telerich-bot`) and click **Deploy** (ignore the default code, we will change it).
5. After deployment, click **Edit code** (or **Quick edit**) to open the online editor.
6. **Delete** all the default code in the editor.
7. **Copy** the entire content of the `worker.js` file from this project and **Paste** it into the editor.
8. At the top of the code, replace these two values with your own:
   ```js
   const BOT_TOKEN = "Enter your Telegram bot token"; // Token from BotFather
   const OWNER_ID = 102026299; // Your numeric Telegram ID
   ```
9. Click **Save and Deploy**.

### Step 4 — Create a KV Namespace
The bot needs a KV Namespace named `BOT_DB` to store admins, channels, and temporary states.

1. In the Cloudflare Dashboard, go to **Storage & Databases** (or **Workers & Pages → KV**).
2. Click **Create namespace**.
3. Give it a name, e.g., `telerich-db`, and click **Add** / **Create**.

### Step 5 — Bind KV to the Worker
1. Go back to your Worker's page (`telerich-bot`).
2. Navigate to the **Settings** tab and find **Variables and Bindings** (or **Bindings**).
3. Click **Add binding** and select **KV Namespace**.
4. For **Variable name**, type exactly (in uppercase):
   ```
   BOT_DB
   ```
5. For **KV namespace**, select the one you created in the previous step (`telerich-db`).
6. Click **Save** / **Deploy** to apply changes.

> ⚠️ The binding name must be **exactly** `BOT_DB` because the code relies on `env.BOT_DB`.

### Step 6 — Set up Telegram Webhook
Your Worker now has a public URL, something like:
```
https://telerich-bot.your-subdomain.workers.dev
```

To tell Telegram to send messages to this URL, open the following link in your browser (replace `<TOKEN>` and `<WORKER_URL>` with your actual data):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>
```

Example:
```
https://api.telegram.org/bot123456789:AAExampleToken/setWebhook?url=https://telerich-bot.your-subdomain.workers.dev
```

If successful, you will see a response like this:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### Step 7 — Add Bot to Your Channel
1. **Add** the created bot to your target Telegram channel.
2. Make the bot a **Channel Admin** (ensure it has at least the **Post Messages** permission).

### Step 8 — Final Test
1. Go to your bot's private chat and send `/start`.
2. Select your preferred language.
3. If your Telegram ID matches the `OWNER_ID`, you will see the **Admin Panel ⚙️** button.
4. Go to **Manage Channels** and add the channel where the bot is an admin using its numeric ID (e.g., `-1001234567890`) or username (e.g., `@mychannel`).
5. Go to **Create Post**, write a message, check the preview, add inline buttons if needed, select the channel, and broadcast!

---

## 📖 Usage Guide

### Creating and Sending Posts
1. Go to **Admin Panel → Create Post**.
2. Send your post text (Markdown or HTML).
3. A preview of the post will be generated; you can edit the text or buttons.
4. If desired, add inline buttons using this format:
   ```
   Button Text - https://link.com
   Btn 1 - http://a.ai | Btn 2 - http://b.ai
   ```
   Each line equals one row, and `|` is used to separate multiple buttons on the same row.
5. Select one or more channels to send the post to, and click **Send to Selected**.
6. The delivery result (Success ✅ or Failed ❌) will be displayed for each channel.

### Admin Management
Via **Admin Panel → Manage Admins**:
- ➕ Add Admin: Send the user's numeric ID.
- ➖ Remove Admin: Send the numeric ID (the Owner cannot be removed).
- 📋 List Admins.

### Channel Management
Via **Admin Panel → Manage Channels**:
- ➕ Add Channel: Send ID (e.g., `-1001234567890`) or username (e.g., `@mychannel`).
- ➖ Remove Channel.
- 📋 List Channels.

---

## ⚠️ Important & Security Notes

- **Keep your Bot Token secret** and do not publish it anywhere.
- The KV binding name must be exactly `BOT_DB`.
- The bot must be an **admin** in the target channel to be able to post.
- Private channel numeric IDs usually start with `-100`.

---

## 🔗 References

- [Telegram Rich Message Formatting Options](https://core.telegram.org/bots/api#rich-message-formatting-options)
- [TeleRich Official Repository](https://github.com/DarknessShade/TeleRich)

---

## 👤 Author

- 🗽 [GitHub](https://github.com/DarknessShade)
- 🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom)
- 🗽 [ConfigWireguard](https://t.me/ConfigWireguard)

<br><br>

---
---

<br>

# <a id="نسخه-فارسی-ir"></a> 📨 TeleRich — Send to Channel

ربات تلگرامی برای **ساخت و ارسال پست‌های فرمت‌دار (Rich Markdown / HTML)** به یک یا چند کانال تلگرام، با یک **پنل ادمین کامل** — بدون نیاز به سرور یا هاست! این بات روی **Cloudflare Workers** اجرا می‌شود و کاملاً رایگان است.

---

## ✨ ویژگی‌ها

### 📝 پیام‌های غنی (Rich Messages)
- پشتیبانی کامل از **Markdown** و **HTML** پیشرفته تلگرام
- بولد، ایتالیک، خط‌خورده، اسپویلر، زیرخط‌دار، بالانویس/زیرنویس، کد و بلوک کد با هایلایت زبان
- جدول، لیست‌های ساده و تیک‌دار (Checklist)، نقل‌قول
- بخش‌های تاشو/باز شونده (`<details>`)
- فرمول‌های ریاضی (LaTeX)
- نمایش عکس، ویدیو، صدا، ویس و گیف به‌صورت Rich Media
- اسلایدشو ترکیبی از چند مدیا با کپشن
- نمایش نقشه (Map) داخل پیام

### 🌐 منوی دوزبانه
- پشتیبانی کامل از **فارسی و انگلیسی** با امکان تغییر آنی زبان
- راهنمای کامل Markdown، HTML و مدیا داخل خود بات
- یک «دمو کامل» که نمونه واقعی تمام قابلیت‌ها را نشان می‌دهد

### ⚙️ پنل ادمین
- **مدیریت ادمین‌ها**: افزودن، حذف و لیست ادمین‌ها (مالک اصلی ربات هرگز قابل حذف نیست)
- **مدیریت کانال‌ها**: افزودن کانال با آیدی عددی یا یوزرنیم، حذف، لیست کانال‌های ثبت‌شده
- **ساخت پست جدید**:
  - ارسال متن پست (Markdown یا HTML) و دریافت پیش‌نمایش زنده
  - امکان ویرایش متن یا دکمه‌ها قبل از ارسال نهایی
  - افزودن دکمه‌های شیشه‌ای (Inline Buttons) با لینک، چند دکمه در هر ردیف
  - انتخاب همزمان چند کانال برای ارسال یک پست
  - گزارش نتیجه ارسال به‌تفکیک هر کانال (موفق/ناموفق)

### 🗄 ذخیره‌سازی
- تمام داده‌ها (لیست ادمین‌ها، کانال‌ها، وضعیت موقت ساخت پست) در **Cloudflare KV** ذخیره می‌شوند — بدون نیاز به دیتابیس جداگانه.

### 🛡 مدیریت خطا
- در صورت بروز خطا، پیام خطا مستقیماً برای ادمین مالک ارسال می‌شود تا مشکل سریع شناسایی شود.

---

## 🧰 پیش‌نیازها

قبل از شروع به این موارد نیاز دارید:

1. یک حساب کاربری **Cloudflare** (رایگان) — [dash.cloudflare.com](https://dash.cloudflare.com)
2. یک **ربات تلگرام** ساخته‌شده توسط [@BotFather](https://t.me/BotFather) و **توکن** آن
3. **آیدی عددی تلگرام** خودتان (Owner ID) — از طریق بات‌هایی مثل [@userinfobot](https://t.me/userinfobot) قابل دریافت است

---

## 🚀 راه‌اندازی کامل (بدون ترمینال)

تمام مراحل زیر فقط با **مرورگر** و از طریق **داشبورد Cloudflare** انجام می‌شود؛ نیازی به نصب چیزی روی کامپیوتر یا اجرای دستور نیست.

### مرحله ۱ — ساخت ربات در تلگرام
1. به [@BotFather](https://t.me/BotFather) پیام دهید و دستور `/newbot` را ارسال کنید.
2. یک نام و یک یوزرنیم (که باید به `bot` ختم شود) برای ربات انتخاب کنید.
3. BotFather یک **توکن** به شما می‌دهد، مثلاً:
   ```
   123456789:AAExampleTokenXXXXXXXXXXXXXXXXXXXXXXX
   ```
   این توکن را جایی امن نگه دارید — در مراحل بعد به آن نیاز دارید.

### مرحله ۲ — گرفتن آیدی عددی خودتان (Owner ID)
1. به [@userinfobot](https://t.me/userinfobot) پیام دهید.
2. عددی که به‌عنوان `Id` نشان می‌دهد را کپی کنید — این آیدی عددی شماست و به‌عنوان مالک (Owner) ربات تنظیم می‌شود.

### مرحله ۳ — ساخت Worker در Cloudflare
1. وارد [dash.cloudflare.com](https://dash.cloudflare.com) شوید (یا ثبت‌نام کنید).
2. از منوی سمت چپ روی **Workers & Pages** کلیک کنید.
3. روی **Create** یا **Create Application** و سپس **Create Worker** کلیک کنید.
4. یک نام برای Worker انتخاب کنید، مثلاً `telerich-bot`، و روی **Deploy** بزنید (یک نمونه پیش‌فرض دیپلوی می‌شود — مهم نیست، در مرحله بعد عوضش می‌کنیم).
5. بعد از دیپلوی، روی دکمه **Edit code** (یا **Quick edit**) کلیک کنید تا وارد ویرایشگر آنلاین کد شوید.
6. تمام کد پیش‌فرض داخل ویرایشگر را **پاک کنید**.
7. کل محتوای فایل `worker.js` این پروژه را **کپی** و در ویرایشگر **پیست** کنید.
8. در ابتدای کد، دو مقدار زیر را با اطلاعات خودتان جایگزین کنید:
   ```js
   const BOT_TOKEN = "Enter your Telegram bot token"; // توکنی که از BotFather گرفتید
   const OWNER_ID = 102026299; // آیدی عددی خودتان (Owner ID)
   ```
9. روی **Save and Deploy** (یا **Deploy**) کلیک کنید.

### مرحله ۴ — ساخت KV Namespace
این بات برای ذخیره ادمین‌ها، کانال‌ها و وضعیت ساخت پست به یک KV Namespace به نام `BOT_DB` نیاز دارد.

1. در داشبورد Cloudflare از منوی سمت چپ به **Storage & Databases** (یا **Workers & Pages → KV**) بروید.
2. روی **Create namespace** (یا **Create a Namespace**) کلیک کنید.
3. یک نام دلخواه بدهید، مثلاً `telerich-db`، و روی **Add** / **Create** بزنید.

### مرحله ۵ — اتصال (Bind) کردن KV به Worker
1. به صفحه Worker خودتان برگردید (همان `telerich-bot`).
2. وارد تب **Settings** شوید و بخش **Variables and Bindings** (یا **Bindings**) را پیدا کنید.
3. روی **Add binding** کلیک کنید و نوع آن را **KV Namespace** انتخاب کنید.
4. در قسمت **Variable name**، دقیقاً عبارت زیر را بنویسید (حتماً با همین حروف بزرگ):
   ```
   BOT_DB
   ```
5. در قسمت **KV namespace**، namespace‌ای که در مرحله قبل ساختید (`telerich-db`) را انتخاب کنید.
6. روی **Save** / **Deploy** کلیک کنید تا تغییرات اعمال شود.

> ⚠️ نام بایندینگ باید **دقیقاً** `BOT_DB` باشد، چون کد در داخل خودش از `env.BOT_DB` استفاده می‌کند.

### مرحله ۶ — تنظیم Webhook تلگرام
بعد از دیپلوی، Worker شما یک آدرس عمومی دارد، چیزی شبیه به:
```
https://telerich-bot.your-subdomain.workers.dev
```

برای اینکه تلگرام پیام‌ها را به این آدرس بفرستد، باید Webhook را تنظیم کنید. کافیست آدرس زیر را در مرورگر باز کنید (به‌جای `<TOKEN>` و `<WORKER_URL>` مقادیر خودتان را بگذارید):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>
```

مثال:
```
https://api.telegram.org/bot123456789:AAExampleToken/setWebhook?url=https://telerich-bot.your-subdomain.workers.dev
```

اگر پاسخی شبیه به زیر دیدید، یعنی موفق بوده است:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### مرحله ۷ — اضافه کردن ربات به کانال
1. ربات ساخته‌شده را به کانال مورد نظر **اضافه کنید**.
2. ربات را **ادمین کانال** کنید (حداقل با دسترسی **ارسال پیام / Post Messages**).

### مرحله ۸ — تست نهایی
1. در پیوی (چت خصوصی) با ربات، دستور `/start` را ارسال کنید.
2. زبان مورد نظر (فارسی/انگلیسی) را انتخاب کنید.
3. اگر آیدی عددی شما همان `OWNER_ID` باشد، گزینه **پنل ادمین ⚙️** را خواهید دید.
4. از پنل ادمین وارد **مدیریت کانال‌ها** شوید و کانالی که ربات در آن ادمین است را با آیدی عددی (مثل `-1001234567890`) یا یوزرنیم (مثل `@mychannel`) اضافه کنید.
5. از منوی **ساخت پست** یک پیام بنویسید، پیش‌نمایش را بررسی کنید، در صورت تمایل دکمه اضافه کنید، کانال را انتخاب کرده و ارسال کنید.

---

## 📖 راهنمای استفاده

### ساخت و ارسال پست
1. وارد **پنل ادمین → ساخت پست** شوید.
2. متن پست (با Markdown یا HTML) را ارسال کنید.
3. پیش‌نمایش پست نمایش داده می‌شود؛ می‌توانید متن یا دکمه‌ها را ویرایش کنید.
4. در صورت تمایل، دکمه‌های شیشه‌ای را به فرمت زیر اضافه کنید:
   ```
   متن دکمه - https://link.com
   دکمه ۱ - http://a.ai | دکمه ۲ - http://b.ai
   ```
   هر خط = یک ردیف دکمه، و `|` برای جدا کردن چند دکمه در یک ردیف استفاده می‌شود.
5. یک یا چند کانال را برای ارسال انتخاب کنید و روی **ارسال به موارد انتخاب‌شده** بزنید.
6. نتیجه ارسال برای هر کانال (موفق ✅ یا ناموفق ❌) نمایش داده می‌شود.

### مدیریت ادمین‌ها
از مسیر **پنل ادمین → مدیریت ادمین‌ها**:
- ➕ افزودن ادمین: ارسال آیدی عددی کاربر
- ➖ حذف ادمین: ارسال آیدی عددی (مالک اصلی غیرقابل حذف است)
- 📋 لیست ادمین‌ها

### مدیریت کانال‌ها
از مسیر **پنل ادمین → مدیریت کانال‌ها**:
- ➕ افزودن کانال: ارسال آیدی عددی (مثل `-1001234567890`) یا یوزرنیم (مثل `@mychannel`)
- ➖ حذف کانال
- 📋 لیست کانال‌ها

---

## ⚠️ نکات مهم و امنیتی

- **توکن ربات را محرمانه نگه دارید** و آن را در جای دیگری منتشر نکنید.
- نام بایندینگ KV باید دقیقاً `BOT_DB` باشد.
- برای اینکه ربات بتواند در کانالی پست ارسال کند، باید **ادمین آن کانال** باشد.
- آیدی عددی کانال‌های خصوصی معمولاً با `-100` شروع می‌شود.

---

## 🔗 منابع

- [مستندات Rich Message تلگرام](https://core.telegram.org/bots/api#rich-message-formatting-options)
- [مخزن اصلی پروژه TeleRich](https://github.com/DarknessShade/TeleRich)

---

## 👤 سازنده

- 🗽 [GitHub](https://github.com/DarknessShade)
- 🗽 [Paradise Of Freedom](https://t.me/Paradise_Of_Freedom)
- 🗽 [ConfigWireguard](https://t.me/ConfigWireguard)
