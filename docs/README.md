# DCMS Documentation

This folder holds the project's narrative documentation. Generated test-run
artifacts live next to the code that produces them
(`apps/api/test-reports/`), not here — this folder is meant to be readable
and publishable on its own.

## Structure

| Folder | Contents |
|---|---|
| [`planning/`](planning) | The original phased delivery plan and module specification that the system was built against. |
| [`architecture/`](architecture) | Living design docs: the staff/oversight/API-v2 improvement study, the routes redesign reference, and UI/loading-state notes. |
| [`reviews/`](reviews) | Point-in-time technical review write-ups and phase test reports. |
| [`assets/`](assets) | Images referenced by the docs above (UI screenshots from the Playwright preview suite). |

## Where to start

- **New to the system?** Start with [`planning/PROJECT-PHASES-PLAN.md`](planning/PROJECT-PHASES-PLAN.md) and [`planning/MODULES-SPEC.md`](planning/MODULES-SPEC.md) for what each module is meant to do.
- **Working on staff administration, the API v2 redesign, or the oversight dashboard?** [`architecture/SYSTEM-IMPROVEMENT-STUDY-AR.md`](architecture/SYSTEM-IMPROVEMENT-STUDY-AR.md) (Arabic) is the current design doc; §13 links to the full route table in [`architecture/ROUTES-REDESIGN-AR.md`](architecture/ROUTES-REDESIGN-AR.md).
- **API reference:** the live, always-current spec is served by the running API at `/api/v1/docs` (v1) and `/api/v2/docs` (v2), and frozen copies are committed at [`apps/api/openapi.yaml`](../apps/api/openapi.yaml) / [`apps/api/openapi.v2.yaml`](../apps/api/openapi.v2.yaml).
- **Test evidence:** JSON results from the review/regression scripts are written to [`apps/api/test-reports/`](../apps/api/test-reports) by the scripts under `apps/api/scripts/` — see that folder's file names for which suite produced which report.

Most docs here are written in Arabic, matching the team's working language;
code comments and identifiers stay in English throughout the codebase.
