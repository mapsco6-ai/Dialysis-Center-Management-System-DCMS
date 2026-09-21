# طلبات API وشاشة التحميل العامة

تاريخ التحقق: 14 أيلول 2026.

## الخلاصة

كل استدعاءات API في الواجهة تمر حصراً عبر `apiFetch` و`apiFetchBlob` في
[apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts) - لا يوجد أي استدعاء
`fetch` مباشر آخر في المشروع. الدالتان مرتبطتان الآن بعداد طلبات معلّقة
(`pendingRequestCount`) يشغّل شاشة التحميل العامة `GlobalLoader`
([apps/web/src/components/GlobalLoader.tsx](../apps/web/src/components/GlobalLoader.tsx))
المثبّتة في [apps/web/src/app/layout.tsx](../apps/web/src/app/layout.tsx).

**النتيجة:** من الناحية التقنية لا يوجد أي طلب API بلا شاشة تحميل - كل طلب
يُظهرها تلقائياً. لكن هذا يكشف مشكلة عكسية: طلبات التحديث الدوري الصامتة
(polling) تُشغّل نفس الشاشة أيضاً رغم أنها لا يجب أن تفعل.

## طلبات دورية (polling) تُشغّل الشاشة العامة رغم أنها صامتة

هذه استدعاءات تعمل في الخلفية كل 15-30 ثانية طوال بقاء المستخدم في الصفحة،
دون أن يضغط أي زر. حالياً كل واحدة منها تستدعي `apiFetch`، فتُشغّل شاشة
التحميل نفسها (بعد فرق 150ms) في كل دورة - ما يعني وميضاً متكرراً غير مرغوب
أثناء الاستخدام العادي للصفحة:

| الملف | الدالة | الفاصل الزمني |
|---|---|---|
| [apps/web/src/app/admin/page.tsx](../apps/web/src/app/admin/page.tsx) | `refresh` (ثلاث لوحات: المواعيد/الجلسات/التنبيهات) | 30 ثانية |
| [apps/web/src/app/admin/machines/page.tsx](../apps/web/src/app/admin/machines/page.tsx) | `refresh` | 15 ثانية |
| [apps/web/src/app/admin/sessions/[id]/page.tsx](../apps/web/src/app/admin/sessions/%5Bid%5D/page.tsx) | `refresh` | 15 ثانية |
| [apps/web/src/app/admin/nursing/page.tsx](../apps/web/src/app/admin/nursing/page.tsx) | `refreshDashboard` | 15 ثانية |
| [apps/web/src/app/admin/pharmacy/page.tsx](../apps/web/src/app/admin/pharmacy/page.tsx) | `refreshQueue` | 15 ثانية |
| [apps/web/src/app/admin/schedule/page.tsx](../apps/web/src/app/admin/schedule/page.tsx) | `load(false)` (فقط عند عرض يوم اليوم) | 15 ثانية |
| [apps/web/src/app/admin/lab/page.tsx](../apps/web/src/app/admin/lab/page.tsx) | `refreshQueue` | 15 ثانية |
| [apps/web/src/app/admin/maintenance/page.tsx](../apps/web/src/app/admin/maintenance/page.tsx) | `refresh` | 15 ثانية |

## تحديثات لا تمر عبر HTTP أصلاً (بشكل صحيح لا تُشغّل الشاشة)

- [apps/web/src/lib/useLiveUpdates.ts](../apps/web/src/lib/useLiveUpdates.ts):
  تحديثات فورية عبر WebSocket (`socket.io-client`)، وليست طلب HTTP، فمن
  الطبيعي ألا تُشغّل شاشة التحميل العامة.

## صفحة بلا أي استدعاء API حتى الآن

- [apps/web/src/app/admin/settings/](../apps/web/src/app/admin/settings/):
  لم يُعثر فيها على أي استدعاء `apiFetch`/`apiFetchBlob`.

## التوصية

لمنع وميض الشاشة أثناء التحديث الدوري الصامت، يمكن إضافة خيار اختياري مثل
`apiFetch(path, options, { silent: true })` يتجاوز عدّاد `pendingRequestCount`
لطلبات polling أعلاه فقط، بينما تبقى شاشة التحميل تظهر لكل طلب يبدأه
المستخدم مباشرة (فتح صفحة، حفظ نموذج، تصدير تقرير...). لم يُنفَّذ هذا بعد -
هذا الملف توثيق فقط بانتظار القرار.
