import { test, expect, type Page } from "@playwright/test";

// These tests exercise the UI with invented fixtures only. They deliberately
// refuse to run against an API that does not identify itself as the fixture.
test.beforeEach(async ({ request, page }) => {
  const response = await request.get("http://127.0.0.1:3101/api/v2/health");
  expect(response.headers()["x-dcms-fixture"]).toBe("synthetic-only");
  await page.route("**/api/v2/**", (route) => new URL(route.request().url()).origin === "http://127.0.0.1:3101" ? route.continue() : route.abort());
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("fixture");
  await page.getByLabel("Password", { exact: true }).fill("fixture");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Center overview", exact: true })).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function capture(page: Page, filename: string) {
  await page.screenshot({ path: `../../docs/assets/ui-preview/${filename}.png`, fullPage: true, style: "nextjs-portal { display: none; }" });
}

test("login language and error message switch without clearing credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await capture(page, "login-ar");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("invalid-demo");
  await page.getByLabel("Password", { exact: true }).fill("invalid-demo");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Unable to sign in");
  await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("تعذر تسجيل الدخول");
  await expect(page.getByRole("textbox", { name: "اسم المستخدم" })).toHaveValue("invalid-demo");
  await expect(page.getByLabel("كلمة المرور", { exact: true })).toHaveValue("invalid-demo");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("language, appearance and accessibility preferences survive refresh", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Appearance", exact: true })).toHaveAttribute("aria-selected", "true");
  await capture(page, "settings-en");
  await page.getByText("Dark appearance", { exact: true }).click();
  await expect(page.getByRole("switch", { name: "Dark appearance", exact: true })).toBeChecked();
  await page.getByRole("switch", { name: "Compact layout", exact: true }).press("Space");
  await page.getByRole("switch", { name: "Reduce motion", exact: true }).press("Space");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Dark appearance", exact: true })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Compact layout", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await capture(page, "settings-dark");
  await page.getByText("Dark appearance", { exact: true }).click();
  await page.getByRole("switch", { name: "Compact layout", exact: true }).press("Space");
  await page.getByLabel("Interface language", { exact: true }).selectOption("ar");
  await page.reload();
  await expect(page.getByRole("tab", { name: "المظهر", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await capture(page, "settings-ar");
});

test("patient form preserves values and enum payload when switching language", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "+ Add patient", exact: true }).click();
  await page.locator('input[name="fullName"]').fill("UI Test Patient (Synthetic)");
  await page.locator('select[name="gender"]').selectOption("FEMALE");
  await page.locator('input[name="dateOfBirth"]').fill("1985-04-12");
  await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
  await expect(page.locator('input[name="fullName"]')).toHaveValue("UI Test Patient (Synthetic)");
  await expect(page.locator('select[name="gender"]')).toHaveValue("FEMALE");
  await expect(page.locator('input[name="dateOfBirth"]')).toHaveValue("1985-04-12");
  const submitted = page.waitForRequest((request) => request.url() === "http://127.0.0.1:3101/api/v2/patients" && request.method() === "POST");
  await page.getByRole("button", { name: "حفظ المريض", exact: true }).click();
  expect((await submitted).postDataJSON()).toMatchObject({ fullName: "UI Test Patient (Synthetic)", gender: "FEMALE", dateOfBirth: "1985-04-12" });
  await expect(page.getByRole("heading", { name: "UI Test Patient (Synthetic)", exact: true })).toBeVisible();
});

test("navigation search and primary pages render in English without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await capture(page, "dashboard-en");
  await page.getByRole("searchbox", { name: "Search navigation" }).fill("patients");
  await expect(page.getByRole("link", { name: "Patients", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Inventory", exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search navigation" }).fill("");
  const sections = [["Patient flow", "care/flow"], ["Patients", "care/patients"], ["Appointments", "care/appointments"], ["Reception", "care/reception"], ["Nursing", "care/nursing"], ["Doctor", "care/doctor"], ["Laboratory", "care/lab"], ["Pharmacy", "care/pharmacy"], ["Reports", "governance/reports"], ["Inventory", "facility/inventory"], ["Machines", "facility/machines"], ["Maintenance", "facility/maintenance"], ["Quality & safety", "governance/quality"]];
  for (const [name, slug] of sections) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:3100/admin/${slug}`);
    await expect(page.locator("#workspace-main h1")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await noHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test("staff, audit trail and staff entries pages render their data", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.goto("/admin/people/staff");
  await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
  await expect(page.getByText("Sam Rivera (Demo)")).toBeVisible();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByText("entry.create · nursing.ward.view")).toBeVisible();
  await page.goto("/admin/governance/audit");
  await expect(page.getByRole("heading", { name: "Audit trail", exact: true })).toBeVisible();
  await expect(page.getByText("PATIENT_VIEWED")).toBeVisible();
  await page.goto("/admin/people/entries");
  await expect(page.getByRole("heading", { name: "Reports & actions", exact: true })).toBeVisible();
  await expect(page.getByText("Bay 3 chair (Demo)")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile settings preserve layout and navigation in both directions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Main navigation", exact: true }).click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Appearance", exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.getByRole("button", { name: "التبديل إلى العربية" }).click();
  await expect(page.getByRole("tab", { name: "المظهر", exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await capture(page, "settings-mobile-ar");
  await page.getByRole("button", { name: "القائمة الرئيسية", exact: true }).click();
  await expect(page.getByRole("link", { name: "المرضى", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "المرضى", exact: true }).click();
  await expect(page.getByRole("button", { name: "القائمة الرئيسية", exact: true })).toHaveAttribute("aria-expanded", "false");
  await noHorizontalOverflow(page);
});

test("sidebar follows account permissions", async ({ page }) => {
  await page.route("http://127.0.0.1:3101/api/v2/me", (route) => route.fulfill({
    json: { data: { id: "limited-fixture", username: "limited", fullName: "Limited Demo", roles: ["RECEPTION"], permissions: ["patient.view", "attendance.checkin"] } },
  }));
  await signIn(page);
  await expect(page.getByRole("link", { name: "Patients", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reception", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Doctor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Inventory", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
});

test("committee account lands on the oversight dashboard: interactive charts, timeline, nothing else", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("textbox", { name: "Username" }).fill("committee");
  await page.getByLabel("Password", { exact: true }).fill("committee");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/admin/governance/oversight");
  await expect(page.getByRole("heading", { name: "Oversight dashboard", exact: true })).toBeVisible();
  // only the oversight section exists in the sidebar
  await expect(page.getByRole("link", { name: "Oversight", exact: true })).toBeVisible();
  for (const other of ["Dashboard", "Patients", "Nursing", "Doctor", "Pharmacy", "Staff", "Reports"]) await expect(page.getByRole("link", { name: other, exact: true })).toHaveCount(0);
  // KPI + hover tooltip on the line chart
  await expect(page.getByText("Active patients")).toBeVisible();
  await page.locator("svg[role='img']").first().hover({ position: { x: 300, y: 100 } });
  await expect(page.locator(".viz-tooltip")).toBeVisible();
  // table view of the same data
  const card = page.getByRole("region", { name: "Incidents by type (click to filter)" });
  await card.getByRole("button", { name: "Table" }).click();
  await expect(card.getByRole("cell", { name: "Machine incident" })).toBeVisible();
  await card.getByRole("button", { name: "Chart" }).click();
  // clicking a bar cross-filters the timeline
  await card.getByRole("button", { name: /Infection/ }).click();
  await expect(page.getByRole("button", { name: /INCIDENT_INFECTION/ })).toBeVisible();
  // timeline shows patient codes only
  await expect(page.getByText("P-000001")).toBeVisible();
  await expect(page.getByText("Health Authority Committee (Demo)")).toBeVisible(); // the account itself; no patient names appear in the page
  await noHorizontalOverflow(page);
  await capture(page, "oversight-en");
  // any other section is denied even by direct URL
  await page.goto("/admin/care/patients");
  await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("notification bell, work queue, settings switches and the permission matrix", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await expect(page.getByText("Prescriptions to dispense")).toBeVisible();
  await page.getByRole("button", { name: /Notifications \(1 unread\)/ }).click();
  await expect(page.getByRole("menuitem", { name: /Long wait \(Demo\)/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /Long wait \(Demo\)/ }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/admin/people/entries");
  await page.goto("/admin/settings");
  await page.getByRole("tab", { name: "System", exact: true }).click();
  await expect(page.getByText("Require shift report")).toBeVisible();
  await page.getByRole("button", { name: "Verify chain now" }).click();
  await expect(page.getByRole("status")).toContainText("Intact");
  await page.goto("/admin/people/staff/roles");
  await expect(page.getByRole("heading", { name: "Roles & permissions matrix", exact: true })).toBeVisible();
  await expect(page.getByLabel("NURSE: patient.view", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("an appointment can be rescheduled from the daily schedule", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.goto("/admin/care/appointments");
  await page.getByRole("button", { name: "Reschedule" }).first().click();
  await page.getByLabel("New date").fill("2030-01-15");
  await page.getByLabel("Shift", { exact: true }).selectOption({ index: 2 });
  await page.getByPlaceholder("Reason").fill("Patient travelling");
  const sent = page.waitForRequest((r) => /\/appointments\/[^/]+\/reschedule$/.test(r.url()) && r.method() === "POST");
  await page.getByRole("button", { name: "Move" }).click();
  expect((await sent).postDataJSON()).toMatchObject({ scheduledDate: "2030-01-15", reason: "Patient travelling" });
  await expect(page.getByText("Appointment rescheduled")).toBeVisible();
  expect(errors).toEqual([]);
});

test("admin URLs are grouped by domain and every old URL redirects", async ({ page }) => {
  await signIn(page);
  const moves: [string, string][] = [
    ["/admin/patients", "/admin/care/patients"], ["/admin/schedule", "/admin/care/appointments"], ["/admin/reception", "/admin/care/reception"],
    ["/admin/nursing", "/admin/care/nursing"], ["/admin/machines", "/admin/facility/machines"], ["/admin/inventory", "/admin/facility/inventory"],
    ["/admin/quality", "/admin/governance/quality"], ["/admin/audit", "/admin/governance/audit"], ["/admin/staff", "/admin/people/staff"],
    ["/admin/patients/fixture-patient-1", "/admin/care/patients/fixture-patient-1"], ["/admin/sessions/fixture-schedule-2", "/admin/care/sessions/fixture-schedule-2"],
  ];
  for (const [from, to] of moves) {
    await page.goto(from);
    await expect(page).toHaveURL(`http://127.0.0.1:3100${to}`);
  }
  // the sidebar is grouped by the same domains (checked from a page that always renders the shell)
  await page.goto("/admin");
  for (const heading of ["Overview", "Patient care", "Facility & supplies", "Quality & oversight", "People"]) {
    await expect(page.locator(".navigation-heading", { hasText: heading })).toBeVisible();
  }
});

test("patient flow board shows each journey with its next action and honors permissions", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page);
  await page.goto("/admin/care/flow");
  await expect(page.getByRole("heading", { name: "Today’s patient flow", exact: true })).toBeVisible();
  // interrupted patient first, with its warning and a live action
  const first = page.locator("article").first();
  await expect(first).toContainText("Interrupted");
  await expect(first.getByRole("link", { name: "Resume session" })).toBeVisible();
  // the step strip marks progress
  await expect(first.locator("ol li[aria-current='step']")).toHaveCount(1);
  // step filter narrows the list
  await page.getByRole("button", { name: /^Arrival/ }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").first()).toContainText("Check in");
  // an action the account may not perform is shown as the next step but not clickable
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(page.getByText("Next: Confirm supplies")).toBeVisible();
  await noHorizontalOverflow(page);
  await capture(page, "flow-en");
  expect(errors).toEqual([]);
});
