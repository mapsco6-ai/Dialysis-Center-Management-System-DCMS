# مواصفات تفصيلية للموديولات (Data & Requirements Spec)

> يُقرأ هذا الملف مع `docs/PROJECT-PHASES-PLAN.md`. ذاك الملف يحدد **ماذا نبني في كل فيز ومتى نعتبره ناجحاً (اختبار القبول)**، وهذا الملف يحدد **البيانات الدقيقة لكل كيان**: الحقول، الحالات، قواعد العمل (Validations)، العلاقات، ومن يملك صلاحية التعامل معه. الترتيب مطابق تماماً لترقيم الفيزات (0 → 15).
>
> ملاحظة عامة تسري على كل الكيانات ما لم يُذكر خلاف ذلك:
> - كل كيان يحمل `id` (UUID)، `createdAt`, `updatedAt`.
> - **لا حذف فعلي (Hard Delete)** للسجلات ذات الطابع الطبي/التدقيقي — فقط `Amend/Cancel/Correct` مع الاحتفاظ بالتاريخ (القاعدة الذهبية، قسم 72 من المستند الأصلي).
> - أي عملية إنشاء/تعديل على كيان طبي أو تشغيلي حساس تُنشئ تلقائياً سطر `AuditLog` + غالباً `PatientTimelineEvent` إذا كان الكيان مرتبطاً بمريض.

---

# الفيز 0 — Foundation

## User

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| username | string | نعم | فريد، يُستخدم لتسجيل الدخول |
| passwordHash | string | نعم | Argon2/bcrypt، لا يُخزَّن نص صريح أبداً |
| fullName | string | نعم | |
| pin | string (hashed) | لا | PIN سريع للأجهزة المشتركة (قسم 30) |
| isActive | boolean | نعم | تعطيل حساب دون حذفه |
| lastLoginAt | datetime | لا | |

**Validations:** `username` فريد؛ كلمة المرور بحد أدنى للتعقيد يحدده الإعداد؛ لا يمكن حذف مستخدم له سجل Audit — فقط `isActive=false`.

**العلاقات:** User ↔ Role (many-to-many عبر UserRole، لأن مستخدم قد يحمل أكثر من دور مثل HEAD_NURSE + NURSE)؛ User مرجعي من كل الكيانات التي تحتاج `performedBy/actorId`.

## Role / Permission / RolePermission

| الكيان | الحقول الأساسية |
|---|---|
| Role | `name` (فريد، من القائمة الـ12: SUPER_ADMIN...ACCOUNTANT)، `description` |
| Permission | `key` (فريد، dot-notation مثل `patient.view`)، `description`، `module` (تجميع للعرض) |
| RolePermission | `roleId`, `permissionId` (Composite Unique) |

**Validations:** لا صلاحية مكررة لنفس الدور؛ تعديل صلاحيات دور يُبطل الحاجة لإعادة توليد JWT فوراً (أو يُتحقق من الصلاحيات من DB في كل طلب بدل الاعتماد الكامل على التوكن).

**من يملك الصلاحية:** إدارة الأدوار/الصلاحيات محصورة بـ`SUPER_ADMIN` فقط (`role.manage`, `permission.manage`).

## AuditLog

| الحقل | النوع | الوصف |
|---|---|---|
| actorId | UUID (FK User) | من نفّذ العملية |
| actorRole | string | الدور وقت التنفيذ (Snapshot، لا يتغيّر لاحقاً حتى لو تغيّر دور المستخدم) |
| action | string | مثل `PATIENT_UPDATED`, `USER_CREATED` |
| entityType | string | اسم الكيان |
| entityId | UUID | معرّف السجل المتأثر |
| oldValue | JSON | القيمة قبل التغيير |
| newValue | JSON | القيمة بعد التغيير |
| reason | string | إلزامي في العمليات الحساسة (تعديل جرعة، Amend نتيجة...) |
| device | string | معرّف الجهاز/المحطة |
| ipAddress | string | |

**Validations:** غير قابل للتعديل أو الحذف من أي واجهة (Append-only حقيقي 100%).
**من يملك الصلاحية:** القراءة فقط، ومحصورة بـ`audit.view` (عادة SUPER_ADMIN/CENTER_DIRECTOR).

---

# الفيز 1 — Patient Registry

## Patient

| الحقل | النوع | إلزامي | الوصف |
|---|---|---|---|
| patientCode | string | نعم | فريد، مولّد آلياً (مثال `P-000352`) |
| barcode | string | نعم | فريد، لا يحتوي معلومة طبية (مثال `P-A7KD92`) |
| fullName | string | نعم | |
| gender | enum(MALE, FEMALE) | نعم | |
| dateOfBirth | date | نعم | |
| phone | string | لا | |
| address | string | لا | |
| fileNumber | string | لا | رقم الإضبارة الورقية القديمة إن وُجدت |
| registeredAt | datetime | نعم | تاريخ التسجيل |
| status | enum(ACTIVE, INACTIVE, DECEASED, TRANSFERRED) | نعم | |
| dialysisStartDate | date | لا | |
| dryWeight | decimal | لا | يُعدَّل لاحقاً فقط عبر Doctor Order (فيز 8) — في الفيز 1 قيمة أولية فقط |
| vascularAccessType | enum(FISTULA, CATHETER, GRAFT) | لا | |
| vascularAccessLocation | string | لا | |
| diagnoses | text/JSON | لا | |
| chronicDiseases | JSON | لا | مثل Diabetes, Hypertension كأعلام Boolean أو قائمة |
| allergies | text | لا | |
| medicalNotes | text | لا | |
| specialInstructions | text | لا | |

**Validations:** `patientCode` و`barcode` فريدان دائماً (Unique Index على مستوى DB وليس فقط تطبيقياً)؛ لا حذف فعلي لمريض له أي جلسة/تحليل/وصفة — فقط `status=INACTIVE/DECEASED/TRANSFERRED`؛ تعديل أي حقل طبي حساس (Dry Weight، Vascular Access) يُنشئ AuditLog إلزامياً بسبب.

**العلاقات:** Patient هو الأصل (Parent) لكل الكيانات القادمة: ClinicalAlert, PatientTimelineEvent, DialysisPlan, DialysisSession, LabOrder, Prescription, PatientSupplyProfile... (علاقة one-to-many من Patient إلى كل واحد منها).

**من يملك الصلاحية:** `patient.view` (شبه الجميع بمستوى مختلف)، `patient.create`, `patient.edit` (استقبال/إدارة/طبيب حسب الحقل)، `patient.alert.manage`.

## ClinicalAlert

| الحقل | النوع | الوصف |
|---|---|---|
| patientId | FK Patient | |
| severity | enum(CRITICAL, IMPORTANT, INFORMATION) | |
| category | string | مثال: Drug Allergy, Vascular Access Warning, High Risk |
| message | text | |
| createdBy | FK User | |
| resolvedAt | datetime | لا يُحذف التنبيه، فقط يُعلَّم كمنتهي/محلول |

**Validations:** لا حذف — فقط `resolvedAt` أو إنشاء تنبيه جديد يُلغي منطقياً القديم مع إبقائه في السجل.
**من يملك الصلاحية:** إنشاء بواسطة `DOCTOR`/`HEAD_NURSE` غالباً؛ العرض لكل من `patient.view` + دخول لملف المريض.

## PatientTimelineEvent

| الحقل | النوع | الوصف |
|---|---|---|
| patientId | FK Patient | |
| type | string | مثال: `CHECKED_IN`, `DIALYSIS_STARTED`, `MEDICATION_ADMINISTERED` |
| payload | JSON | تفاصيل الحدث (مرن حسب النوع) |
| performedBy | FK User | |
| performedAt | datetime | |
| sourceModule | string | أي موديول أنشأ الحدث (reception, dialysis, pharmacy...) |

**Validations:** Append-only بالكامل، لا تعديل ولا حذف تحت أي ظرف.
**العلاقات:** كل موديول لاحق (فيز 2 فما فوق) **يجب** أن يكتب هنا عند أي حدث مهم يخص مريضاً — هذا هو "العمود الفقري" المذكور في فلسفة المشروع.
**من يملك الصلاحية:** الكتابة تلقائية من الباك اند (لا واجهة يدوية لإنشائها)؛ القراءة عبر `patient.view`.

---

# الفيز 2 — Scheduling

## Shift

| الحقل | النوع | الوصف |
|---|---|---|
| name | enum(SHIFT_1, SHIFT_2, SHIFT_3, SHIFT_4) | |
| dialysisStart / dialysisEnd | time | 06:00-10:00 ... |
| cleaningStart / cleaningEnd | time | |

**Validations:** بيانات ثابتة (Seed) وليست قابلة للتعديل اليومي من المستخدم العادي — تعديلها من `SUPER_ADMIN`/`CENTER_DIRECTOR` فقط.

## DialysisPlan

| الحقل | النوع | الوصف |
|---|---|---|
| patientId | FK Patient | |
| weekday | enum(SUN...SAT) | |
| shiftId | FK Shift | |
| isActive | boolean | يسمح بإيقاف يوم دون حذف الخطة كاملة |
| effectiveFrom / effectiveTo | date | لدعم تغيير الخطة مستقبلاً دون فقدان القديمة |

**Validations:** لا يوجد يومان بنفس `weekday` لنفس المريض ضمن نفس الفترة الفعّالة (تعارض)؛ عدد الأيام النشطة لكل مريض بين 1 و4 (مطابقة لسياسة المركز).

## DialysisSchedule

| الحقل | النوع | الوصف |
|---|---|---|
| patientId, planId | FK | |
| scheduledDate | date | |
| shiftId | FK Shift | |
| status | enum(SCHEDULED, ARRIVED, LATE, ABSENT, CANCELLED, EXTRA, EMERGENCY) | يتطور عبر الفيز 3/6 |
| type | enum(REGULAR, EXTRA, EMERGENCY) | |
| extraReason / requestedByDoctorId | لحالة EXTRA فقط | |
| emergencySourceHospital / emergencyReason | لحالة EMERGENCY فقط | |

**Validations:** يُولَّد تلقائياً يومياً من `DialysisPlan` النشطة (Job مجدول)؛ لا يُحذف السجل حتى لو لم يحضر المريض (الحالة تتحول `ABSENT` وليس Delete).
**العلاقات:** DialysisSchedule هو الأصل الذي تتفرع منه لاحقاً `DialysisSession` الفعلية (فيز 6).
**من يملك الصلاحية:** `scheduling.manage` (استقبال/إدارة)، الإضافة الطارئة `dialysis.emergency.create` مقيّدة أكثر.

---

# الفيز 3 — Reception

لا كيانات جديدة — إضافة حقول على `DialysisSchedule`:

| الحقل | النوع | الوصف |
|---|---|---|
| checkInTime | datetime | وقت الوصول الفعلي |
| checkInByUserId | FK User | |
| checkInStationId | string | محطة الاستقبال |
| lateThresholdMinutes | int (من الإعدادات) | يحدده المركز |
| lateMinutes | int (محسوب) | `checkInTime - scheduledTime` |
| absentMarkedAt | datetime | يُملأ تلقائياً عند انتهاء نافذة الحضور بدون Check-In |

**Validations:** `checkInTime` لا يمكن إدخاله مرتين لنفس السجل (Idempotent)؛ الانتقال لحالة `ABSENT` يتم فقط عبر Job مجدول (لا يدوياً) لضمان الاتساق.
**من يملك الصلاحية:** `attendance.checkin` (RECEPTION بشكل أساسي).

---

# الفيز 4 — Inventory Supplies

## InventoryItem

| الحقل | النوع | الوصف |
|---|---|---|
| name, category, unit | | |
| barcode | string فريد | |
| minimumStock | decimal | لحساب Low/Critical Stock (فيز 11) |
| cost | decimal | لحساب تكلفة الجلسة |
| requiresBatchTracking | boolean | يفعّل InventoryBatch (فيز 11) |

## StockLocation / StockBalance / StockMovement

| الكيان | الحقول الأساسية |
|---|---|
| StockLocation | `type` (MAIN_WAREHOUSE, PHARMACY, LABORATORY_STOCK, WARD_STOCK) |
| StockBalance | `itemId, locationId, quantity` (Composite Unique itemId+locationId) |
| StockMovement | `itemId, fromLocationId?, toLocationId?, quantity, reason, relatedSessionId?, performedBy, movementType (ISSUE/TRANSFER/ADJUSTMENT)` |

**Validations:** `StockBalance.quantity` لا يجوز أن يصبح سالباً (يُرفض الصرف قبل الوصول لسالب)؛ كل `StockMovement` يعكس فوراً تحديث `StockBalance` ضمن Transaction واحدة (اتساق DB).

## PatientSupplyProfile / SessionSupplyOverride

| الكيان | الحقول الأساسية |
|---|---|
| PatientSupplyProfile | `patientId, itemId, defaultQuantity` |
| SessionSupplyOverride | `sessionId (أو scheduleId), itemId, overrideQuantity, reason` |

**Validations:** عند "Confirm Issue" (قسم 18)، الأولوية لـ Override إن وُجد وإلا القيمة الافتراضية من Profile؛ حالة "مادة غير متوفرة" تُنشئ سجل حدث منفصل (`SupplyShortageEvent` أو حقل `status=UNAVAILABLE` على بند الصرف) ولا يتم استبدال صامت.
**من يملك الصلاحية:** `inventory.issue` (WAREHOUSE بشكل أساسي، أو النقطة المسؤولة عن التجهيز).

---

# الفيز 5 — Machines

## Machine

| الحقل | النوع | الوصف |
|---|---|---|
| machineCode | string فريد | |
| wardId | FK Ward | |
| serialNumber, manufacturer, model | | |
| status | enum(AVAILABLE, IN_USE, RESERVED, EMERGENCY_RESERVED, APPROVAL_REQUIRED, WAITING_CLEANING, CLEANING, MAINTENANCE, OUT_OF_SERVICE) | |
| isEmergencyDedicated | boolean | جهاز مخصص للطوارئ دائماً |
| isProtected | boolean | يتطلب Approval قبل الاستخدام الاعتيادي |

**Validations:** لا يمكن حذف جهاز — فقط `status=OUT_OF_SERVICE`؛ الانتقال بين الحالات يجب أن يمر عبر خدمة واحدة مركزية (`MachineStatusService`) وليس تحديثاً مباشراً من أي موديول لضمان اتساق قسم 98 (Business Logic في الباك اند فقط).

## MachineStatusHistory

| الحقل | الوصف |
|---|---|
| machineId, fromStatus, toStatus, changedBy, reason, changedAt | سجل كل انتقال حالة — يبني `Machine Timeline` |

## Approval (MachineUsageApprovalRequest)

| الحقل | النوع | الوصف |
|---|---|---|
| patientId, machineId, shiftId | FK | |
| reason | text | |
| requestedBy | FK User | |
| decision | enum(PENDING, APPROVED, REJECTED) | |
| decidedBy, decidedAt | | |

**Validations:** لا يمكن تخصيص جهاز `isProtected=true` لمريض دون سجل `Approval` بحالة `APPROVED` مسبقاً؛ طلب مكرر لنفس المريض/الجهاز/الوجبة يُحدَّث بدل تكراره.
**من يملك الصلاحية:** الطلب من أي مخوَّل بالتوزيع؛ القرار (`approval.machine.decide`) محصور بأدوار إدارية/طبية أعلى.

---

# الفيز 6 — Dialysis Session

## DialysisSession

| الحقل | النوع | الوصف |
|---|---|---|
| scheduleId | FK DialysisSchedule | |
| patientId, machineId, wardId, nurseId | FK | |
| status | enum(SCHEDULED, ARRIVED, PRE_DIALYSIS, SUPPLIES_READY, WAITING_MACHINE, ASSIGNED, IN_DIALYSIS, POST_DIALYSIS, COMPLETED, DISCHARGED, ABSENT, LATE, CANCELLED, EMERGENCY, EXTRA, INTERRUPTED) | State Machine الرئيسية |
| preWeight, postWeight, dryWeight | decimal | |
| prescribedDurationMinutes, actualDurationMinutes | int | |
| requiredUF, actualUF | decimal | |
| dialyzerType, bloodLineType | string | |
| startTime, endTime | datetime | |
| accessInfo | string/JSON | |
| complications, finalNote | text | |

**Validations:** الانتقال بين الحالات يتم فقط عبر دالة `transition()` مركزية تتحقق من الترتيب المسموح (لا تخطي مراحل)؛ `START DIALYSIS` يتطلب كل الحقول الإلزامية معاً (Machine, Nurse, Pre Weight, BP, Pulse, Dialyzer, Prescribed Duration, Required UF) أو يُرفض بالكامل.

## DialysisReading

| الحقل | النوع | الوصف |
|---|---|---|
| sessionId | FK | |
| time | datetime | |
| bp, pulse, arterialPressure, venousPressure, tmp, bloodFlow, uf | decimal | |
| enteredBy | FK User | |
| amendedFromId | FK self (nullable) | يشير للقراءة الأصلية عند التعديل |

**Validations:** لا `UPDATE` مباشر على قراءة موجودة — التعديل ينشئ سجلاً جديداً بـ`amendedFromId` + AuditLog بالسبب (Append-or-Amend).

## DialysisEvent

| الحقل | النوع | الوصف |
|---|---|---|
| sessionId | FK | |
| type | enum(NORMAL, HYPOTENSION, ACCESS_ISSUE, MACHINE_ISSUE, MEDICATION_GIVEN, PHYSICIAN_CALLED, SESSION_INTERRUPTED, OTHER) | قابلة للضبط من الإدارة (جدول Configurable منفصل إن أُريد توسعتها لاحقاً) |
| note | text | |
| recordedBy | FK User | |

**العلاقات:** عند `REASSIGN MACHINE` (عطل أثناء الجلسة): يُحدَّث `machineId` على `DialysisSession` نفسه + يُنشأ `DialysisEvent(type=MACHINE_ISSUE)` + `MachineStatusHistory` للجهازين (القديم والجديد) — لا تُنشأ جلسة جديدة، لضمان استمرارية القراءات والأحداث.
**من يملك الصلاحية:** `dialysis.start`, `dialysis.end`, `dialysis.reading.create` (تمريض/طبي فقط).

---

# الفيز 7 — Nursing

## NursingAssignment

| الحقل | النوع | الوصف |
|---|---|---|
| wardId, shiftId, date | | |
| nurseId | FK User | |
| patientIds | JSON/array أو جدول ربط منفصل | المرضى المخصصون لهذا الممرض في هذه الوجبة |

**Validations:** لا تعارض (نفس المريض لممرضين اثنين بنفس الوجبة إلا إذا سياسة المركز تسمح بذلك صراحة).
**من يملك الصلاحية:** `nursing.assign` (HEAD_NURSE).

---

# الفيز 8 — Doctor

## DoctorOrder

| الحقل | النوع | الوصف |
|---|---|---|
| patientId, doctorId | FK | |
| type | enum(MEDICATION, LAB_REQUEST, NURSING_INSTRUCTION, DRY_WEIGHT_CHANGE, EXTRA_SESSION_REQUEST, PHARMACY_RECOMMENDATION) | |
| payload | JSON | تفاصيل حسب النوع |
| status | enum(ACTIVE, MODIFIED, STOPPED) | |
| previousOrderId | FK self (nullable) | لسلسلة التعديلات |
| reason | text | إلزامي عند STOPPED/MODIFIED |

## Prescription

| الحقل | النوع | الوصف |
|---|---|---|
| patientId, doctorId | FK | |
| medicationName, dose, frequency, duration | | |
| linkedSessionId | FK (nullable) | |
| status | enum(ACTIVE, DISPENSING, DISPENSED, MODIFIED, STOPPED) | |

## MedicationAdministration

| الحقل | النوع | الوصف |
|---|---|---|
| prescriptionId | FK | |
| administeredBy | FK User | |
| administeredAt | datetime | |
| doseGiven | decimal | |
| sessionId | FK (nullable) | |

**Validations الجوهرية (قاعدة Prescription ≠ Administration):** لا حقل واحد "isGiven boolean" — يجب وجود سجل `MedicationAdministration` منفصل تماماً عن `Prescription`، بحيث نعرف دوماً الفرق بين "ما طلبه الطبيب" و"ما استلمه المريض فعلياً"؛ تعديل جرعة لا يمسح القديم — `previousOrderId`/سجل تعديل منفصل يحتفظ بـOld/New/Reason/ChangedBy/Time.

## ClinicalNote

| الحقل | الوصف |
|---|---|
| patientId, authorId, sessionId?, text, createdAt | ملاحظة طبية حرة مرتبطة بالمريض/الجلسة |

**من يملك الصلاحية:** `prescription.create/modify` (DOCTOR فقط)، `medication.administer` (NURSE/DOCTOR حسب سياسة).

---

# الفيز 9 — Laboratory

## LabTest / LabPanel

| الكيان | الحقول |
|---|---|
| LabTest | `code, name, unit, referenceRangeLow, referenceRangeHigh` |
| LabPanel | `name` (مثل "Monthly Dialysis Panel")، علاقة many-to-many مع LabTest |

## LabOrder / LabOrderItem

| الحقل | النوع | الوصف |
|---|---|---|
| LabOrder: patientId, orderedByDoctorId, orderedAt, episodeCode | | يجمّع كل نتائج نفس الطلب/التاريخ |
| LabOrderItem: labOrderId, labTestId, status (ORDERED, SAMPLE_COLLECTED, PROCESSING, RESULT_ENTERED, FINAL, AMENDED, CANCELLED) | | |

## LabResult

| الحقل | النوع | الوصف |
|---|---|---|
| labOrderItemId | FK | |
| value | decimal/string | |
| enteredBy | FK User | |
| isFinal | boolean | |
| amendedFromId | FK self (nullable) | |
| amendReason | text | إلزامي عند Amend |

**Validations:** لا اعتماد ثانٍ حالياً — من يُدخل النتيجة يجعلها Final مباشرة؛ تعديل نتيجة Final **لا يستبدلها** — ينشئ `AMENDED` جديدة مرتبطة بالقديمة عبر `amendedFromId` مع الاحتفاظ بالقديمة كاملة.
**من يملك الصلاحية:** `lab.request` (DOCTOR)، `lab.result.create` (LAB_TECHNICIAN فقط).

---

# الفيز 10 — Pharmacy

يعيد استخدام `StockLocation(type=PHARMACY)` و`StockBalance`/`StockMovement` من الفيز 4 — لا تكرار للنموذج.

## PrescriptionDispense

| الحقل | النوع | الوصف |
|---|---|---|
| prescriptionId | FK | |
| dispensedBy | FK User (PHARMACIST) | |
| quantity | decimal | |
| linkedSessionId | FK (nullable) | |
| dispensedAt | datetime | |

**Validations:** الصرف يخصم من `StockBalance(locationId=PHARMACY)` ضمن نفس Transaction؛ يُمنع الصرف إذا كانت `Prescription.status` = `STOPPED`/`MODIFIED` بدون مطابقة الأمر الحالي (لا صرف لأمر قديم مُلغى).
**من يملك الصلاحية:** `pharmacy.dispense` (PHARMACIST فقط).

---

# الفيز 11 — Advanced Warehouse

## InventoryBatch

| الحقل | النوع | الوصف |
|---|---|---|
| itemId | FK | |
| batchNumber | string | |
| quantity | decimal | |
| expiryDate | date | |
| locationId | FK StockLocation | |

## StockTransfer

| الحقل | النوع | الوصف |
|---|---|---|
| itemId, fromLocationId, toLocationId, quantity | | |
| status | enum(REQUESTED, APPROVED, ISSUED, RECEIVED) | |
| requestedBy, approvedBy, issuedBy, receivedBy | FK User (لكل مرحلة) | |

**Validations:** الكمية تُخصم من `fromLocation` عند `ISSUED` وتُضاف لـ`toLocation` عند `RECEIVED` فقط (وليس عند `APPROVED`) لضمان تطابق المخزون الفعلي مع الحركة الحقيقية؛ Batch منتهي الصلاحية لا يُقترح تلقائياً للصرف (FEFO — First-Expiry-First-Out كقاعدة توزيع افتراضية).
**من يملك الصلاحية:** `inventory.transfer.request/approve/issue/receive` موزّعة حسب الدور (WAREHOUSE للطلب/الإصدار، إدارة للموافقة).

---

# الفيز 12 — Maintenance

## MaintenanceTicket

| الحقل | النوع | الوصف |
|---|---|---|
| machineId | FK | |
| reportedBy | FK User | |
| problem, severity | | |
| attachmentUrl | string (MinIO) | صورة اختيارية |
| status | enum(OPEN, ASSIGNED, IN_PROGRESS, WAITING_PART, COMPLETED, CLOSED) | |
| assignedTo | FK User (nullable) | |

**Validations:** إنشاء التذكرة (`REPORT FAULT`) ينقل `Machine.status → OUT_OF_SERVICE` تلقائياً ضمن نفس Transaction (لا يُترك يدوياً)؛ `CLOSED` هو الوحيد المسموح أن يعيد الجهاز لـ`AVAILABLE`/`CLEANING`.
**من يملك الصلاحية:** `machine.fault.report` (أي موظف تشغيلي)، `maintenance.manage` (MAINTENANCE role).

---

# الفيز 13/14 — Management Dashboard & Reports

لا كيانات جديدة — هذا الفيز استهلاكي بالكامل. يحتاج فقط:
- **Views/Queries مجمّعة (Aggregations)** فوق الكيانات الموجودة (مثال: `COUNT(DialysisSession) WHERE status=IN_DIALYSIS AND shift=current`).
- طبقة WebSocket تبث أحداث `PatientTimelineEvent`/`MachineStatusHistory` الجديدة للوحة الحية دون تخزين مكرر للبيانات.
- تصدير PDF/Excel هو طبقة عرض فقط فوق نفس الاستعلامات.

---

# الفيز 15 — Quality & Safety

## IncidentReport

| الحقل | النوع | الوصف |
|---|---|---|
| patientId (nullable), sessionId (nullable), machineId (nullable) | FK | |
| type | enum(ADVERSE_EVENT, INFECTION, VASCULAR_ACCESS_EVENT, HOSPITAL_TRANSFER, EMERGENCY_EVENT, REPEATED_HYPOTENSION, MACHINE_INCIDENT) | |
| severity | enum | |
| description | text | |
| reportedBy | FK User | |
| status | enum(OPEN, UNDER_REVIEW, CLOSED) | |

**Validations:** Append-or-Amend فقط، لا حذف؛ أي قاعدة تصنيف تلقائي (مثلاً "3 حوادث Hypotension لنفس المريض خلال شهر → Alert") يجب اعتمادها من المدير الطبي قبل التفعيل الفعلي في الكود (قسم "المرجعية التنظيمية" بالمستند الأصلي).
**من يملك الصلاحية:** الإنشاء متاح لأي كادر طبي/تمريضي، المراجعة/الإغلاق لـ`MEDICAL_DIRECTOR`.

---

# خاتمة — خريطة علاقات Patient الشاملة (مرجع سريع)

```text
Patient (1) ──< ClinicalAlert
Patient (1) ──< PatientTimelineEvent
Patient (1) ──< DialysisPlan ──< DialysisSchedule ──< DialysisSession ──< DialysisReading
                                                                    └──< DialysisEvent
Patient (1) ──< PatientSupplyProfile
DialysisSession (1) ──< SessionSupplyOverride / StockMovement (عبر relatedSessionId)
Patient (1) ──< DoctorOrder ──< Prescription ──< MedicationAdministration
                                            └──< PrescriptionDispense
Patient (1) ──< LabOrder ──< LabOrderItem ──< LabResult
Patient (1) ──< IncidentReport
Machine (1) ──< MachineStatusHistory
Machine (1) ──< MaintenanceTicket
Machine (1) ──< Approval (MachineUsageApprovalRequest) >── Patient
```

كل سهم `──<` يعني "علاقة واحد إلى متعدد"، وكل عملية إنشاء على الطرف "المتعدد" التي تخص مريضاً يجب أن تكتب أيضاً سطراً في `PatientTimelineEvent` — هذا هو الضامن العملي لمبدأ "المريض هو المحور" (قسم 6 من المستند الأصلي).
