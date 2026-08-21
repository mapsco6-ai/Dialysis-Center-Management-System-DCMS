# خطة تنفيذ مشروع DCMS — التقسيم إلى فيزات مع معايير اختبار لكل فيز

> مرجع: هذه الخطة مبنية على مستند "MASTER PLAN V1.0" الأصلي للمشروع، وتنظّمه في تسلسل تنفيذ عملي قابل للقياس. كل فيز يُبنى **أولاً في الباك اند** (Prisma + NestJS API) ثم تُربط به واجهة Next.js بالحد الأدنى الكافي لاختباره، قبل الانتقال للفيز التالي. لا ننتقل لفيز جديد إلا بعد اجتياز اختبار القبول (Definition of Done) للفيز الحالي.

## الفلسفة الحاكمة

1. **المريض هو المحور** — كل الوحدات (استقبال، تمريض، طبيب، مختبر، صيدلية، مخزن، أجهزة) تكتب أحداثها في ملف مريض واحد (`Patient 360`) و`Patient Timeline`.
2. **لا حذف للسجلات الطبية** — فقط Append / Amend / Cancel مع الاحتفاظ بالتاريخ القديم (`Audit Trail`).
3. **RBAC بصلاحيات دقيقة** (`patient.view`, `dialysis.start`, ...) not hardcoded roles.
4. **Business Logic في الباك اند فقط** — الواجهة لا تقرر (مثال: هل الجهاز متاح؟ يقرره Backend Service).
5. **الترتيب الإلزامي**: Users → Patients → Scheduling → Reception → Supplies → Machines → Dialysis → Nursing → Doctor → Laboratory → Pharmacy → Advanced Inventory → Maintenance → Dashboard → Reports → Quality.

## Stack المعتمد

| الطبقة | التقنية |
|---|---|
| Backend | NestJS + TypeScript |
| DB / ORM | PostgreSQL + Prisma |
| Frontend | Next.js + TypeScript + Tailwind (PWA) |
| Realtime | Socket.IO (من الفيز 5 فما فوق عند الحاجة لـ Live Dashboards) |
| Storage | MinIO (يُفعَّل من الفيز الذي يحتاج مرفقات: صور أعطال، PDF) |
| Cache/Queue | Redis (يُفعَّل عند الحاجة الفعلية، ليس إلزامياً قبل الفيز 11) |
| Infra | Docker Compose (`postgres`, `api`, `web`, لاحقاً `minio`, `redis`) |
| هيكل الريبو | Monorepo: `apps/api`, `apps/web`, `packages/shared|types|ui`, `database/`, `docs/` |

---

# الفيز 0 — Foundation (الأساس)

**الهدف:** بنية مشروع تعمل فعلياً (Docker + DB + API + Web) مع تسجيل دخول وصلاحيات وتدقيق، قبل أي منطق طبي.

**يشمل:**
- Monorepo scaffold (`apps/api` NestJS, `apps/web` Next.js, `packages/shared|types`).
- `docker-compose.yml`: `postgres`, `api`, `web`.
- Prisma init + أول Migration.
- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` (JWT + bcrypt/argon2 لتشفير كلمة المرور).
- Users CRUD (`User` model: username, passwordHash, fullName, role(s), isActive).
- Roles + Permissions (`Role`, `Permission`, `RolePermission` join) — بذر (seed) الأدوار الـ12 من المستند: `SUPER_ADMIN, CENTER_DIRECTOR, MEDICAL_DIRECTOR, DOCTOR, HEAD_NURSE, NURSE, PHARMACIST, WAREHOUSE, LAB_TECHNICIAN, RECEPTION, MAINTENANCE, ACCOUNTANT`.
- `PermissionsGuard` + `@RequirePermissions('patient.view', ...)` decorator يقرأ الصلاحيات من DB وليس enum مبرمج.
- `AuditModule`: `AuditInterceptor` أو `AuditService.log()` يسجل كل عملية Create/Update/Delete الحساسة (`actor_id, actor_role, action, entity_type, entity_id, old_value, new_value, reason, timestamp, device, ip_address`).
- Next.js: شاشة Login فقط + Route Guard حسب الصلاحيات (`/admin`, لاحقاً `/ward`, `/pharmacy`...).

**لا يشمل:** أي شيء عن المرضى أو الجدولة أو الديلزة (تلك تبدأ من الفيز 1).

**المخرجات:**
- `docker compose up` يشغّل postgres + api + web بدون أخطاء.
- Migration أولى تُنشئ جداول `User/Role/Permission/RolePermission/AuditLog`.
- Seed script ينشئ الأدوار الـ12 + مستخدم `SUPER_ADMIN` أولي.

**معيار القبول (اختبار الفيز):**
1. `docker compose up` ينجح، و`GET /api/v1/health` يرجع 200.
2. تسجيل دخول بمستخدم SUPER_ADMIN → JWT صالح يحتوي الصلاحيات.
3. إنشاء مستخدم جديد بدور `NURSE` عبر `POST /users` (كـ Admin) → ينجح ويُسجَّل في `AuditLog`.
4. محاولة نفس الطلب بمستخدم `NURSE` (بدون صلاحية `user.create`) → **403 Forbidden**.
5. تسجيل دخول بكلمة مرور خاطئة 401، وبكلمة صحيحة 200 مع توكن.
6. تعديل صلاحيات دور معين ثم تسجيل دخول جديد يعكس الصلاحيات المحدّثة فوراً (لا Cache قديم).
7. كل عملية أعلاه (إنشاء مستخدم، تعديل دور) تظهر كسطر في `GET /audit-logs` (لـ SUPER_ADMIN فقط، غيره 403).

---

# الفيز 1 — Patient Registry (سجل المرضى)

**الهدف:** تسجيل جميع المرضى الـ520 ببيانات كاملة، مع بحث وباركود وملف Patient 360 (Shell).

**يشمل:**
- `Patient` model: الحقول الشخصية (Patient ID، Barcode، الاسم، الجنس، تاريخ الميلاد، الهاتف، العنوان، رقم الإضبارة، تاريخ التسجيل، الحالة `ACTIVE/INACTIVE/DECEASED/TRANSFERRED`) والصحية (التشخيصات، الأمراض المزمنة، الحساسية، تاريخ بدء الديلزة، Dry Weight، نوع الوصول الوعائي `FISTULA/CATHETER/GRAFT`، ملاحظات طبية، تعليمات خاصة).
- توليد **Patient ID** و **Barcode** تلقائياً وفريد (بدون أي معلومة طبية داخل الباركود، مطابق لمثال المستند `P-A7KD92`).
- `ClinicalAlert` model: نوع (`CRITICAL/IMPORTANT/INFORMATION`)، نص، مرتبط بمريض، من أنشأه، تاريخ.
- `PatientTimelineEvent` model (سجل أحداث عام يُستخدم من كل الفيزات القادمة): `patientId, type, payload(json), performedBy, performedAt`.
- Endpoints: `GET/POST /patients`, `GET /patients/:id`, `PATCH /patients/:id`, `GET /patients/search?q=`, `GET /patients/barcode/:code`, `GET /patients/:id/timeline`, `POST/GET /patients/:id/alerts`.
- صلاحيات: `patient.view`, `patient.create`, `patient.edit`, `patient.alert.manage`.
- Next.js: شاشة "إضافة مريض"، شاشة بحث، وشاشة Patient 360 (تعرض حالياً فقط البيانات الأساسية + التنبيهات + Timeline فارغ/مبدئي).
- سكربت استيراد جماعي (CSV/Excel) لتسجيل الـ520 مريضاً دفعة واحدة.

**لا يشمل:** الجدولة، الحضور، الديلزة، المختبر، الأدوية — الملف هنا "Shell" فقط تُملأ أقسامه لاحقاً.

**المخرجات:**
- إمكانية تسجيل مريض جديد يدوياً أو عبر استيراد جماعي.
- كل مريض له Patient ID + Barcode فريدين لا يتكرران.

**معيار القبول (اختبار الفيز):**
1. `POST /patients` ببيانات مريض → 201 مع `patientId` و`barcode` مولّدين تلقائياً وفريدين.
2. إنشاء 520 مريضاً (عبر سكربت الاستيراد) بدون أي تصادم في Patient ID/Barcode.
3. `GET /patients/barcode/P-XXXXXX` يرجع نفس المريض الصحيح خلال أقل من ثانية.
4. `GET /patients/search?q=` بالاسم الجزئي أو رقم الإضبارة أو الهاتف يرجع نتائج صحيحة، ولا يرجع نتائج لمستخدم بلا صلاحية `patient.view`.
5. تعديل بيانات مريض (`PATCH`) → يُنشئ سطر `AuditLog` بالقيمة القديمة/الجديدة + سطر `PatientTimelineEvent`.
6. إضافة `ClinicalAlert` بنوع `CRITICAL` → تظهر عند جلب المريض (`GET /patients/:id`) في حقل بارز.
7. مستخدم بدور `WAREHOUSE` (بدون `patient.edit`) يحاول `PATCH /patients/:id` → 403.
8. محاولة تسجيل مريض بباركود/ID مكرر يدوياً (إن وُجدت واجهة يدوية) → يُرفض بخطأ واضح، لا Overwrite صامت.

---

# الفيز 2 — Scheduling (الجدولة)

**الهدف:** لكل مريض خطة غسيل مستقلة (1–4 جلسات أسبوعياً) وجدول يومي محسوب تلقائياً.

**يشمل:**
- `DialysisPlan` (أيام الأسبوع + الوجبة لكل مريض)، `Shift` (الوجبات الأربع 06-10 / 12-16 / 18-22 / 00-04)، `DialysisSchedule` (الحدث اليومي المتولّد من الخطة).
- حساب **Nominal Capacity** و **Available Clinical Capacity** لكل وجبة/ردهة (بدون منطق الأجهزة الفعلي بعد — رقمي فقط في هذا الفيز، يُفعَّل تشغيلياً في الفيز 5).
- تعريف (Model فقط) لـ `EXTRA_SESSION` و`EMERGENCY_SESSION` — المنطق التشغيلي الكامل يبدأ من الفيز 3/6، هنا فقط الهيكلة وربطها بمريض/سبب/طبيب طالب.
- Endpoints: `POST /patients/:id/dialysis-plan`, `GET /schedule/today`, `GET /schedule?date=`, `POST /sessions/extra`, `POST /sessions/emergency`.

**لا يشمل:** الاستقبال الفعلي (Check-in)، الحضور والغياب (فيز 3)، تعيين الجهاز الفعلي (فيز 5).

**المخرجات:** جدول يومي يعرض من المتوقع حضوره اليوم ووجبته، لكل مريض.

**معيار القبول (اختبار الفيز):**
1. إنشاء خطة لمريض بـ3 جلسات أسبوعياً (أحد/ثلاثاء/خميس، وجبة 1) → `GET /schedule/today` في يوم الأحد يُظهره، وفي يوم السبت لا يُظهره.
2. مريض بخطة "جلسة واحدة أسبوعياً" وآخر بـ"4 جلسات" يعملان بشكل مستقل بدون تعارض.
3. `GET /schedule?date=2026-08-22` يرجع نفس القائمة المتوقعة يدوياً من الخطط المسجّلة.
4. إنشاء `EXTRA_SESSION` بسبب وطبيب طالب → تظهر في جدول اليوم كحدث إضافي منفصل عن الجدول الاعتيادي.
5. حساب Nominal Capacity ليوم/وجبة معينة يطابق (عدد الأجهزة الكلي المُدخل يدوياً في هذا الفيز، قبل ربطه الحقيقي بحالات الأجهزة في فيز 5).

---

# الفيز 3 — Reception (الاستقبال)

**الهدف:** استقبال فعلي للمريض عبر الباركود مع تتبع التأخير والغياب.

**يشمل:**
- Check-In: `POST /sessions/:id/check-in` (يحوّل حالة الجلسة من `SCHEDULED` إلى `ARRIVED`، يسجّل وقت الوصول والمستخدم والمحطة).
- منطق `LATE` (تجاوز حد زمني تحدده الإدارة) و`ABSENT` (بعد انتهاء نافذة الحضور) — Cron/Job دوري أو فحص عند القراءة.
- Patient Status Board: شاشة استقبال حيّة تعرض `Expected / Arrived / Late / Absent`.
- كل حدث يُضاف لـ `PatientTimelineEvent`.

**لا يشمل:** تجهيز المواد أو تعيين الجهاز (تبدأ من الفيز 4/5).

**المخرجات:** موظف الاستقبال يمسح باركود المريض ويرى حالته اليوم فوراً.

**معيار القبول (اختبار الفيز):**
1. مسح باركود مريض له جلسة اليوم → يعرض `Patient Name/Photo/File No/Today's Session/Expected`.
2. `POST /sessions/:id/check-in` → الحالة تتحول `SCHEDULED → ARRIVED`، ويُسجَّل وقت الوصول والموظف والمحطة.
3. مريض وصل بعد الحد الزمني المسموح (مثلاً بعد 30 دقيقة) → الحالة `LATE` مع حساب `Delay` الصحيح بالدقائق، ويظهر الحدث في Timeline.
4. مريض لم يصل نهائياً بعد انتهاء نافذة الحضور → تتحول حالته إلى `ABSENT` تلقائياً (بدون تدخل يدوي)، ويظل موعد الجلسة الأصلي محفوظاً (لا حذف).
5. باركود غير موجود في النظام → رسالة خطأ واضحة، بدون Crash.
6. Status Board يعكس الحالات الأربع بشكل صحيح ولحظي (Real-time أو Polling قصير).
7. تقرير الغياب يعرض هذا المريض ضمن قائمة الغائبين لليوم.

---

# الفيز 4 — Inventory Supplies (تجهيزات ما قبل الجلسة)

**الهدف:** ربط المريض بمخزونه الافتراضي وصرف المواد قبل الجلسة مع خصم المخزون فعلياً.

**يشمل:**
- `InventoryItem`, `StockLocation` (`MAIN_WAREHOUSE` كبداية)، `StockBalance`, `StockMovement`.
- `PatientSupplyProfile` (المواد الافتراضية لكل مريض: Dialyzer type, Blood Line, Needle gauge, Saline...).
- `Session Override`: تعديل التجهيزات لجلسة محددة دون تغيير الملف الافتراضي.
- `POST /sessions/:id/supplies/confirm-issue`: يخصم من `StockBalance`، يربط المواد بالجلسة، يسجّل الموظف/الوقت.
- حالة **REQUIRED_ITEM_NOT_AVAILABLE** عند نقص مادة: لا استبدال صامت — يتطلب اختيار بديل معتمد / طلب موافقة / تصعيد، ويُحفظ ما حدث.

**لا يشمل:** تعيين الجهاز الفعلي (فيز 5)، الصيدلية (فيز 10) — هذا الفيز خاص فقط بمستلزمات الديلزة من المخزن الرئيسي.

**المخرجات:** بعد Check-In، الموظف يفتح ملف المريض ويرى مستلزماته الافتراضية جاهزة للتأكيد والصرف.

**معيار القبول (اختبار الفيز):**
1. فتح ملف مريض له Supply Profile مسبق → النظام يجلب المواد الافتراضية تلقائياً.
2. تعديل مادة لهذه الجلسة فقط (Session Override) → لا يغيّر الـ Profile الافتراضي للمريض في الجلسات القادمة.
3. `CONFIRM ISSUE` → المخزون (`StockBalance`) ينخفض بالكمية الصحيحة، وتُنشأ `StockMovement`، وتُربط المواد بالجلسة (قابلة للاستعلام لاحقاً لحساب تكلفة الجلسة).
4. طلب مادة كميتها صفر في المخزون → يظهر `REQUIRED ITEM NOT AVAILABLE` ولا يتم الصرف تلقائياً ببديل غير معتمد.
5. اختيار بديل معتمد لمادة غير متوفرة → يُسجَّل أن بديلاً استُخدم مع السبب.
6. مستخدم بدور `NURSE` بلا صلاحية `inventory.issue` يحاول تنفيذ Confirm Issue → 403.
7. استعلام "ما هي المواد التي صُرفت لهذه الجلسة؟" يعطي قائمة دقيقة مطابقة لما تم تأكيده.

---

# الفيز 5 — Machines (الأجهزة)

**الهدف:** تفعيل حالات الـ59 جهازاً وخوارزمية التوزيع الفعلية مع سياسة الموافقات.

**يشمل:**
- `Machine` model (Ward, Status: `AVAILABLE/IN_USE/RESERVED/EMERGENCY_RESERVED/APPROVAL_REQUIRED/WAITING_CLEANING/CLEANING/MAINTENANCE/OUT_OF_SERVICE`) و`MachineStatusHistory`.
- خوارزمية التوزيع (4 مراحل من المستند: استبعاد غير المتاح → اعتيادي متاح → يحتاج Approval → حفظ Emergency Capacity)، مع `Manual Override` مسجَّل بسبب.
- `Approval` model: `MachineUsageApprovalRequest` (مريض/جهاز/وجبة/سبب/مقدم الطلب) → `APPROVED/REJECTED` مع اسم الموافق.
- ربط Nominal/Available Capacity المحسوبة في الفيز 2 بحالة الأجهزة الحقيقية الآن.
- Endpoints: `POST /sessions/:id/assign-machine`, `POST /machines/:id/status`, `POST /approvals/machine-usage`, `POST /approvals/:id/decision`.

**لا يشمل:** بدء/إنهاء الجلسة الفعلية (فيز 6)، الصيانة التفصيلية (`MaintenanceTicket` الكامل في فيز 12 — هنا فقط حالة `MAINTENANCE/OUT_OF_SERVICE` كإخراج من الجدولة).

**المخرجات:** كل مريض جاهز للجلسة يُخصَّص له جهاز تلقائياً حسب السياسة.

**معيار القبول (اختبار الفيز):**
1. جهاز بحالة `OUT_OF_SERVICE` أو `CLEANING` أو `IN_USE` أو `MAINTENANCE` أو `RESERVED` لا يظهر أبداً كخيار للتوزيع التلقائي.
2. مريض جديد جاهز → يُخصَّص له أول جهاز اعتيادي متاح (وليس جهازاً محمياً) طالما متوفر.
3. عند عدم توفر أي جهاز اعتيادي واحتياج استخدام جهاز محمي → يُنشأ `MachineUsageApprovalRequest` تلقائياً بدل التخصيص المباشر.
4. `APPROVED` من مستخدم مخوّل → يُسجَّل اسمه، ويتحول الجهاز لحالة تخصيص للمريض؛ `REJECTED` → الجهاز يبقى غير مخصَّص والمريض ينتظر.
5. Manual Override بواسطة موظف مخوّل (مثلاً Head Nurse) لتخصيص جهاز يدوياً → يتطلب إدخال سبب، ويُسجَّل في Audit.
6. محاولة استخدام جهاز طوارئ محجوز (Emergency Capacity) لمريض اعتيادي دون Approval → تُرفض.
7. `GET /wards/:id/machines` يعرض حالة كل الـ20/20/19 جهازاً بدقة لحظية.

---

# الفيز 6 — Dialysis Session (جلسة الديلزة الكاملة)

**الهدف:** الـ Digital Dialysis Sheet كاملة تحل محل الورقة، بأكبر فيز في المشروع.

**يشمل:**
- State Machine كاملة: `SCHEDULED→ARRIVED→PRE_DIALYSIS→SUPPLIES_READY→WAITING_MACHINE→ASSIGNED→IN_DIALYSIS→POST_DIALYSIS→COMPLETED→DISCHARGED` + مسارات جانبية `ABSENT/LATE/CANCELLED/EMERGENCY/EXTRA/INTERRUPTED`.
- Pre-Dialysis: Weight/BP/Pulse/Temperature/Glucose/Dry Weight/Notes.
- `START DIALYSIS`: Ward/Machine/Start Time/Nurse/Pre Weight/BP/Pulse/Dialyzer/Prescribed Duration/Required UF/Access Info.
- `DialysisReading` (Time/BP/Pulse/Arterial/Venous/TMP/BF/UF) — قيد لا يُعدَّل بدون Audit.
- `DialysisEvent` (Normal/Hypotension/Access Issue/Machine Issue/Medication Given/Physician Called/Session Interrupted/Other) — قائمة قابلة للضبط من الإدارة.
- `END DIALYSIS`: End Time/Post BP/Pulse/Post Weight/Actual UF/Complications/Final Note → الحالة `IN_DIALYSIS→COMPLETED`.
- التعفير: `WAITING_CLEANING→CLEANING→AVAILABLE` مع تسجيل الوقت والمسؤول.
- `REASSIGN MACHINE` عند عطل أثناء الجلسة (جهاز قديم/جديد/سبب/وقت/المخوِّل) دون فقدان بيانات الجلسة.

**لا يشمل:** واجهة الطبيب الكاملة (فيز 8، لكن Doctor Orders الأساسية للأدوية أثناء الجلسة تُقرأ فقط هنا كمصدر)، المختبر والصيدلية الكاملين (فيز 9/10).

**المخرجات:** جلسة ديلزة كاملة موثّقة من البداية للنهاية رقمياً.

**معيار القبول (اختبار الفيز):**
1. تسلسل الحالات الكامل يعمل بالترتيب الصحيح ولا يمكن تخطي مرحلة (مثلاً لا `IN_DIALYSIS` بدون `ASSIGNED`).
2. `START DIALYSIS` يتطلب كل الحقول الإلزامية (Machine, Nurse, Pre Weight...)، ورفض الطلب الناقص بخطأ واضح.
3. إضافة `DialysisReading` كل فترة (مثلاً كل 30 دقيقة) → القراءات تُحفظ بالتسلسل الزمني الصحيح، ولا يمكن تعديل قراءة قديمة إلا عبر مسار Amend مع سبب و Audit.
4. تسجيل `DialysisEvent` من نوع `Hypotension Event` → يظهر فوراً في سجل أحداث الجلسة وTimeline المريض.
5. `END DIALYSIS` → الحالة `IN_DIALYSIS→COMPLETED`، ويُحسب `Actual Duration` و`Actual UF` تلقائياً من الأوقات والقيم المدخلة.
6. بعد `END`، الجهاز ينتقل تلقائياً إلى `WAITING_CLEANING` ولا يظهر متاحاً حتى تُغلق `CLEANING`.
7. سيناريو عطل جهاز أثناء الجلسة: `REASSIGN MACHINE` → الجلسة تستمر بجهاز جديد وتحتفظ بكل القراءات والأحداث السابقة (لا فقدان بيانات).
8. مستخدم بدور `WAREHOUSE` يحاول `POST /sessions/:id/start` → 403 (`dialysis.start` صلاحية تمريض/طبي فقط).

---

# الفيز 7 — Nursing (التمريض)

**الهدف:** شاشة عمل الممرض في كل ردهة مع توزيع المرضى والمتابعة الحية.

**يشمل:**
- Ward Dashboard حي: `Machine → Patient → Status` لكل ردهة/وجبة.
- `NursingAssignment` (توزيع مرضى/أجهزة على ممرضين محددين من قِبل المشرف).
- عرض القراءات المستحقة، الأدوية المطلوبة (من Doctor Orders)، التنبيهات، الأحداث المفتوحة لكل ممرض.
- تعريف منفذ الإجراء بدقة: Username+Password أو PIN سريع بعد الدخول الأساسي — كل Action يسجّل `Performed By/Role/Time/Device/Ward/Patient/Session`.

**لا يشمل:** واجهة الطبيب (فيز 8).

**المخرجات:** ممرض يفتح شاشة ردهته ويرى فوراً كل مرضاه وما هو مطلوب منه.

**معيار القبول (اختبار الفيز):**
1. `NursingAssignment` لممرض معين → شاشته تعرض فقط مرضاه المخصصين (وليس كل الردهة) إن كانت السياسة كذلك، أو الردهة كاملة حسب سياسة المركز — قابل للتحقق عبر Permission Filter.
2. تسجيل إجراء (مثلاً قراءة BP) بواسطة ممرض بعد إدخال PIN السريع → السجل يحمل هوية الممرض الصحيحة وليس هوية آخر من استخدم الجهاز المشترك.
3. Ward Dashboard يعكس تغييرات حالة الجهاز/الجلسة لحظياً (بدون Refresh يدوي، أو بأقصى تأخير مقبول محدد).
4. تعليمات طبيب جديدة (Doctor Order) تظهر فوراً في شاشة الممرض المعني بهذا المريض.
5. محاولة ممرض تسجيل إجراء لمريض غير مخصَّص له (حسب السياسة) → يُرفض أو يُسجَّل تحذيراً حسب إعداد الصلاحيات.

---

# الفيز 8 — Doctor PWA (واجهة الطبيب)

**الهدف:** الطبيب يمسح المريض من أي iPad ويرى ملفه الكامل ويصدر أوامر.

**يشمل:**
- `SCAN PATIENT` (كاميرا) → `Patient Clinical Summary` (Overview/Dialysis/Labs/Medications/Orders/Notes/Timeline tabs).
- `DoctorOrder` + `Prescription`: إضافة دواء، تغيير جرعة، إيقاف دواء، طلب تحليل، تعليمات للممرض، توصية للصيدلي، تغيير Dry Weight، طلب جلسة إضافية، إضافة Clinical Alert.
- قاعدة **Prescription ≠ Administration**: `ORDER` منفصل عن `ADMINISTERED` (Prescribed By/At, Administered By/At, Dose, Session).
- تعديل أمر طبي: لا حذف — `Old Dose/New Dose/Changed By/Time/Reason` محفوظة.
- Clinical Alerts (`CRITICAL/IMPORTANT/INFORMATION`) تظهر لكل من الطبيب/الممرض/الصيدلي/المختبر حسب الصلة.

**لا يشمل:** تنفيذ الصرف الفعلي من الصيدلية (فيز 10) أو تسجيل نتائج المختبر (فيز 9) — هنا فقط الطلب/الأمر.

**المخرجات:** الطبيب يستطيع مراجعة أي مريض وإصدار أوامره من الـiPad بدون ورق.

**معيار القبول (اختبار الفيز):**
1. مسح باركود مريض من متصفح iPad (PWA) → يفتح ملخصه السريري خلال ثوانٍ.
2. إضافة دواء جديد (Order) → يظهر فوراً في قائمة "Current Medications" كـ`PRESCRIBED` وليس `ADMINISTERED`.
3. إيقاف دواء موجود → يُنقل لقسم "Previous/Stopped" مع الاحتفاظ بتاريخه الكامل (لا حذف).
4. تعديل جرعة دواء → يُنشئ سجل تغيير يحتوي `Old Dose/New Dose/Changed By/Time/Reason`، ولا يمحو القيمة القديمة.
5. طلب تحليل مختبري من تبويب Orders → يظهر لاحقاً في قائمة انتظار المختبر (فيز 9) بمجرد بنائه.
6. تغيير Dry Weight من الطبيب → يُسجَّل في Audit ويظهر بالقيمة الجديدة في Overview وTimeline.
7. Clinical Alert من نوع CRITICAL أضافه طبيب → يظهر فوراً لدى الممرض المعني بنفس المريض.
8. مستخدم بدور `LAB_TECHNICIAN` يحاول `POST /doctor-orders` → 403.

---

# الفيز 9 — Laboratory (المختبر)

**الهدف:** دورة كاملة من طلب التحليل حتى النتيجة النهائية مع تتبع تاريخي.

**يشمل:**
- `LabTest`, `LabPanel` (Configurable groups مثل "Monthly Dialysis Panel")، `LabOrder`, `LabOrderItem`, `LabResult`.
- State Machine: `ORDERED→SAMPLE_COLLECTED→PROCESSING→RESULT_ENTERED→FINAL` (لا اعتماد ثانٍ حالياً — من يُدخل النتيجة يجعلها Final).
- `Laboratory Episode`: كل نتائج نفس الطلب/التاريخ تُعرض سوية.
- `AMENDED RESULT`: تعديل نتيجة Final يحتفظ بـ Old Value/New Value/Reason/Changed By/Time.
- Trends: عرض قيمة تحليل معين عبر الزمن (لرسم بياني في الواجهة).

**لا يشمل:** الصيدلية (فيز 10).

**المخرجات:** الطبيب يطلب تحليلاً، المختبري يعالجه ويُدخل النتيجة، وتظهر ضمن ملف المريض مع الرسم البياني.

**معيار القبول (اختبار الفيز):**
1. طلب `Monthly Dialysis Panel` من الطبيب → يظهر في قائمة انتظار المختبر بكل التحاليل المكوِّنة للمجموعة.
2. تحديث حالة الطلب `ORDERED→SAMPLE_COLLECTED→PROCESSING` بالتسلسل الصحيح.
3. إدخال النتائج (`RESULT_ENTERED`) ثم `FINAL` → تظهر فوراً في ملف المريض كـ Lab Episode واحد بتاريخ موحّد.
4. تعديل نتيجة Final → لا يستبدل القيمة القديمة صامتاً؛ ينشئ `AMENDED RESULT` مع السبب والقيمتين.
5. رسم Trend لتحليل Hb عبر آخر 5 قياسات → يرجع البيانات مرتبة زمنياً وصحيحة القيم.
6. Clinical Alert مرتبط بنتيجة حرجة (لو مفعَّلة) يظهر للطبيب والممرض.
7. مستخدم بدور `PHARMACIST` يحاول `POST /lab/results` → 403.

---

# الفيز 10 — Pharmacy (الصيدلية)

**الهدف:** مسار الوصفة الطبية من الطلب حتى الصرف الفعلي مع خصم مخزون الصيدلية.

**يشمل:**
- مخزون صيدلية مستقل (`StockLocation = PHARMACY`) يُغذّى عبر تحويل من `MAIN_WAREHOUSE` (أساس بسيط من الفيز 4، التحويل الكامل في فيز 11).
- `Pharmacy Queue`: `Pending Prescriptions/Dispensing/Completed/Cancelled`.
- `DISPENSE`: خصم من `Pharmacy Stock`، تسجيل الصيدلي، ربط بالمريض/الوصفة/الجلسة عند الحاجة.
- `Medication History` ضمن Patient 360: `Prescribed/Dispensed/Administered/Stopped/Dose Changed`.
- State Machine الوصفة: `ACTIVE→DISPENSING→DISPENSED` أو `ACTIVE→MODIFIED` أو `ACTIVE→STOPPED`.

**لا يشمل:** التحويلات المتقدمة بين كل المخازن، Batch/Expiry الكامل (فيز 11).

**المخرجات:** الصيدلي يرى قائمة انتظار الوصفات ويصرف الدواء مع خصم آلي للمخزون.

**معيار القبول (اختبار الفيز):**
1. وصفة جديدة من الطبيب (فيز 8) تظهر في `Pending Prescriptions` للصيدلية تلقائياً.
2. `DISPENSE` → خصم الكمية الصحيحة من `Pharmacy Stock`، وربط الصرف بالمريض والوصفة والجلسة (إن وُجدت).
3. نفاد رصيد دواء في الصيدلية → طلب الصرف يُرفض بوضوح (لا صرف من رصيد سالب).
4. `Medication History` للمريض يعرض التسلسل الصحيح: Prescribed → Dispensed → Administered لكل دواء.
5. إيقاف دواء أو تعديل جرعته من الطبيب أثناء انتظار الصرف → ينعكس في قائمة الصيدلية فوراً (لا صرف لأمر مُلغى/معدَّل قديم).
6. مستخدم بدور `WAREHOUSE` يحاول `POST /pharmacy/dispense` → 403.

---

# الفيز 11 — Advanced Warehouse (المخزن المتقدم)

**الهدف:** إدارة كاملة متعددة المواقع مع Batch/Expiry والتنبؤ بالاستهلاك.

**يشمل:**
- مواقع مخزون متعددة: `MAIN_WAREHOUSE/PHARMACY/LABORATORY_STOCK/WARD_STOCK`.
- `TRANSFER REQUESTED→APPROVED→ISSUED→RECEIVED`.
- `InventoryBatch` (Batch/Expiry Date/Qty) لكل مادة ذات صلاحية.
- تنبيهات: `Low Stock/Critical Stock/Expiring Soon/Expired/Days of Stock Remaining` (بناءً على متوسط الاستهلاك اليومي).
- استهلاك المريض الشهري (`Patient Consumption Report` بيانات) وتكلفة الجلسة (`Session Cost = Consumables + Medication + Lab Consumables`).

**لا يشمل:** التقارير النهائية المعروضة (فيز 14 — هنا فقط البيانات والحسابات الأساسية).

**المخرجات:** رؤية دقيقة ومتعددة المواقع للمخزون مع تنبيهات استباقية.

**معيار القبول (اختبار الفيز):**
1. تحويل مادة من `MAIN_WAREHOUSE` إلى `PHARMACY` عبر التسلسل الكامل `REQUESTED→APPROVED→ISSUED→RECEIVED` → الرصيد يتحرك بشكل صحيح بين الموقعين (لا ازدواجية ولا فقدان كمية).
2. مادة تقترب من `Minimum Stock` → تظهر في تنبيهات `Low Stock`.
3. Batch منتهي الصلاحية → يظهر في `Expired`، وBatch قريب الانتهاء (ضمن نافذة محددة) يظهر في `Expiring Soon`.
4. حساب "Days of Stock Remaining" لمادة معينة يطابق المعادلة (Available ÷ Average Daily Consumption) بشكل صحيح رياضياً.
5. استخراج استهلاك مريض محدد لشهر كامل (Dialyzers/Blood Lines/Needles/Medication) يطابق مجموع الحركات الفعلية المرتبطة بجلساته.
6. حساب تكلفة جلسة واحدة = مجموع تكاليف المواد + الأدوية + مستهلكات المختبر المرتبطة بها فعلياً.

---

# الفيز 12 — Maintenance (الصيانة)

**الهدف:** دورة كاملة لأعطال الأجهزة من الإبلاغ حتى العودة للخدمة.

**يشمل:**
- `REPORT FAULT` (مشكلة/وقت/Severity/المُبلغ/صورة اختيارية عبر MinIO) → الجهاز `OUT_OF_SERVICE` ويخرج فوراً من Scheduler.
- `MaintenanceTicket`: `OPEN→ASSIGNED→IN_PROGRESS→WAITING_PART→COMPLETED→CLOSED`.
- `Machine Timeline` الكامل (صيانة/عودة للخدمة/عطل/إصلاح/استخدام/تعفير) لكل جهاز.
- تقارير Downtime وتكرار الأعطال (بيانات أساسية، العرض الكامل في فيز 14).

**لا يشمل:** واجهة تقارير الإدارة النهائية.

**المخرجات:** كل عطل جهاز موثّق من لحظة الإبلاغ حتى الإغلاق.

**معيار القبول (اختبار الفيز):**
1. `REPORT FAULT` على جهاز `IN_USE`/`AVAILABLE` → الجهاز ينتقل فوراً لـ`OUT_OF_SERVICE` ويختفي من خيارات التوزيع التلقائي (فيز 5).
2. `MaintenanceTicket` يتنقل بالتسلسل الصحيح `OPEN→ASSIGNED→IN_PROGRESS→WAITING_PART→COMPLETED→CLOSED` بدون تخطي مراحل.
3. بعد `CLOSED`، الجهاز يعود لحالة `AVAILABLE` (أو `CLEANING` إن لزم) ويصبح قابلاً للتخصيص من جديد.
4. `Machine Timeline` لجهاز معين يعرض كل أحداثه بالترتيب الزمني الصحيح (استخدام، تعفير، عطل، صيانة، عودة خدمة) مطابقاً لمثال المستند.
5. رفع صورة اختيارية مع بلاغ عطل → تُحفظ وتُسترجع بنجاح عبر MinIO.
6. حساب Downtime لجهاز معين لفترة محددة يطابق الفرق الزمني الفعلي بين `OUT_OF_SERVICE` و`AVAILABLE` مجدداً.

---

# الفيز 13 — Management Dashboard (لوحة الإدارة الحية)

**الهدف:** شاشة LIVE CENTER تعكس الحالة الحقيقية للمركز لحظياً — تُبنى الآن لأن البيانات الحقيقية أصبحت متوفرة من الفيزات السابقة.

**يشمل:**
- Live Center: `Scheduled/Arrived/In Dialysis/Waiting/Completed/Late/Absent/Emergency` للوجبة الحالية.
- Live Machines: `Available/In Use/Cleaning/Maintenance/Emergency` + خريطة الردهات.
- Ward Dashboard تفصيلي (Card لكل جهاز بالحالة الحية).
- Dashboard الإدارة: كل المؤشرات المذكورة في المستند (Utilization, Low/Critical Stock, Lab/Pharmacy Pending, Session Cost...).
- WebSocket/Socket.IO لتحديث حي بدل Polling.

**لا يشمل:** التقارير التفصيلية القابلة للتصدير (فيز 14).

**المخرجات:** أول شاشة يفتحها المدير تعكس واقع المركز الآن.

**معيار القبول (اختبار الفيز):**
1. بدء جلسة ديلزة جديدة (فيز 6) → عداد "In Dialysis" في Live Center يزداد خلال ثوانٍ بدون Refresh يدوي (عبر WebSocket).
2. تغيير حالة جهاز إلى `MAINTENANCE` → يظهر فوراً في Live Machines وWard Dashboard.
3. الأرقام المعروضة (Scheduled/Arrived/Completed...) تطابق تماماً الاستعلام المباشر من قاعدة البيانات لنفس اللحظة (لا تأخير كاش قديم غير مبرر).
4. مؤشر Low/Critical Stock يعكس فعلياً بيانات المخزون من الفيز 11.
5. فتح Dashboard من مستخدم بصلاحية محدودة (مثلاً Reception) يعرض فقط المؤشرات المسموحة له، لا كل شيء.

---

# الفيز 14 — Reports (التقارير)

**الهدف:** كل التقارير التشغيلية والطبية بعد استقرار البيانات من الفيزات السابقة.

**يشمل:**
- Patient Reports (ملخص طبي، تاريخ جلسات، تاريخ أدوية، تاريخ مختبر، تاريخ غياب، جلسات طوارئ، استهلاك).
- Dialysis Reports (يومي/أسبوعي/شهري، حسب ردهة/وجبة/جهاز).
- Machine Reports (Utilization, Downtime, Maintenance, Failure Frequency).
- Inventory/Pharmacy/Laboratory Reports كما في المستند قسم 65.
- تصدير (PDF/Excel) لكل تقرير.

**لا يشمل:** أي بيانات جديدة — هذا الفيز استهلاكي فقط لبيانات الفيزات 1-13.

**المخرجات:** تقارير قابلة للطباعة/التصدير لكل الأقسام.

**معيار القبول (اختبار الفيز):**
1. تقرير "Session History" لمريض محدد لفترة زمنية يطابق تماماً عدد وتفاصيل الجلسات المسجّلة فعلياً له.
2. تقرير "Daily Sessions by Ward" ليوم معين يطابق ما هو موجود فعلياً في قاعدة البيانات لذلك اليوم.
3. تصدير أي تقرير كـPDF/Excel ينجح ويحتوي البيانات الصحيحة (لا فراغ ولا قيم خاطئة).
4. تقرير "Drug Consumption" لشهر معين يطابق مجموع حركات الصرف الفعلية من فيز 10.
5. صلاحيات التقارير محترمة: مستخدم Pharmacy لا يرى تقارير Lab التفصيلية إن لم تُمنح له الصلاحية.

---

# الفيز 15 — Quality & Safety (الجودة والسلامة)

**الهدف:** طبقة مراقبة جودة وسلامة فوق النظام التشغيلي الكامل.

**يشمل:**
- `Incident Reporting` (Adverse Events, Infection Events, Vascular Access Events, Hospital Transfer, Emergency Events, Repeated Hypotension, Machine-related Incident).
- Quality Indicators قابلة للتوسعة لاحقاً.
- Clinical Audit مبني فوق `AuditLog` و`PatientTimelineEvent` الموجودين أصلاً.
- **قاعدة إلزامية**: أي Clinical Rule/Alert تلقائي جديد يُقترح هنا يجب اعتماده رسمياً من المدير الطبي للمركز قبل التفعيل.

**لا يشمل:** أي قرار علاجي آلي — النظام يوثّق فقط.

**المخرجات:** تتبع منهجي لحوادث الجودة والسلامة مرتبط بملف المريض.

**معيار القبول (اختبار الفيز):**
1. تسجيل حادثة (مثلاً Repeated Hypotension) مرتبطة بجلسة/مريض معيّن → تظهر في تقرير الجودة وفي Timeline المريض.
2. تصنيف الحادثة (نوع/شدة) قابل للفرز والتصفية في تقرير الحوادث.
3. لا يوجد أي مسار في الكود يتخذ قراراً علاجياً تلقائياً بناءً على حادثة مسجَّلة (توثيق فقط، تحقق يدوي بمراجعة الكود).
4. مستخدم غير مخوَّل لا يستطيع حذف حادثة مسجَّلة (Append-or-Amend فقط، مطابقة للقاعدة الذهبية).

---

# Definition of Done — المشروع ككل

لا يُعتبر النظام "Core System" ناجحاً إلا إذا عمل هذا السيناريو الكامل بدون أي ورقة خارجية أساسية، من أول فيز حتى آخر فيز مبني:

```text
إنشاء المريض (فيز 1)
→ خطة الغسيل والأيام والوجبات (فيز 2)
→ Barcode → Check-In (فيز 3)
→ Pre Dialysis → تجهيز المواد → خصم المخزون (فيز 4)
→ تخصيص الجهاز (فيز 5)
→ بدء الجلسة → القراءات → Doctor Orders → الأدوية → Lab Order (فيز 6/8/9/10)
→ إنهاء الجلسة → Post Weight → Discharge (فيز 6)
→ تعفير الجهاز (فيز 6)
→ Patient Timeline الكامل يعكس كل خطوة أعلاه بالترتيب الصحيح
→ Management Report يعكس نفس الأرقام (فيز 13/14)
```

**اختبار القبول النهائي:** تنفيذ هذا السيناريو لمريض واحد فعلياً (يدوياً أو Script)، ثم التحقق من: (1) `GET /patients/:id/timeline` يعرض كل الأحداث بالتسلسل الزمني الصحيح، (2) `AuditLog` يحتوي كل من قام بكل إجراء، (3) Live Dashboard وTقارير الإدارة تعكس نفس البيانات دون تناقض.
