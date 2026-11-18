# Running Rasd on the laptop

Decision (owner, 2026-11-18): **Rasd stays local** and keeps reading the platforms through a logged-in browser
on the laptop, with a **dedicated collection account**. The cloud/API option is written up in
[decisions.md](decisions.md#running-rasd-with-nothing-on-the-laptop-owners-request-2026-11-18--decision-pending)
for later.

The easiest way to run it is a **Claude Code session on the laptop itself** (not a cloud session): it runs
every command, and you only type the collection account's password when the browser window opens.

## 1. Start a local session

1. Open the Claude app on the laptop → Claude Code → new session.
2. Choose to run it **on this computer (Local)**, not in the cloud, and pick an empty folder
   (e.g. `Documents/rasd-work`).
3. Paste the message below.

## 2. The message to paste

```text
انسخ الريبو https://github.com/ahmadmaqboul/Rasd لهالمجلد، واقرأ AGENTS.md و docs/PROGRESS.md و docs/laptop.md.

1. جهّز الجهاز: Node 22 أو أحدث و git (ثبّتهم إذا مش موجودين)، وبعدين npm install و npx playwright install chromium.
2. شغّل npm run dev وافتحلي http://127.0.0.1:5173.
3. ساعدني أضيف ملف «سعد للاتصالات» من صفحة البزنس، وأسجّل دخول إنستغرام بحساب الجمع من الإعدادات ← حسابات الدخول. كلمة السر بكتبها أنا بالنافذة.
4. شغّل: npm run spike:adlibrary -- --keyword "شاحن" --max 20
   إذا قرأ 0 إعلان، افحص الصورة والـ HTML المحفوظين وصلّح القراءة.
5. شغّل: npm run spike:instagram -- <حساب عام> --study
   صلّح القراءة إذا لزم، واستبدل الـ fixtures اليدوية بردود حقيقية.
6. حدّث docs/PROGRESS.md وارفع التعديلات على main بـ commits صغيرة.
7. بعدها اعرض عليّ خطة المرحلة 2 (موجودة بـ docs/PROGRESS.md) وما تبلّش فيها قبل موافقتي.
```

## 3. What you do yourself

- When the browser window opens on Instagram's login page, log in with the **collection account** (not
  Saed Tel's main account). A new account often gets a security check at first: complete it in that window.
  Rasd waits and never fills anything in.
- Keep the app running while a collection is in progress. Closing it stops the job; it can be started again.

## 4. Where things are kept

Everything stays in the `data/` folder inside the project: the database, images, and the browser profile with
the login. It is not uploaded to GitHub. Keep that folder out of cloud-synced folders (iCloud, OneDrive,
Google Drive).
