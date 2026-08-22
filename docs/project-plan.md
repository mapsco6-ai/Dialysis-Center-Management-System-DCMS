# MASTER PLAN V1.0
## نظام إدارة مركز الديلزة المتكامل
### Dialysis Center Management System — DCMS

---

# 1. الهدف من المشروع

إنشاء منظومة إلكترونية مركزية متكاملة لإدارة مركز غسيل الكلى، تبدأ من لحظة تسجيل المريض وجدولة جلساته، مروراً بالاستقبال والتجهيز والغسيل والمتابعة الطبية والتمريضية والمختبر والصيدلية والمخزن، وتنتهي بخروج المريض وحفظ جميع الأحداث داخل ملف طبي إلكتروني واحد.

النظام لا يكون مجموعة برامج منفصلة، وإنما:

**منصة مركزية واحدة + قاعدة بيانات واحدة + صلاحيات وواجهات مختلفة حسب المستخدم.**

الأقسام الرئيسية:

1. الإدارة.
2. الاستقبال.
3. إدارة المرضى.
4. الجدولة.
5. جلسات الديلزة.
6. التمريض.
7. الأطباء.
8. المختبر.
9. الصيدلية.
10. المخزن.
11. الأجهزة والصيانة.
12. التقارير.
13. التنبيهات.
14. الصلاحيات.
15. سجل التدقيق Audit Trail.

---

# 2. معلومات المركز المعتمدة

## المرضى

عدد المرضى الحالي:

**حوالي 520 مريضاً وقابل للزيادة.**

عدد جلسات المريض الأسبوعية غير ثابت.

يمكن أن تكون:

- جلسة واحدة أسبوعياً.
- جلستان.
- 3 جلسات.
- 4 جلسات.

ولكل مريض جدول مستقل.

---

# 3. الردهات والأجهزة

المركز يحتوي على:

| الردهة | الأجهزة |
|---|---:|
| الردهة الأولى | 20 |
| الردهة الثانية | 20 |
| الردهة الثالثة | 19 |
| المجموع | 59 |

الـ59 هو العدد الكلي للأجهزة.

يوجد ضمن الأجهزة:

- جهاز مخصص للطوارئ.
- أجهزة احتياطية للطوارئ.
- مجموعة أجهزة مرنة يمكن استخدامها للحالات الاعتيادية ولكن حسب سياسة Approval.
- تجهيز لاستقبال إحالات طارئة من المستشفيات القريبة.

النظام يجب ألا يفترض أن جميع الأجهزة الـ59 متاحة للجدولة دائماً.

---

# 4. حالات جهاز الديلزة

كل جهاز داخل النظام يكون له Machine Record مستقل.

الحالات الأساسية:

```text
AVAILABLE
IN_USE
RESERVED
EMERGENCY_RESERVED
APPROVAL_REQUIRED
WAITING_CLEANING
CLEANING
MAINTENANCE
OUT_OF_SERVICE
```

مثال:

```text
Machine 27
Ward: 2
Status: IN_USE
Patient: P-000352
Started: 12:08
Expected End: 16:08
```

---

# 5. جدول عمل المركز

المركز يعمل 24 ساعة بأربع وجبات.

| الوجبة | وقت الديلزة | التعفير |
|---|---|---|
| الأولى | 06:00 – 10:00 | 10:00 – 12:00 |
| الثانية | 12:00 – 16:00 | 16:00 – 18:00 |
| الثالثة | 18:00 – 22:00 | 22:00 – 00:00 |
| الرابعة | 00:00 – 04:00 | 04:00 – 06:00 |

الطاقة النظرية القصوى:

**59 جهاز × 4 وجبات = 236 Machine Slots يومياً.**

لكن الطاقة الفعلية للجدولة تكون أقل بسبب:

- أجهزة الطوارئ.
- الأجهزة المحمية.
- الصيانة.
- الأعطال.
- إيقاف جهاز مؤقت.
- سياسة الاحتياط.

ولذلك يحسب النظام:

**Nominal Capacity**

و:

**Available Clinical Capacity**

بشكل منفصل.

---

# 6. الفلسفة الأساسية للنظام

المركز الكامل يدور حول كيان واحد:

# PATIENT

وليس حول الأقسام.

بمعنى:

```text
                    Laboratory
                        |
Warehouse → Patient → Dialysis → Nursing
              |             |
           Pharmacy       Doctor
              |
           Medication
```

كل إجراء يخص المريض يدخل في ملفه.

---

# 7. Patient 360 — الملف الطبي الإلكتروني

كل مريض يمتلك ملفاً إلكترونياً واحداً.

## 7.1 المعلومات الشخصية

- Patient ID.
- Barcode.
- الاسم.
- الجنس.
- تاريخ الميلاد / العمر.
- رقم الهاتف.
- العنوان.
- رقم الإضبارة.
- تاريخ التسجيل.
- حالة المريض Active / Inactive / Deceased / Transferred وغيرها حسب سياسة المركز.

## 7.2 المعلومات الصحية

- التشخيصات.
- الأمراض المزمنة.
- Diabetes.
- Hypertension.
- Allergies.
- Medication Warnings.
- Clinical Warnings.
- تاريخ بدء الديلزة.
- Dry Weight.
- Vascular Access Type.
- Fistula / Catheter / Graft.
- Access Location.
- Medical Notes.
- Special Instructions.

## 7.3 جدول المريض

مثلاً:

```text
Sunday     Shift 1
Wednesday  Shift 1
Friday     Shift 1
```

أو أي توليفة من 1–4 جلسات أسبوعياً.

## 7.4 ملف الجلسات

كل جلسة محفوظة بصورة مستقلة.

## 7.5 المختبر

كل مجموعة تحاليل بتاريخ واحد تحفظ كـ:

**Laboratory Episode / Lab Order**

مثلاً:

```text
Lab Episode — 21/08/2026

Hb
WBC
Creatinine
Urea
Na
K
...
```

## 7.6 الأدوية

يحتوي على:

- Current Medications.
- Previous Medications.
- Prescriptions.
- Dispensed Medication.
- Administered Medication.
- Medication Changes.
- Stop Medication.
- Dose Changes.

## 7.7 Timeline

أحد أهم أجزاء النظام.

مثال:

```text
06:01 Patient Checked In
06:05 Pre Weight Recorded
06:10 Supplies Issued
06:14 Assigned Machine 08
06:20 Dialysis Started
07:00 BP Recorded
07:25 Medication Administered
08:15 Doctor Note Added
09:59 Dialysis Completed
10:04 Post Weight Recorded
10:07 Patient Discharged
```

---

# 8. الباركود

كل مريض يحصل على Barcode / QR معرف خاص.

الباركود لا يحتوي معلومات طبية.

مثلاً:

```text
P-A7KD92
```

عند المسح يقوم النظام بالبحث عن Patient ID داخلياً.

يمكن استخدامه في:

- الاستقبال.
- الطبيب.
- المخزن.
- التمريض.
- المختبر عند الحاجة.

---

# 9. رحلة المريض الكاملة

هذه أهم Workflow في المشروع.

## المرحلة 1 — Scheduled

النظام يعرف مسبقاً:

- يوم المريض.
- الوجبة.
- الوقت.
- خطة الغسيل.

الحالة:

```text
SCHEDULED
```

---

# 10. وصول المريض

المريض يصل للاستقبال.

موظف الاستقبال يمسح الباركود.

النظام يظهر:

```text
Patient Name
Patient Photo
File Number

Today's Session:
06:00 AM
Shift 1

Attendance:
Expected
```

يتم:

**Check-In**

فتتحول الحالة إلى:

```text
ARRIVED
```

ويتم حفظ:

- وقت الوصول.
- المستخدم الذي سجل الوصول.
- محطة الاستقبال.

---

# 11. التأخير

إذا جاء المريض بعد وقت معين تحدده الإدارة:

```text
LATE
```

ويظهر:

```text
Scheduled: 06:00
Arrived: 06:37
Delay: 37 Minutes
```

ويضاف الحدث إلى Patient Timeline.

---

# 12. الغياب

إذا انتهت الفترة المحددة للحضور ولم يصل:

```text
ABSENT
```

النظام:

- يسجل الغياب.
- يضيفه إلى ملف المريض.
- يظهر Alert للإدارة.
- يضيفه إلى تقرير الغياب.

ولا يحذف موعد الجلسة.

---

# 13. الجلسات الإضافية

الجلسة الإضافية لا تعامل كجلسة اعتيادية.

يتم إنشاء:

```text
EXTRA_SESSION
```

مع:

- السبب.
- الطبيب الطالب.
- التاريخ.
- الوجبة.
- الجهاز.
- الملاحظات.

---

# 14. الجلسة الطارئة

الحالة:

```text
EMERGENCY_SESSION
```

وتتضمن:

- مصدر الإحالة.
- المستشفى المحيل إن وجد.
- سبب الطوارئ.
- الطبيب.
- وقت الوصول.
- وقت بداية الجلسة.
- الجهاز المستخدم.

---

# 15. Pre-Dialysis

بعد الاستقبال:

يتم تسجيل البيانات الأولية:

- Weight Start.
- BP.
- Pulse.
- Temperature إذا كانت ضمن بروتوكول المركز.
- Blood Glucose عند الحاجة.
- Dry Weight.
- Pre Dialysis Notes.

النظام يحسب عند الحاجة مؤشرات مساعدة لكنه **لا يتخذ قراراً علاجياً تلقائياً**.

القرار الطبي يبقى للطبيب والكادر المخول.

---

# 16. تجهيز المريض

التجهيز يتم من المخزن.

كل مريض قد تكون لديه تجهيزات مختلفة.

لذلك يوجد:

# Patient Supply Profile

مثلاً:

```text
Dialyzer: Type X
Blood Line: Type Y
Needle: 16G
Saline: 1000 ml
Syringe: 5
...
```

---

# 17. تجهيزات الجلسة

عند وصول المريض يظهر في المخزن:

```text
Patient Ready For Supplies
```

يفتح الموظف الملف.

النظام يجلب:

**Default Patient Supply Profile**

ويسمح بوجود:

**Session Override**

أي تغيير خاص بتلك الجلسة.

---

# 18. صرف المستلزمات

بعد تجهيزها:

```text
CONFIRM ISSUE
```

فتحدث ثلاثة أشياء:

1. خصم المواد من المخزون.
2. ربط المواد بجلسة المريض.
3. تسجيل الموظف والتاريخ والوقت.

وبالتالي نستطيع معرفة:

**تكلفة واستهلاك كل جلسة.**

---

# 19. مادة غير متوفرة

إذا كانت مادة مطلوبة غير موجودة:

النظام يظهر:

```text
REQUIRED ITEM NOT AVAILABLE
```

ولا يتم استبدالها بصمت.

الإجراءات الممكنة:

- اختيار بديل معتمد.
- طلب موافقة.
- الرجوع للطبيب.
- تصعيد للإدارة.

ويحفظ النظام ما حدث.

---

# 20. توزيع الجهاز والردهة

المريض لا يمتلك جهازاً ثابتاً ولا ردهة ثابتة.

عند جاهزيته للجلسة يقوم النظام بالتوزيع.

الخوارزمية:

### المرحلة الأولى

استبعاد الأجهزة:

```text
OUT_OF_SERVICE
MAINTENANCE
CLEANING
IN_USE
RESERVED
```

### المرحلة الثانية

الأجهزة الاعتيادية المتاحة.

### المرحلة الثالثة

الأجهزة التي تحتاج Approval.

### المرحلة الرابعة

الحفاظ على Emergency Capacity حسب سياسة المركز.

ثم:

```text
Patient 1 → First Eligible Machine
Patient 2 → Next Eligible Machine
...
```

ويستطيع الموظف المخول استخدام:

**Manual Override**

مع تسجيل السبب.

---

# 21. Approval للأجهزة المحمية

إذا احتاج النظام استخدام جهاز محمي:

ينشئ:

```text
Machine Usage Approval Request
```

يتضمن:

- المريض.
- الجهاز.
- الوجبة.
- السبب.
- مقدم الطلب.

ثم:

```text
APPROVED
or
REJECTED
```

ويتم تسجيل اسم الشخص الذي وافق.

---

# 22. بدء جلسة الديلزة

بعد دخول المريض للردهة:

الممرض يفتح المريض.

ويضغط:

```text
START DIALYSIS
```

ويثبت:

- Ward.
- Machine.
- Start Time.
- Nurse.
- Pre Weight.
- BP.
- Pulse.
- Dialyzer.
- Prescribed Duration.
- Required UF.
- Access Information.

---

# 23. Digital Dialysis Sheet

يتم تحويل الورقة الورقية الحالية إلى نموذج إلكتروني.

## معلومات عامة

- Patient.
- File No.
- Date.
- Machine No.
- Ward.
- Shift.
- Diabetes.
- HDF/HD عند اعتمادها.
- Dialysis Mode حسب متطلبات المركز.

## الجهاز والفلتر

- Machine.
- Dialyzer.
- Filter Type.
- Filter Size.
- Filter Status.

## الوصول الوعائي

- AV Fistula.
- Catheter.
- Graft.
- Access Site.
- Access Notes.

## الوزن

- Start Weight.
- Dry Weight.
- Target Weight.
- End Weight.

## الجلسة

- Start Time.
- End Time.
- Prescribed Duration.
- Actual Duration.
- Target UF.
- Actual UF.

## الأدوية أثناء الجلسة

- Heparin.
- Erythropoietin.
- Iron.
- Other Medication.

لكن مصدرها الأساسي يكون Doctor Order.

---

# 24. القراءات أثناء الجلسة

النموذج الحالي يتحول إلى جدول:

| Time | BP | Pulse | Arterial Pressure | Venous Pressure | TMP | BF | UF |
|---|---|---|---|---|---|---|---|

كل Record يحتوي:

```text
session_id
time
value
entered_by
created_at
```

ولا يسمح بتعديل القيمة القديمة دون Audit.

---

# 25. أحداث الجلسة

يمكن للممرض تسجيل:

```text
Normal
Hypotension Event
Access Issue
Machine Issue
Medication Given
Physician Called
Session Interrupted
Other Event
```

القائمة تكون قابلة للضبط من إدارة النظام.

---

# 26. نهاية الجلسة

الممرض يضغط:

```text
END DIALYSIS
```

ويسجل:

- End Time.
- Post BP.
- Post Pulse.
- Post Weight.
- Actual UF.
- Complications.
- Final Nursing Note.
- Patient Condition.

تتحول الجلسة:

```text
IN_DIALYSIS
→
COMPLETED
```

---

# 27. التعفير

بعد انتهاء الجلسة الجهاز لا يصبح Available مباشرة.

الحالة:

```text
WAITING_CLEANING
```

ثم:

```text
CLEANING
```

وبعد انتهاء التعفير:

```text
AVAILABLE
```

ويتم تسجيل:

- وقت بدء التعفير.
- وقت النهاية.
- الموظف أو القسم المسؤول.
- أي ملاحظة.

التعامل المنظم مع تنظيف وتعقيم منطقة ومحطة الديلزة يتماشى مع كون مناطق الديلزة عالية الخطورة من ناحية انتقال العدوى؛ CDC يشدد على تنظيف وتعقيم محطة الديلزة والأسطح بين المرضى.

---

# 28. نظام التمريض

يوجد جهاز داخل كل ردهة.

لدينا:

```text
WARD 1 STATION
WARD 2 STATION
WARD 3 STATION
```

ليس ضرورياً وجود Tablet لكل ممرض في V1.

---

# 29. Nursing Assignment

لكل ردهة:

- قائمة المرضى.
- الأجهزة.
- الممرضون.
- حالة كل جلسة.

المشرف يستطيع توزيع المرضى:

```text
Nurse A → Patients 1–5
Nurse B → Patients 6–10
Nurse C → Patients 11–15
```

---

# 30. تعريف منفذ الإجراء

بما أن الجهاز مشترك، لا يكفي معرفة الكمبيوتر الذي نفذ الإجراء.

كل ممرض يستخدم:

- Username + Password.

أو:

- PIN سريع بعد تسجيل الدخول الأساسي.

مستقبلاً:

- Staff Badge.

أي Action يسجل:

```text
Performed By
Role
Time
Device
Ward
Patient
Session
```

---

# 31. واجهة التمريض

الشاشة الرئيسية:

```text
WARD 1
SHIFT 1

Machine 01  Patient X   In Dialysis
Machine 02  Patient Y   Waiting
Machine 03  Available
Machine 04  Cleaning
Machine 05  Alert
...
```

ويظهر للممرض:

- القراءات المستحقة.
- الأدوية المطلوبة.
- التنبيهات.
- تعليمات الطبيب.
- الأحداث المفتوحة.

---

# 32. نظام الطبيب على iPad

يكون Responsive Web App / PWA في النسخة الأولى.

لا نحتاج بناء تطبيق iOS منفصل في البداية.

الطبيب يفتح النظام.

يضغط:

```text
SCAN PATIENT
```

تفتح كاميرا الـiPad.

يمسح Barcode.

ثم يظهر:

# Patient Clinical Summary

---

# 33. Doctor Patient Overview

تحتوي على:

- اسم المريض.
- العمر.
- Patient ID.
- الصورة.
- Current Dialysis.
- Dry Weight.
- Current Weight.
- Latest BP.
- Vascular Access.
- Clinical Alerts.
- Current Medication.
- Recent Labs.
- Last Dialysis.
- Last Doctor Note.

---

# 34. Tabs الطبيب

```text
Overview

Dialysis

Labs

Medications

Orders

Notes

Timeline
```

---

# 35. Doctor Orders

الطبيب يستطيع:

- إضافة دواء.
- تغيير جرعة.
- إيقاف دواء.
- طلب تحليل.
- وضع تعليمات للممرض.
- توصية للصيدلي.
- توصية للمريض.
- تغيير Dry Weight.
- طلب جلسة إضافية.
- إضافة Clinical Alert.

---

# 36. Prescription ≠ Administration

هذه قاعدة أساسية.

مثلاً:

الطبيب كتب:

```text
Eprex 4000 IU
```

هذا:

**ORDER**

عندما يتم إعطاؤه:

```text
ADMINISTERED
```

يتم حفظ:

- Prescribed By.
- Prescribed At.
- Administered By.
- Administered At.
- Dose.
- Session.

وبالتالي نعرف الفرق بين:

**ما طلب الطبيب**

و:

**ما استلمه المريض فعلياً.**

---

# 37. تعديل أمر طبي

لا يتم حذف التاريخ السابق.

مثال:

```text
Old Dose: 4000 IU
New Dose: 2000 IU

Changed By:
Dr. X

Time:
13:42

Reason:
...
```

---

# 38. Clinical Alerts

أنواع التنبيه:

```text
CRITICAL
IMPORTANT
INFORMATION
```

مثل:

- Drug Allergy.
- Medication Warning.
- Vascular Access Warning.
- High Risk.
- Special Dialysis Instruction.
- Other Clinical Warning.

التنبيه Critical يظهر:

- للطبيب.
- للممرض.
- للصيدلي.
- للمختبر إذا كان مرتبطاً به.

---

# 39. المختبر

Workflow:

```text
ORDERED
↓
SAMPLE_COLLECTED
↓
PROCESSING
↓
RESULT_ENTERED
↓
FINAL
```

لا توجد مرحلة اعتماد ثانية حالياً.

المختبري الذي يدخل النتيجة يجعلها Final.

---

# 40. Laboratory Order

الطبيب يطلب:

```text
CBC
Urea
Creatinine
K
Na
...
```

أو مجموعة:

```text
Monthly Dialysis Panel
```

المجموعات تكون Configurable.

---

# 41. Laboratory Episode

جميع نتائج نفس الطلب تظهر سوية.

مثلاً:

```text
LAB #LA-2026-10052
21/08/2026

Hb           10.8
Creatinine    ...
Urea          ...
K             ...
Na            ...
```

---

# 42. Laboratory Trends

لكل تحليل يمكن رسم:

```text
Hb

11.2
10.9
10.5
11.1
11.4
```

مقابل التاريخ.

وهذا مهم جداً للطبيب.

---

# 43. تعديل نتيجة Final

لا يسمح بتغيير النتيجة وكأنها لم تكن موجودة.

يتم:

```text
AMENDED RESULT
```

ويحتفظ النظام بـ:

- Old Value.
- New Value.
- Reason.
- Changed By.
- Time.

---

# 44. الصيدلية

الصيدلية لديها مخزون مستقل.

المسار:

```text
Main Warehouse
       ↓
 Stock Transfer
       ↓
    Pharmacy
       ↓
Prescription
       ↓
    Patient
```

---

# 45. Pharmacy Queue

الصيدلي يشاهد:

```text
Pending Prescriptions
Dispensing
Completed
Cancelled
```

والطلب يحتوي:

- Patient.
- Doctor.
- Medication.
- Dose.
- Frequency.
- Duration.
- Session إذا كان مرتبطاً بالجلسة.
- Instructions.

---

# 46. الصرف

بعد:

```text
DISPENSE
```

يتم:

1. خصم الدواء من Pharmacy Stock.
2. تسجيل الصيدلي.
3. ربطه بالمريض.
4. ربطه بالوصفة.
5. ربطه بالجلسة عند الحاجة.

---

# 47. سجل أدوية المريض

داخل Patient 360:

```text
Medication History

Prescribed
Dispensed
Administered
Stopped
Dose Changed
```

منذ بداية تسجيل المريض.

---

# 48. المخزن الرئيسي

المخزن يحتوي:

- أدوية.
- مستلزمات الديلزة.
- مستلزمات المختبر.
- مواد استهلاكية.
- مواد أخرى.

---

# 49. Inventory Item

كل مادة:

```text
Item ID
Barcode
Name
Category
Unit
Current Stock
Minimum Stock
Supplier
Batch
Expiry Date
Cost
Location
```

حسب طبيعة المادة.

---

# 50. Batch Tracking

الأدوية والمواد ذات الصلاحية تحفظ حسب Batch.

مثلاً:

```text
Item: Eprex
Batch: AX2026
Qty: 100
Expiry: 04/2027
```

مهم للتتبع.

---

# 51. مخزون متعدد المواقع

النظام لا يعتمد Stock واحداً.

لدينا:

```text
MAIN WAREHOUSE

PHARMACY

LABORATORY STOCK

WARD STOCK
```

إذا كانت هناك مخازن فرعية.

كل موقع يمتلك Stock مستقل.

---

# 52. التحويل

الحركة:

```text
TRANSFER REQUESTED
↓
APPROVED
↓
ISSUED
↓
RECEIVED
```

بين المخزن والصيدلية أو الأقسام.

---

# 53. تنبيهات المخزون

النظام يحسب:

### Low Stock

### Critical Stock

### Expiring Soon

### Expired

### Days of Stock Remaining

مثلاً:

```text
Dialyzer X

Available: 458
Average Daily Consumption: 57

Estimated Remaining:
8 Days
```

---

# 54. استهلاك المريض

يجب أن نستطيع استخراج:

```text
Patient X

August:

Dialyzers: 12
Blood Lines: 12
Needles: 24
Saline: ...
Medication: ...
```

---

# 55. تكلفة الجلسة

من المواد:

```text
Session Cost =
Consumables
+ Medication
+ Laboratory Consumables
```

مع إمكانية توسيع معادلة التكلفة مستقبلاً.

لا يوجد Billing Patient في V1 لأن المركز حكومي.

---

# 56. الأجهزة والصيانة

لكل جهاز:

```text
Machine ID
Barcode
Serial Number
Manufacturer
Model
Ward
Purchase/Installation Date
Status
Notes
```

---

# 57. Machine Timeline

مثلاً:

```text
01/08 Maintenance
05/08 Returned to Service
12/08 Fault
12/08 Out of Service
13/08 Repaired
21/08 Shift 1 Patient X
21/08 Cleaning
21/08 Shift 2 Patient Y
```

---

# 58. عطل الجهاز

الموظف يضغط:

```text
REPORT FAULT
```

يدخل:

- المشكلة.
- الوقت.
- Severity.
- المبلغ.
- صورة اختيارية.

حالة الجهاز:

```text
OUT_OF_SERVICE
```

ويخرج مباشرة من Scheduler.

---

# 59. Maintenance Ticket

```text
OPEN
ASSIGNED
IN_PROGRESS
WAITING_PART
COMPLETED
CLOSED
```

ويحتفظ بتاريخ الصيانة.

---

# 60. جلسة مرتبطة بجهاز تعطل

إذا تعطل الجهاز أثناء الجلسة:

النظام يسجل Event.

ويتم:

```text
REASSIGN MACHINE
```

مع:

- الجهاز القديم.
- الجديد.
- السبب.
- الوقت.
- الشخص المخول.

ولا تضيع معلومات الجلسة.

---

# 61. شاشة الإدارة LIVE CENTER

هذه الشاشة يجب أن تكون أول شاشة للمدير.

مثلاً:

# LIVE CENTER

```text
Current Shift: SHIFT 2

Scheduled      54
Arrived        52
In Dialysis    48
Waiting         4
Completed       0
Late            1
Absent          2
Emergency       1
```

---

# 62. Live Machines

```text
Available       4
In Use         48
Cleaning        2
Maintenance     3
Emergency       2
```

مع خريطة الردهات.

---

# 63. Ward Dashboard

## Ward 1

20 أجهزة.

## Ward 2

20 جهازاً.

## Ward 3

19 جهازاً.

كل جهاز يظهر Card.

الحالة تحدد العرض.

---

# 64. Dashboard الإدارة

المؤشرات:

- عدد المرضى.
- Active Patients.
- جلسات اليوم.
- الجلسات الحالية.
- Completed Sessions.
- Emergency Sessions.
- Extra Sessions.
- Late Patients.
- Absent Patients.
- Device Utilization.
- Ward Utilization.
- Shift Utilization.
- أجهزة متوقفة.
- أجهزة بالصيانة.
- Low Stock.
- Critical Stock.
- Lab Pending.
- Pharmacy Pending.
- Average Consumption.
- Session Cost.
- Patient Consumption.

---

# 65. التقارير

## Patient Reports

- Patient Medical Summary.
- Session History.
- Medication History.
- Laboratory History.
- Absence History.
- Emergency Sessions.
- Patient Consumption.

## Dialysis Reports

- Daily Sessions.
- Weekly Sessions.
- Monthly Sessions.
- Sessions by Ward.
- Sessions by Shift.
- Sessions by Machine.

## Machine Reports

- Utilization.
- Downtime.
- Maintenance.
- Failure Frequency.

## Inventory Reports

- Current Stock.
- Consumption.
- Expiry.
- Transfers.
- Adjustments.
- Stock Movement.

## Pharmacy Reports

- Dispensed Medication.
- Prescription History.
- Drug Consumption.

## Laboratory Reports

- Orders.
- Completed Tests.
- Pending Tests.
- Patient Trends.

---

# 66. الجودة وسلامة المرضى

يجب ألا يكون النظام مجرد برنامج تسجيل.

يستحسن وجود:

# Quality & Safety Module

حتى لو كان بسيطاً في V1.

من مبادئ التشغيل الدولية لمراكز الديلزة وجود مراقبة مستمرة للجودة والأحداث والسلامة. CMS يضع مراقبة جودة الرعاية ضمن متطلبات تشغيل منشآت ESRD، بينما توصي CDC بالمراقبة الدورية للعدوى، ومتابعة نظافة اليدين والعناية بالوصول الوعائي والتعليم المستمر.

نسجل مستقبلاً:

- Adverse Events.
- Infection Events.
- Vascular Access Events.
- Hospital Transfer.
- Emergency Events.
- Repeated Hypotension.
- Machine-related Incident.

لكن أي Clinical Rule يعتمدها النظام يجب أن يوافق عليها المدير الطبي للمركز.

---

# 67. خطة رعاية المريض

من الأفضل إضافة:

# Patient Care Plan

تحتوي:

- Dialysis Schedule.
- Dialysis Prescription.
- Dry Weight.
- Vascular Access.
- Current Medication.
- Laboratory Monitoring.
- Clinical Goals.
- Special Instructions.

CMS يستخدم نموذج الرعاية المتمحورة حول المريض وخطة رعاية فردية مبنية على تقييم المريض؛ لذلك وجود Patient Care Plan منفصل عن مجرد تاريخ الجلسات يجعل النظام أكثر نضجاً.

---

# 68. المستخدمون

الأدوار الأساسية:

```text
SUPER_ADMIN
CENTER_DIRECTOR
MEDICAL_DIRECTOR
DOCTOR
HEAD_NURSE
NURSE
PHARMACIST
WAREHOUSE
LAB_TECHNICIAN
RECEPTION
MAINTENANCE
ACCOUNTANT
```

لا يوجد HR Attendance للموظفين في Scope الحالي.

---

# 69. RBAC

لا نبني النظام على:

```text
if user == doctor
```

وإنما:

# Role Based Access Control

مثلاً:

```text
patient.view
patient.edit

dialysis.create
dialysis.start
dialysis.end

prescription.create
prescription.modify

lab.request
lab.result.create

pharmacy.dispense

inventory.issue

machine.disable

approval.machine.use

report.view
```

---

# 70. Permission Matrix

مثال:

| Action | Doctor | Nurse | Pharmacy | Lab | Warehouse |
|---|---:|---:|---:|---:|---:|
| Patient View | ✅ | ✅ | محدود | محدود | محدود |
| Prescription | ✅ | ❌ | View | ❌ | ❌ |
| Administer Drug | حسب السياسة | ✅ | حسب السياسة | ❌ | ❌ |
| Lab Request | ✅ | ❌ | ❌ | View | ❌ |
| Lab Result | View | View | ❌ | ✅ | ❌ |
| Dispense | ❌ | ❌ | ✅ | ❌ | ❌ |
| Stock Issue | ❌ | ❌ | Pharmacy | ❌ | ✅ |

الجدول النهائي يحدد مع إدارة المركز.

---

# 71. Audit Trail

من أخطر الأخطاء بناء النظام بدون Audit.

كل عملية مهمة تحفظ.

```text
actor_id
actor_role
action
entity_type
entity_id
old_value
new_value
reason
timestamp
device
ip_address
```

مثال:

```text
Doctor Ahmed
Changed Dry Weight
72.5 → 71.8
21/08/2026 13:34
```

---

# 72. قاعدة ذهبية

## Clinical Records Are Append-Or-Amend

السجل الطبي لا يحذف بشكل اعتيادي.

يمكن:

```text
Amend
Cancel
Correct
```

لكن التاريخ السابق محفوظ.

---

# 73. البنية التقنية المقترحة

لأن النظام داخل شبكة المركز، أقترح:

```text
             Internal LAN
                  |
             Core Switch
                  |
        ┌─────────┴─────────┐
        |                   |
 Application Server     Backup Server
        |
   PostgreSQL
        |
      MinIO
```

والردهات والأقسام تتصل بالشبكة الداخلية.

---

# 74. Stack البرمجي المقترح

حتى لا نعقد المشروع بعدة تقنيات:

## Frontend

**Next.js + TypeScript**

مع:

- React.
- Tailwind CSS.
- Responsive UI.
- PWA.

يعمل على:

- Desktop.
- iPad.
- Tablet.

---

# 75. Backend

**NestJS + TypeScript**

لأنه مناسب لنظام Module Based كبير.

---

# 76. Database

**PostgreSQL**

وهي قاعدة البيانات الرئيسية.

---

# 77. ORM

يمكن:

**Prisma ORM**

---

# 78. الملفات

مثل:

- ملفات PDF.
- الصور.
- Documents.

يستخدم:

**MinIO Object Storage**

على السيرفر الداخلي.

---

# 79. Live Updates

لـ:

- Live Dashboard.
- Ward Dashboard.
- Laboratory Queue.
- Pharmacy Queue.

استخدام:

**WebSocket / Socket.IO**

---

# 80. Cache / Queue

ليس ضرورياً في أول يوم.

لكن يمكن إدخال:

**Redis**

لاحقاً للـ:

- Queue.
- Cache.
- Notification Events.

---

# 81. Docker

تشغيل المشروع بواسطة:

**Docker Compose**

ويحتوي:

```text
postgres
backend
frontend
minio
redis
```

---

# 82. هيكل المشروع

في VS Code:

```text
dialysis-center/
│
├── apps/
│   ├── api/
│   └── web/
│
├── packages/
│   ├── shared/
│   ├── types/
│   └── ui/
│
├── database/
│
├── infrastructure/
│
├── docs/
│
├── docker-compose.yml
│
└── README.md
```

---

# 83. Modules داخل Backend

```text
src/
├── auth/
├── users/
├── roles/
├── permissions/
│
├── patients/
├── patient-alerts/
├── patient-timeline/
│
├── scheduling/
├── attendance/
├── dialysis-sessions/
├── nursing/
│
├── doctors/
├── clinical-orders/
├── medications/
│
├── laboratory/
├── pharmacy/
│
├── inventory/
├── stock-transfer/
│
├── machines/
├── maintenance/
│
├── approvals/
├── notifications/
│
├── reports/
├── audit/
│
└── settings/
```

---

# 84. Frontend Apps

لا نبني 10 مشاريع مختلفة.

نستخدم Application واحدة.

بعد Login:

```text
Role → Permissions → Available Interface
```

مثلاً:

Doctor:

```text
/dashboard/doctor
```

Nurse:

```text
/ward
```

Pharmacy:

```text
/pharmacy
```

Warehouse:

```text
/inventory
```

Administration:

```text
/admin
```

---

# 85. الكيانات الأساسية في Database

## Patient

```text
Patient
```

## Dialysis

```text
DialysisPlan
DialysisSchedule
DialysisSession
DialysisReading
DialysisEvent
```

## Clinical

```text
ClinicalAlert
ClinicalNote
DoctorOrder
Prescription
MedicationAdministration
```

## Laboratory

```text
LabOrder
LabOrderItem
LabResult
LabTest
LabPanel
```

## Inventory

```text
InventoryItem
InventoryBatch
StockLocation
StockBalance
StockMovement
StockTransfer
```

## Machines

```text
Machine
MachineStatusHistory
MaintenanceTicket
```

## Organization

```text
Ward
Shift
User
Role
Permission
```

## System

```text
Approval
AuditLog
Notification
Attachment
Setting
```

---

# 86. العلاقات المهمة

```text
Patient
  |
  ├── DialysisPlan
  ├── DialysisSession
  ├── Prescription
  ├── LabOrder
  ├── ClinicalAlert
  ├── ClinicalNote
  └── Timeline
```

والجلسة:

```text
DialysisSession
  |
  ├── Patient
  ├── Machine
  ├── Ward
  ├── Shift
  ├── Nurse
  ├── Readings
  ├── Events
  ├── Medication
  └── Supplies
```

---

# 87. State Machine للجلسة

مهم جداً ألا تكون Session مجرد Boolean.

```text
SCHEDULED
↓
ARRIVED
↓
PRE_DIALYSIS
↓
SUPPLIES_READY
↓
WAITING_MACHINE
↓
ASSIGNED
↓
IN_DIALYSIS
↓
POST_DIALYSIS
↓
COMPLETED
↓
DISCHARGED
```

المسارات الجانبية:

```text
ABSENT
LATE
CANCELLED
EMERGENCY
EXTRA
INTERRUPTED
```

---

# 88. State Machine للوصفة

```text
ACTIVE
↓
DISPENSING
↓
DISPENSED
```

أو:

```text
ACTIVE
↓
MODIFIED
```

أو:

```text
ACTIVE
↓
STOPPED
```

---

# 89. State Machine للمختبر

```text
ORDERED
SAMPLE_COLLECTED
PROCESSING
FINAL
AMENDED
CANCELLED
```

---

# 90. State Machine للجهاز

```text
AVAILABLE
IN_USE
WAITING_CLEANING
CLEANING
AVAILABLE
```

أو:

```text
AVAILABLE
→
MAINTENANCE
→
AVAILABLE
```

---

# 91. Global Search

يجب أن يحتوي Header النظام على Search.

البحث بواسطة:

- Patient Name.
- Patient ID.
- Barcode.
- File Number.

لكن النتائج المعروضة تعتمد على Permission المستخدم.

---

# 92. Notifications

التنبيهات داخل النظام فقط في V1.

مثل:

```text
Patient Absent
Emergency Patient Arrived
Critical Stock
Machine Failure
Lab Result Available
Doctor Order
Approval Request
Critical Clinical Alert
```

---

# 93. البنية الأمنية

النظام يحتوي معلومات صحية شديدة الحساسية.

لذلك:

- HTTPS حتى داخل LAN.
- Password Hashing.
- Role Based Permissions.
- Session Timeout.
- Device Session Management.
- Audit Logs.
- Encryption للنسخ الاحتياطية.
- Least Privilege.
- Backup.
- Disaster Recovery.
- منع مشاركة حسابات المستخدمين.

كمبادئ هندسية، معايير أمن المعلومات الصحية العالمية تركز على Access Control وWorkstation Security والنسخ الاحتياطي وخطط التعافي والطوارئ. هذه تستخدم هنا كمرجع تصميم وليست بديلاً عن المتطلبات القانونية العراقية التي يجب اعتمادها من الجهات المختصة.

---

# 94. الشبكة

يعمل النظام الأساسي:

**بدون الحاجة إلى Internet خارجي.**

طالما:

```text
Client
↕
Internal Network
↕
Local Server
```

النظام يعمل.

---

# 95. تصميم الاعتمادية

يفضل:

```text
Primary Application Server
+
Backup Server
+
UPS
```

مع:

- Daily Backup.
- Database Backup.
- File Backup.
- Backup Verification.
- Restore Test.

لاحقاً يمكن إنشاء Failover تلقائي.

---

# 96. Interoperability

لا نحتاج تطبيق HL7/FHIR كاملاً في V1.

لكن نصمم Database وAPI بصورة لا تمنع التكامل مستقبلاً.

FHIR هو معيار HL7 لتبادل المعلومات الصحية إلكترونياً ويحتوي أيضاً موارد مثل Patient وObservation وMedication وغيرها، لذلك من المفيد أن يكون تصميم النظام FHIR-ready بدون تعقيد النسخة الأولى.

---

# 97. API Architecture

Backend:

```text
/api/v1
```

أمثلة:

```text
POST /auth/login

GET  /patients
POST /patients
GET  /patients/:id

GET /patients/:id/timeline

GET  /schedule/today

POST /sessions/:id/check-in

POST /sessions/:id/pre-dialysis

POST /sessions/:id/assign-machine

POST /sessions/:id/start

POST /sessions/:id/readings

POST /sessions/:id/end

POST /patients/:id/prescriptions

POST /lab/orders

POST /pharmacy/dispense

POST /inventory/issues

POST /machines/:id/faults
```

---

# 98. لا تضع Business Logic في Frontend

قاعدة مهمة أثناء البرمجة.

مثلاً قرار:

"هل يمكن استخدام الجهاز؟"

لا يكون فقط في React.

يكون في Backend:

```text
Machine Assignment Service
```

حتى لا يستطيع مستخدم تجاوز السياسة بالتلاعب بالواجهة.

---

# 99. Audit Event Architecture

أي Module يطلق Events.

مثلاً:

```text
PatientCheckedIn

SuppliesIssued

MachineAssigned

DialysisStarted

MedicationDispensed

LabResultFinalized

DialysisCompleted
```

وتستخدم هذه Events لبناء:

- Timeline.
- Notifications.
- Audit.
- Dashboard.

---

# 100. مراحل التنفيذ

لا ننفذ المشروع كله مرة واحدة.

## PHASE 0
### Foundation

بناء:

- Repository.
- Docker.
- PostgreSQL.
- Backend.
- Frontend.
- Login.
- Users.
- Roles.
- Permissions.
- Audit.

---

# 101. PHASE 1
## Patient Registry

نبني:

- إضافة المريض.
- تعديل البيانات.
- Patient ID.
- Barcode.
- Medical Information.
- Clinical Alerts.
- Search.
- Patient 360 Shell.

عند نهاية المرحلة يجب أن نستطيع تسجيل الـ520 مريضاً.

---

# 102. PHASE 2
## Scheduling

نبني:

- Shifts.
- Week Days.
- Dialysis Plan.
- 1–4 Sessions Weekly.
- Shift Capacity.
- Patient Schedule.
- Daily Schedule.
- Extra Session.
- Emergency Session.

---

# 103. PHASE 3
## Reception

نبني:

- Barcode Scanner.
- Today's Appointment.
- Check-In.
- Late.
- Absent.
- Patient Status Board.

---

# 104. PHASE 4
## Inventory Supplies

نبني قبل جلسة الديلزة:

- Patient Supply Profile.
- Issue Supplies.
- Batch.
- Stock.
- Stock Movement.
- Low Stock.

حتى تصبح رحلة المريض:

```text
Arrival
→
Pre Dialysis
→
Supplies
```

---

# 105. PHASE 5
## Machines

نبني:

- Ward.
- Machine.
- Machine Status.
- Emergency Rules.
- Protected Machines.
- Approval.
- Assignment Algorithm.

---

# 106. PHASE 6
## Dialysis Session

هذه أكبر مرحلة.

نبني Digital Dialysis Sheet بالكامل:

- Start.
- Pre values.
- Readings.
- Medication Administration.
- Events.
- Notes.
- End.
- Post values.

---

# 107. PHASE 7
## Nursing

نبني:

- Ward Dashboard.
- Patients by Nurse.
- Dialysis Monitoring.
- Nursing Actions.
- Doctor Instructions.

---

# 108. PHASE 8
## Doctor iPad

نبني:

- Barcode Scan.
- Patient Overview.
- Labs.
- Medications.
- Dialysis.
- Orders.
- Notes.
- Alerts.
- Timeline.

---

# 109. PHASE 9
## Laboratory

نبني:

- Lab Catalog.
- Lab Panels.
- Orders.
- Queue.
- Results.
- Final Result.
- Amend Result.
- Graphs.

---

# 110. PHASE 10
## Pharmacy

نبني:

- Pharmacy Inventory.
- Prescription Queue.
- Dispense.
- Medication History.
- Stock Deduction.

---

# 111. PHASE 11
## Warehouse Advanced

بعد تشغيل الأساس:

- Transfers.
- Batches.
- Expiry.
- Consumption Forecast.
- Days Remaining.
- Department Stock.

---

# 112. PHASE 12
## Maintenance

- Machine Fault.
- Maintenance Ticket.
- Machine History.
- Downtime.
- Reports.

---

# 113. PHASE 13
## Management Dashboard

بعد توفر بيانات حقيقية:

- Live Sessions.
- Wards.
- Machines.
- Patients.
- Alerts.
- Stock.
- Pharmacy.
- Laboratory.

لا أنصح ببناء Dashboard كاملة قبل Modules التشغيلية، لأنها بدون بيانات حقيقية ستكون مجرد تصميم.

---

# 114. PHASE 14
## Reports

بناء التقارير بعد استقرار البيانات.

---

# 115. PHASE 15
## Quality & Safety

إضافة:

- Incident Reporting.
- Infection Tracking.
- Quality Indicators.
- Clinical Audit.

---

# 116. أولويات التنفيذ

الترتيب الصحيح:

```text
Users
↓
Patients
↓
Scheduling
↓
Reception
↓
Supplies
↓
Machines
↓
Dialysis
↓
Nursing
↓
Doctor
↓
Laboratory
↓
Pharmacy
↓
Advanced Inventory
↓
Maintenance
↓
Dashboard
↓
Reports
```

لا تبدأ بالصيدلية أو Dashboard أولاً.

---

# 117. قواعد الـUI

النظام طبي وتشغيلي.

لذلك:

### لا نعتمد على الجمالية فقط.

الأولوية:

1. السرعة.
2. الوضوح.
3. منع الخطأ.
4. الأزرار الكبيرة.
5. أقل عدد نقرات.
6. التنبيهات الواضحة.
7. Confirmation للعمليات الخطرة.
8. إمكانية العمل على Touch Screen.

---

# 118. الألوان الوظيفية

مثلاً:

```text
Green   = Ready / Completed
Blue    = Running
Yellow  = Waiting
Orange  = Attention
Red     = Critical
Gray    = Disabled
```

لكن لا يعتمد النظام على اللون وحده.

يجب وجود:

**Icon + Text + Color**

لخدمة مختلف المستخدمين.

---

# 119. منع الأخطاء

قبل صرف دواء:

يعرض:

```text
Patient
Medication
Dose
Doctor
Warning
```

قبل بدء الجلسة:

```text
Patient
Machine
Ward
Shift
```

قبل تعديل نتيجة:

يطلب سبباً.

قبل استخدام جهاز Protected:

يطلب Approval.

---

# 120. قاعدة Clinical Safety

البرنامج:

**يساعد الكادر ولا يستبدل قرار الطبيب.**

أي:

- جرعة.
- خطة علاج.
- Dry Weight.
- Prescription.
- Lab Interpretation.

يتم تحديدها أو اعتمادها من الشخص الطبي المخول.

---

# 121. Testing

نحتاج أربعة مستويات.

## Unit Test

للقواعد البرمجية.

## Integration Test

مثلاً:

```text
Prescription
→ Pharmacy
→ Stock Deduction
```

## Workflow Test

مثلاً:

```text
Check In
→ Supplies
→ Machine
→ Dialysis
→ Discharge
```

## User Acceptance Testing

موظفو المركز يجربون النظام قبل الإطلاق.

---

# 122. حالات يجب اختبارها

ليس فقط Happy Path.

اختبر:

- مريض غائب.
- مريض متأخر.
- Barcode غير موجود.
- جهاز معطل.
- جهاز يتعطل أثناء الجلسة.
- مادة غير متوفرة.
- دواء غير متوفر.
- تعديل وصفة أثناء الجلسة.
- تعديل Lab Result.
- انقطاع الجهاز عن الشبكة.
- مستخدم بدون Permission.
- Emergency Patient.
- Extra Session.
- Full Capacity.
- Protected Machine Required.

---

# 123. إدخال البيانات الحالية

قبل Go Live يجب تجهيز:

## Patients Import

ملف Excel يحتوي المرضى.

## Machines Import

59 جهازاً.

## Inventory Import

المخزون.

## Pharmacy Import

الأدوية.

## Laboratory Catalog

التحاليل.

## Users

الموظفون.

---

# 124. نقل الإضابير الورقية

لا أنصح بإدخال التاريخ الكامل لـ520 مريضاً يدوياً من أول يوم إذا كان ضخماً.

يمكن اعتماد:

### Baseline Record

لكل مريض:

- Basic Information.
- Diagnosis.
- Dry Weight.
- Current Medication.
- Current Dialysis Plan.
- Important Labs.
- Clinical Alerts.
- Current Supply Profile.

ثم يبدأ التاريخ الإلكتروني الكامل من تاريخ Go Live.

يمكن مسح الإضبارة القديمة PDF وربطها بالملف كـ:

```text
Legacy Medical Record
```

---

# 125. التشغيل التجريبي

لا نشغل الـ59 جهازاً مباشرة.

## Pilot

ابدأ مثلاً بـ:

**Ward 1**

لمدة محدودة.

اختبر:

- Reception.
- Supplies.
- Nursing.
- Doctor.
- Dialysis.

بعد التأكد:

Ward 2.

ثم:

Ward 3.

ثم الصيدلية والمختبر بشكل كامل.

---

# 126. Go Live

عند الإطلاق:

يفضل وجود فريق المشروع داخل المركز.

Monitoring مباشر لـ:

- Server.
- Database.
- Errors.
- Network.
- User Issues.

---

# 127. النسخة المستقبلية للمريض

ليست ضمن V1.

لكن النظام يصمم لها من البداية.

Patient App مستقبلاً يعرض:

- Next Session.
- Schedule.
- Medical Summary.
- Medication.
- Laboratory Results.
- Alerts.
- Doctor Instructions.
- Notifications.

الوصول يكون عبر الإنترنت بواسطة API Gateway آمن، وليس فتح LAN المركز مباشرة للإنترنت.

---

# 128. ميزات مستقبلية

بعد نجاح V1:

- Patient Mobile App.
- SMS.
- Appointment Notifications.
- AI Analytics.
- Forecasting.
- Supply Prediction.
- Advanced Quality Monitoring.
- Multi-Center Support.
- National Dialysis Registry Integration.
- Hospital Integration.
- FHIR API.
- Electronic Referral.
- BI Dashboard.

---

# 129. ما لا أنصح ببنائه الآن

لا تبدأ بـ:

- AI.
- تطبيق المريض.
- Cloud Public Access.
- تطبيق Native منفصل للطبيب.
- محاسبة كبيرة.
- HR.
- Payroll.
- أجهزة Biometric.
- ربط أجهزة الديلزة.

هذه توسعات مستقبلية.

ركز أولاً على:

# Clinical + Operational Core

---

# 130. Definition of Done للنسخة الأولى

لا أعتبر V1 مكتملة إلا إذا استطاع النظام تنفيذ السيناريو التالي بدون ورقة خارجية أساسية:

```text
إنشاء المريض
↓
إنشاء خطة الغسيل
↓
تحديد الأيام والوجبات
↓
Barcode
↓
Check-In
↓
Pre Dialysis
↓
تجهيز المواد
↓
خصم المخزون
↓
تخصيص الجهاز
↓
بدء الجلسة
↓
تسجيل القراءات
↓
Doctor Orders
↓
Medication
↓
Lab Order
↓
إنهاء الجلسة
↓
Post Weight
↓
Discharge
↓
Machine Cleaning
↓
Patient Timeline
↓
Management Report
```

إذا هذا السيناريو يعمل بصورة مستقرة، عندها عندنا **Core System حقيقي**.

---

# 131. أول خطوة عملية داخل VS Code

لا تبدأ بتصميم الشاشات.

ابدأ بهذا الترتيب:

```text
01 Create Repository
02 Docker Environment
03 PostgreSQL
04 NestJS API
05 Next.js Web
06 Prisma
07 Authentication
08 Users
09 Roles
10 Permissions
11 Audit Log
12 Patient Database
```

ثم:

```text
Patient UI
→
Scheduling
→
Reception
```

---

# 132. أول Milestone

نسميه:

# MILESTONE 1 — Patient Scheduling Core

يعتبر ناجحاً عندما تستطيع:

1. تسجيل مريض.
2. توليد Patient ID.
3. توليد Barcode.
4. تحديد 1–4 جلسات أسبوعية.
5. اختيار أيام الجلسات.
6. اختيار الوجبة.
7. إظهار جدول اليوم.
8. Scan Barcode.
9. تسجيل حضور.
10. تسجيل Late / Absent.
11. مشاهدة Timeline.

**لا تنتقل إلى جلسة الديلزة قبل اكتمال هذا الـMilestone.**

---

# 133. Milestone 2

# DIALYSIS OPERATIONS CORE

يحتوي:

- Wards.
- 59 Machines.
- Machine Status.
- Supply Issue.
- Auto Assignment.
- Approval.
- Session Start.
- Readings.
- Session End.
- Cleaning.

---

# 134. Milestone 3

# CLINICAL CORE

- Doctor.
- Nursing.
- Prescriptions.
- Clinical Alerts.
- Lab Orders.
- Medication Administration.
- Patient Timeline.

---

# 135. Milestone 4

# SUPPORT SERVICES

- Pharmacy.
- Laboratory.
- Advanced Warehouse.
- Maintenance.

---

# 136. Milestone 5

# MANAGEMENT & QUALITY

- Dashboards.
- Reports.
- KPI.
- Quality.
- Audit.
- Backup Monitoring.

---

# 137. النتيجة النهائية المطلوبة

النظام النهائي يجب أن يستطيع الإجابة فوراً عن أسئلة مثل:

**وين المريض أحمد الآن؟**

```text
Ward 2
Machine 27
Dialysis Started 12:07
Nurse X
```

**شنو آخر علاجاته؟**

موجودة بملفه.

**شنو آخر تحاليله؟**

موجودة مع Graph.

**من غير علاجه؟**

Audit Trail.

**شنو المواد التي أخذها اليوم؟**

Session Supplies.

**شكد استهلاكه هذا الشهر؟**

Patient Consumption.

**ليش استخدمنا الجهاز الاحتياطي؟**

Approval History.

**الجهاز 20 شكد توقف؟**

Machine Timeline.

**من المسؤول عن الإجراء؟**

Audit Log.

**كم مريض داخل المركز الآن؟**

Live Dashboard.

**كم جهاز يعمل الآن؟**

Live Machine Board.

**من غاب اليوم؟**

Attendance Dashboard.

**شنو الناقص بالمخزن؟**

Inventory Alerts.

وهذا هو المستوى الذي يجب أن نستهدفه في المشروع.

---

# 138. المبدأ النهائي

هذا النظام لا يبنى كبرنامج تسجيل بيانات.

يبنى كـ:

# Operational + Clinical Digital Twin للمركز

أي أن الحالة الموجودة على شاشة الإدارة يجب أن تمثل حالة المركز الحقيقية قدر الإمكان.

المريض.

الجهاز.

الردهة.

الجلسة.

الممرض.

الطبيب.

المختبر.

الدواء.

المخزون.

الصيانة.

كلها مترابطة في نفس اللحظة.

وعند نجاح هذا المبدأ يتحول المركز من مجموعة إضابير وأقسام منفصلة إلى **منظومة ديلزة إلكترونية مركزية قابلة للتتبع والإدارة والتوسع**.

---

## المرجعية التنظيمية والتقنية

التصميم يستند إلى مبادئ عالمية مستخدمة في نظم الرعاية الصحية ومراكز الديلزة، أهمها: الرعاية المتمحورة حول المريض وخطة الرعاية الفردية ومراقبة الجودة، إدارة العدوى وسلامة محطة الديلزة، التتبع الكامل للإجراءات، والصلاحيات والتدقيق. كما يتم تصميم طبقة البيانات بصورة تسمح بالتكامل مستقبلاً مع معيار HL7 FHIR لتبادل المعلومات الصحية.

قبل اعتماد أي قاعدة علاجية أو Clinical Alert تلقائي أو بروتوكول جرعات، يجب اعتمادها رسمياً من المدير الطبي للمركز ووزارة الصحة/الجهة الصحية المختصة؛ النظام يدير ويوثق القرار الطبي ولا يستبدله.
