# Dialysis Center Management System (DCMS)

Software for scheduling dialysis, running sessions on the ward, and governing quality and inventory at a kidney care center.

## Language

**Journey board**:
The live view of every patient’s step from arrival through discharge for the current day.
_Avoid_: Flow board, UI flow, patient flow (as a product name)

**Design system**:
HeroUI v3 components plus DCMS semantic tokens (`globals.css`) and §11 interaction rules (badges, skeletons, toasts).
_Avoid_: HeroUI theme defaults alone, ad-hoc Tailwind palette classes for clinical states

CI runs `npm run check:tokens` on `apps/web/src/app/admin` and `apps/web/src/components` to block `slate-*` / raw `red-*` / `amber-*` / `emerald-*` in TSX.

**Clinical state**:
A persisted enum value (schedule, session, machine, etc.) shown with one fixed tone and label via `StatusBadge`.
_Avoid_: Inline red/amber/green styling per page, duplicate status labels
