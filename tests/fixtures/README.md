# Fixtures

هذه الملفات **مصنوعة يدوياً** على هيئة الردود المعروفة للمنصات، وليست ردوداً حقيقية ملتقطة.
السبب: بيئة التطوير السحابية التي بُني فيها Phase 0 لا تصل إلى إنستغرام وفيسبوك.

عند تشغيل السبايكين على جهاز حقيقي تُحفظ الردود الخام تلقائياً في:

- `data/spikes/instagram/<handle>/raw-*.json`
- `data/spikes/ad-library/<slug>/raw-*.json`

**المطلوب في Phase 2:** استبدال هذه الملفات بردود حقيقية (بعد حذف أي بيانات شخصية منها)،
حتى تكشف الاختبارات أي تغيّر في شكل المواقع.

| الملف | يمثّل |
|---|---|
| `instagram-web-profile-info.json` | الشكل القديم: `data.user` مع `edge_owner_to_timeline_media` |
| `instagram-timeline-graphql.json` | الشكل الأحدث: `like_count` / `comment_count` / `taken_at` / `image_versions2` |
| `ad-library-graphql.json` | نتائج بحث مكتبة الإعلانات: `ad_archive_id` + `snapshot` |
