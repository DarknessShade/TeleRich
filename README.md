# 🤖 Telegram [Rich Markdown](https://core.telegram.org/bots/api#rich-message-formatting-options) & HTML Bot

[English](#english) | [فارسی](#فارسی)

---

<div id="english"></div>

## 🇬🇧 English Description

An advanced **Telegram Bot** running entirely on **Cloudflare Workers**. It allows users to send regular Markdown or HTML text and receive it instantly rendered as a **Rich Message**. Perfect for testing complex Telegram styling, tables, math formulas ($E=mc^2$), collapsible details, and nested formats before publishing them to your channels or chats.

### 🌟 Features
* **Dual Language Support:** Fully localized in English and Persian (فارسی).
* **Rich Message Rendering:** Supports custom Markdown extensions (`==highlight==`, `||spoiler||`) and HTML tags (`<table>`, `<details>`, `<tg-math>`).
* **Serverless Architecture:** Hosted on Cloudflare Workers (Fast, secure, and 100% free under daily limits).
* **Live Demo:** Try it out on Telegram: [@MarkdownRenderBot](https://t.me/MarkdownRenderBot)

---

### 🚀 Quick Deployment Guide (Cloudflare Workers)

Follow these steps to deploy your own instance in less than 5 minutes:

#### 1. Create your Telegram Bot
1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the instructions to get your **Bot API Token**.

#### 2. Deploy to Cloudflare Workers
1. Sign in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** > **Create application** > **Create Worker**.
3. Name your worker (e.g., `telegram-rich-bot`) and click **Deploy**.
4. Click **Edit Code**, delete the default code, and paste the entire content of `worker.js` into the editor.
5. Go to the top of the code (around line 6) and put your Bot Token inside the `BOT_TOKEN` constant:

```javascript
   const BOT_TOKEN = "Enter your Telegram bot token";
```

 6. Click **Save and Deploy**.
#### 3. Set Up the Webhook
To link your Cloudflare Worker with Telegram, you need to register your Worker URL as a webhook.
Open your web browser and navigate to the following URL (replace placeholders with your real data):

```html
[https://api.telegram.org/bot](https://api.telegram.org/bot)<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_CLOUDFLARE_WORKER_URL>

```

```js
*Example:* https://api.telegram.org/bot87199695:AAH3v.../setWebhook?url=https://telegram-rich-bot.yourname.workers.dev
If successful, you will see a JSON response: {"ok":true,"result":true,"description":"Webhook was set"}.
```


<div id="فارسی"></div>


## توضیحات فارسی 🇮🇷
یک **ربات پیشرفته تلگرام** که به صورت کامل روی **Cloudflare Workers** اجرا می‌شود. این ربات به کاربران اجازه می‌دهد تا متون معمولی Markdown یا HTML خود را ارسال کرده و خروجی رندر شده آن را به صورت **Rich Message** دریافت کنند. ابزاری فوق‌العاده برای تست استایل‌های پیچیده تلگرام، جدول‌ها، فرمول‌های ریاضی (E=mc^2)، بخش‌های تاشو (Collapsible) و فرمت‌های ترکیبی قبل از انتشار در کانال‌ها یا گروه‌ها.
### 🌟 قابلیت‌ها
 * **پشتیبانی از دو زبان:** بومی‌سازی شده کامل به زبان‌های انگلیسی و فارسی.
 * **رندر پیشرفته متون:** پشتیبانی از اکستنشن‌های اختصاصی مارک‌داون (==highlight==، ||spoiler||) و تگ‌های اچ‌تی‌ام‌ال (<table>، <.details>، <tg-math>).
 * **معماری بدون سرور (Serverless):** میزبانی روی ورکرز کلادفلر (سریع، امن و ۱۰۰٪ رایگان در سقف استفاده روزانه).
 * **دموی زنده:** تست شده و فعال در تلگرام:[@MarkdownRenderBot](https://t.me/MarkdownRenderBot)
### 🚀 آموزش گام‌به‌گام راه‌اندازی (Cloudflare Workers)
برای راه‌اندازی ربات اختصاصی خود در کمتر از ۵ دقیقه، مراحل زیر را دنبال کنید:
#### ۱. ساخت ربات تلگرام
۱. وارد تلگرام شده و به ربات @BotFather پیام دهید.
۲. دستور /newbot را ارسال کرده و مراحل را برای دریافت **Bot API Token** طی کنید.
#### ۲. دپلوی روی کلادفلر (Cloudflare Workers)
۱. وارد حساب کاربری خود در Cloudflare Dashboard شوید.
۲. به مسیر **Workers & Pages** > **Create application** > **Create Worker** بروید.
۳. یک نام برای ورکر خود انتخاب کنید (مثلاً telegram-rich-bot) و روی **Deploy** کلیک کنید.
۴. روی **Edit Code** کلیک کنید، کدهای پیش‌فرض را پاک کرده و تمام محتویات فایل worker.js را در ادیتور پیست کنید.
۵. به خطوط ابتدایی کد (حدود خط ۶) بروید و توکن ربات خود را مستقیماً داخل متغیر BOT_TOKEN قرار دهید:

```javascript
const BOT_TOKEN = "Enter your Telegram bot token";
```
۶. روی دکمه **Save and Deploy** کلیک کنید.
#### ۳. تنظیم وب‌هوک (Webhook)
برای اتصال ورکر کلادفلر به تلگرام، باید آدرس ورکر خود را به عنوان وب‌هوک ثبت کنید.
مرورگر خود را باز کرده و به آدرس زیر بروید (مقادیر داخل <> را با اطلاعات خود جایگزین کنید):

```html
[https://api.telegram.org/bot](https://api.telegram.org/bot)<YOUR_BOT_TOKEN>/setWebhook?url=<YOUR_CLOUDFLARE_WORKER_URL>
```

```js
*مثال:* https://api.telegram.org/bot87199695:AAH3v.../setWebhook?url=https://telegram-rich-bot.yourname.workers.dev
در صورت موفقیت‌آمیز بودن، این پاسخ را مشاهده خواهید کرد: {"ok":true,"result":true,"description":"Webhook was set"}.
```



[ÐΛɌ₭ᑎΞ𐒡𐒡](https://darkness-web.pages.dev/) • | • [Telegram](https://t.me/Paradise_Of_Freedom) • | • [@MarkdownRenderBot](https://t.me/MarkdownRenderBot)
