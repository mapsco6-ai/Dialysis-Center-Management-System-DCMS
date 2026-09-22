# إعادة تصميم المسارات: API v2 وعناوين الواجهة ورحلة المريض

> ثلاث طبقات صُمّمت معاً: (1) مسارات الـ API، (2) عناوين صفحات الواجهة، (3) رحلة العمل. لا كسر لأي شيء قائم: v1 يعمل كما هو، والعناوين القديمة تُحوَّل تلقائياً.

## 1) API v2 (`/api/v2`)

### المبادئ
1. **أسماء جمع بصيغة kebab-case**، ومورد واحد لكل مفهوم.
2. **الموعد يُسمّى موعداً**: كان v1 يسمّي معرّف الموعد "معرّف جلسة" (`/sessions/{id}`). في v2 الجلسة السريرية مورد فرعي تحت الموعد: `/appointments/{id}/session/...`.
3. **الهوية تحت `/me`**: الدخول والخروج إنشاء وإنهاء "جلسة مصادقة" (`POST /auth/sessions` و`DELETE /auth/sessions/current`).
4. **تغيير الحالة = `PATCH .../status`**، الحفظ المتكرر = `PUT`، والإجراءات المجالية تبقى أفعالاً صريحة بـ `POST`. (حالات الاستجابة تتبع الفعل: PATCH/PUT تعيد 200 لا 201).
5. **لا معنيان لمسار واحد**: `GET /audit-logs` هو البحث المُرقَّم، والتغذية بالمؤشر صارت `/audit-logs/feed`.
6. أي مسار غير مذكور أدناه **يحتفظ باسمه** في v2.

### كيف يعمل (بلا تكرار كود)
- `apps/api/src/common/api-v2.ts` جدول واحد `ROUTE_PAIRS`. وسيط يعيد كتابة `/api/v2/...` إلى معالج v1 قبل التوجيه، فتبقى الصلاحيات والتحقق والتدقيق والاختبارات مصدراً واحداً.
- المسار القديم لا يعمل داخل v2: يعيد 404 مع اسم البديل (`Not found in v2 - use GET /api/v2/me`).
- v1 يعمل كما هو، وتحمل استجاباته للمسارات المُعاد تسميتها الترويستين `Deprecation: true` و`X-Successor-Route`.
- وثيقة OpenAPI لـ v2 تُشتق من v1 بالجدول نفسه: `apps/api/openapi.v2.yaml` وواجهة Swagger الحية `/api/v2/docs`.

### ترحيل الواجهة وعقد الاستجابة

الواجهة تستدعي v2 مباشرةً، بما في ذلك الدخول والخروج والإجراءات السريرية والتدقيق و«إدخالاتي». إعدادات Docker والأمثلة تستخدم `/api/v2`، ويصحح عميل الويب الإعداد القديم المنتهي بـ `/api/v1` تلقائياً. اتصال Socket.IO يستخدم أصل الخادم دون بادئة الإصدار.

كل رد JSON ناجح في v2 يحمل `data`:

```json
{"data": {"id": "patient-id"}}
{"data": [{"id": "patient-id"}]}
{"data": [{"id": "patient-id"}], "meta": {"total": 100}}
```

القوائم التي كانت تعيد `{data,total,...}` تنقل بقية حقولها إلى `meta`، بما فيها `unread` وإحصاءات التجميع، دون إسقاط معلومات. القوائم غير المرقّمة لا تدّعي إجمالياً أو ترقيم صفحات غير متاح. الكائنات التجميعية مثل لوحة رحلة المريض تبقى كائنات داخل `data`.

`apiFetch` يفك الغلاف مركزياً: يعيد المورد أو المصفوفة، ويعيد `{data,...meta}` للقوائم المرقّمة كي تحتفظ مكونات العرض بواجهتها الحالية. الأخطاء و204 والملفات الثنائية وSwagger تبقى دون غلاف. لا يتغير عقد v1.

**النشر والتراجع:** انشر الخادم الذي يدعم الغلاف أولاً، ثم أعد بناء الواجهة لأن Next.js يضمّن `NEXT_PUBLIC_API_URL` وقت البناء. الواجهة القديمة تظل تعمل على v1. للتراجع أعد نسخة الواجهة السابقة؛ يمكن إبقاء الخادم الجديد لأنه يدعم الإصدارين. لا ترحيل بيانات مطلوب لهذه المرحلة.

**التحقق:** `node apps/api/scripts/test-api-v2.cjs` يختبر عبر HTTP المسارات الستين والتوافق مع v1 والغلاف والأخطاء والتنزيلات، ويختبر فك الغلاف في عميل الويب. اختبارات Playwright تستخدم الآن v2 وبيانات تجريبية دون قاعدة بيانات.

### جدول التحويل (60 مساراً)
| v1 | v2 |
|---|---|
| `POST /auth/login` | `POST /auth/sessions` |
| `POST /auth/logout` | `DELETE /auth/sessions/current` |
| `GET /auth/me` | `GET /me` |
| `POST /auth/change-password` | `PUT /me/password` |
| `GET /auth/shift-report-status` | `GET /me/shift-report-status` |
| `PATCH /nursing/my-pin` | `PUT /me/pin` |
| `GET /nursing/my-assignments` | `GET /me/assignments` |
| `GET /staff-entries/mine` | `GET /me/staff-entries` |
| `POST /nursing/verify-pin` | `POST /pin-verifications` |
| `GET /patients/barcode/{code}` | `GET /patients/by-barcode/{code}` |
| `POST /patients/{id}/restrict` | `PUT /patients/{id}/restriction` |
| `GET /audit-logs/patients/{patientId}` | `GET /patients/{id}/audit-log` |
| `GET /schedule` | `GET /appointments` |
| `GET /schedule/today` | `GET /appointments/today` |
| `POST /sessions/extra` | `POST /appointments/extra` |
| `POST /sessions/emergency` | `POST /appointments/emergency` |
| `GET /reception/scan/{barcode}` | `GET /appointments/scan/{barcode}` |
| `POST /schedule/{id}/reschedule` | `POST /appointments/{id}/reschedule` |
| `POST /sessions/{id}/check-in` | `POST /appointments/{id}/check-in` |
| `GET /inventory/schedules/{scheduleId}/cost` | `GET /appointments/{id}/cost` |
| `GET /sessions/{id}` | `GET /appointments/{id}/session` |
| `POST /sessions/{id}/pre-dialysis` | `PUT /appointments/{id}/session/pre-dialysis` |
| `POST /sessions/{id}/confirm-supplies-ready` | `POST /appointments/{id}/session/supplies-ready` |
| `POST /sessions/{id}/assign-machine` | `POST /appointments/{id}/session/machine` |
| `POST /sessions/{id}/reassign-machine` | `PUT /appointments/{id}/session/machine` |
| `POST /sessions/{id}/start` | `POST /appointments/{id}/session/start` |
| `POST /sessions/{id}/end` | `POST /appointments/{id}/session/end` |
| `POST /sessions/{id}/discharge` | `POST /appointments/{id}/session/discharge` |
| `POST /sessions/{id}/interrupt` | `POST /appointments/{id}/session/interrupt` |
| `POST /sessions/{id}/resume` | `POST /appointments/{id}/session/resume` |
| `GET /sessions/{id}/readings` | `GET /appointments/{id}/session/readings` |
| `POST /sessions/{id}/readings` | `POST /appointments/{id}/session/readings` |
| `POST /sessions/{id}/readings/{readingId}/amend` | `POST /appointments/{id}/session/readings/{readingId}/amendments` |
| `GET /sessions/{id}/events` | `GET /appointments/{id}/session/events` |
| `POST /sessions/{id}/events` | `POST /appointments/{id}/session/events` |
| `GET /sessions/{id}/supplies` | `GET /appointments/{id}/session/supplies` |
| `POST /sessions/{id}/supplies/confirm-issue` | `POST /appointments/{id}/session/supplies/issues` |
| `PATCH /sessions/{id}/supplies/override` | `PATCH /appointments/{id}/session/supplies/override` |
| `POST /sessions/{id}/supplies/substitute` | `POST /appointments/{id}/session/supplies/substitutions` |
| `POST /machines/{id}/status` | `PATCH /machines/{id}/status` |
| `GET /approvals` | `GET /machine-approvals` |
| `POST /approvals/machine-usage` | `POST /machine-approvals` |
| `POST /approvals/expire-stale` | `POST /machine-approvals/expiry-sweep` |
| `POST /approvals/{id}/decision` | `PATCH /machine-approvals/{id}` |
| `GET /maintenance/tickets` | `GET /maintenance-tickets` |
| `POST /maintenance/tickets` | `POST /maintenance-tickets` |
| `GET /maintenance/staff` | `GET /maintenance-tickets/assignees` |
| `GET /maintenance/tickets/{id}` | `GET /maintenance-tickets/{id}` |
| `GET /maintenance/tickets/{id}/attachment` | `GET /maintenance-tickets/{id}/attachment` |
| `POST /maintenance/tickets/{id}/assign` | `POST /maintenance-tickets/{id}/assign` |
| `POST /maintenance/tickets/{id}/status` | `PATCH /maintenance-tickets/{id}/status` |
| `POST /maintenance/tickets/{id}/cancel` | `POST /maintenance-tickets/{id}/cancel` |
| `POST /maintenance/tickets/{id}/close` | `POST /maintenance-tickets/{id}/close` |
| `GET /nursing/assignments` | `GET /nursing-assignments` |
| `POST /nursing/assignments` | `POST /nursing-assignments` |
| `GET /nursing/nurses` | `GET /nursing-assignments/nurses` |
| `POST /lab/order-items/{id}/status` | `PATCH /lab/order-items/{id}/status` |
| `POST /lab/order-items/{id}/amend-result` | `POST /lab/order-items/{id}/results/amendments` |
| `GET /audit-logs/search` | `GET /audit-logs` |
| `GET /audit-logs` | `GET /audit-logs/feed` |

**رحلة المريض (جديد في v1 وv2):** `GET /flow/today?shiftId=` يعيد لكل موعد اليوم: الخطوة الحالية، حالة الخطوات الست، التنبيه (مقاطَعة/بانتظار جهاز/غائب/متأخر)، الدقائق في الخطوة، والإجراء التالي مع `allowed` بحسب صلاحيات المتصل.

## 2) عناوين الواجهة

قسّمنا `/admin/*` بحسب المجال. كل عنوان قديم يُحوَّل بـ 308 (تعمل الإشارات المرجعية وروابط الإشعارات المخزّنة).

| قديم | جديد |
|---|---|
| `/admin/schedule` | `/admin/care/appointments` |
| `/admin/patients` (+`/[id]`, `/new`) | `/admin/care/patients` |
| `/admin/reception` | `/admin/care/reception` |
| `/admin/nursing` | `/admin/care/nursing` |
| `/admin/doctor` | `/admin/care/doctor` |
| `/admin/lab` | `/admin/care/lab` |
| `/admin/pharmacy` | `/admin/care/pharmacy` |
| `/admin/sessions/[id]` (+`/supplies`) | `/admin/care/sessions/[id]` |
| — (جديد) | `/admin/care/flow` |
| `/admin/machines` | `/admin/facility/machines` |
| `/admin/maintenance` | `/admin/facility/maintenance` |
| `/admin/inventory` | `/admin/facility/inventory` |
| `/admin/quality` | `/admin/governance/quality` |
| `/admin/reports` | `/admin/governance/reports` |
| `/admin/audit` | `/admin/governance/audit` |
| `/admin/oversight` | `/admin/governance/oversight` |
| `/admin/staff` (+`/roles`) | `/admin/people/staff` |
| `/admin/entries` | `/admin/people/entries` |

القائمة الجانبية بخمس مجموعات مطابقة: نظرة عامة · رعاية المرضى · المنشأة والموارد · الجودة والرقابة · الموظفون. وأُعيد توجيه صفحات الدخول لكل دور (`landingPath`) وروابط الإشعارات وقائمة "عملي الآن".

## 3) رحلة العمل (Workflow)

بدل شاشة لكل قسم، **لوحة "رحلة المرضى اليوم"** (`/admin/care/flow`): كل مريض في ست خطوات — الوصول ← الفحص الأولي ← المستلزمات ← الجهاز ← الديلزة ← الخروج — مع:
- الخطوة الحالية وزمن البقاء فيها؛
- ترتيب تلقائي: المقاطَعة، ثم بانتظار جهاز، ثم المتأخر/الغائب، ثم الباقي، وأخيراً المنتهي؛
- **زر واحد للإجراء التالي** يفتح الشاشة المالكة للنموذج؛ وإن لم تكن للمستخدم صلاحيته يظهر الإجراء خافتاً باسم "التالي: ..." بلا زر؛
- تصفية بالوردية والخطوة و"تحتاج تدخلاً"، وتحديث لحظي عبر Socket.IO.
