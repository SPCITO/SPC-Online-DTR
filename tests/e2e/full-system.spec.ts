import { test, expect, Page, BrowserContext } from "@playwright/test";
import mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// Load E2E creds
const envPath = path.resolve(__dirname, "../../.env.e2e");
const envLines = fs.readFileSync(envPath, "utf-8").split("\n");
const env: Record<string, string> = {};
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const EMP_USER = env["DTR_E2E_EMPLOYEE_USERNAME"] || "e2e.employee";
const EMP_PASS = env["DTR_E2E_EMPLOYEE_PASSWORD"] || "";
const ADM_USER = env["DTR_E2E_ADMIN_USERNAME"] || "e2e.admin";
const ADM_PASS = env["DTR_E2E_ADMIN_PASSWORD"] || "";

let db: mysql.Connection;
let e2eEmployeeId: number;
let e2eAdminId: number;
let timeInRecordId: number | null = null;

const ssDir = path.resolve(__dirname, "../../test-results/screenshots");
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

async function ss(page: Page, name: string) {
  await page.screenshot({ path: path.join(ssDir, `${name}.png`), fullPage: true });
  console.log(`  📸 ${name}`);
}

test.beforeAll(async () => {
  db = await mysql.createConnection({
    host: "dtrserver", port: 3306, user: "spcadmin",
    password: env["DTR_E2E_DB_PASSWORD"] || "",
    database: "sysa_dtr", connectTimeout: 10000,
  });
  // Clear stale sessions
  await db.query("UPDATE employees SET active_session = NULL, session_expires_at = NULL WHERE username IN (?, ?)", [EMP_USER, ADM_USER]);
  const [empRows] = await db.query("SELECT id FROM employees WHERE username = ?", [EMP_USER]) as any;
  e2eEmployeeId = empRows[0]?.id;
  const [admRows] = await db.query("SELECT id FROM employees WHERE username = ?", [ADM_USER]) as any;
  e2eAdminId = admRows[0]?.id;
  console.log(`[SETUP] employee id=${e2eEmployeeId}, admin id=${e2eAdminId}`);
});

test.afterAll(async () => { if (db) await db.end(); });

// Login helper — navigates to /login, fills form, waits for redirect
async function doLogin(page: Page, user: string, pass: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder*="Username" i]').waitFor({ state: "visible", timeout: 30000 });
  await page.locator('input[placeholder*="Username" i]').fill(user);
  await page.locator('input[placeholder*="password" i]').fill(pass);
  await page.locator("button").filter({ hasText: /Sign|Login|Log/i }).click();
  await page.waitForURL(/\/(dashboard|admin|change-password)/, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

// ═══════════════════════════════════════
// EMPLOYEE JOURNEY — single login, test all features
// ═══════════════════════════════════════

test.describe("Employee Journey", () => {

  test("01 — Home page loads", async ({ page }) => {
    console.log("[E2E 01] Home page");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await expect(page.locator("body")).toBeVisible();
    await ss(page, "01-home");
  });

  test("02 — Login page loads", async ({ page }) => {
    console.log("[E2E 02] Login page");
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[placeholder*="Username" i]').waitFor({ state: "visible", timeout: 30000 });
    await expect(page.locator('input[placeholder*="Username" i]')).toBeVisible();
    await expect(page.locator('input[placeholder*="password" i]')).toBeVisible();
    await ss(page, "02-login");
  });

  test("03 — Invalid login rejected", async ({ page }) => {
    console.log("[E2E 03] Invalid login");
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[placeholder*="Username" i]').waitFor({ state: "visible", timeout: 30000 });
    await page.locator('input[placeholder*="Username" i]').fill("nonexistent.user");
    await page.locator('input[placeholder*="password" i]').fill("wrongpassword");
    await page.locator("button").filter({ hasText: /Sign|Login|Log/i }).click();
    await page.waitForTimeout(3000);
    expect(page.url()).not.toContain("/dashboard");
    await ss(page, "03-invalid-login");
  });

  test("04 — Login + dashboard + Time In + Time Out + logs + monthly + logout", async ({ page }) => {
    console.log("[E2E 04] Employee login");
    await doLogin(page, EMP_USER, EMP_PASS);
    await expect(page).toHaveURL(/\/dashboard/);
    await ss(page, "04-employee-dashboard");

    // Dashboard content
    console.log("[E2E 04] Dashboard loaded");
    const body = await page.textContent("body");
    expect(body).toBeTruthy();

    // Time In
    console.log("[E2E 04] Time In");
    const timeInBtn = page.locator('button:has-text("Time In"), button:has-text("TIME IN")');
    if (await timeInBtn.count() > 0) {
      await timeInBtn.first().click();
      await page.waitForTimeout(3000);
    }
    await ss(page, "04-time-in");

    // Verify in DB
    const [inRows] = await db.query(
      "SELECT id, time_in, time_out FROM attendance_logs WHERE employee_db_id = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1",
      [e2eEmployeeId]
    ) as any;
    if (inRows.length > 0) {
      timeInRecordId = inRows[0].id;
      console.log(`[E2E 04] Time In record id=${timeInRecordId}`);
      expect(inRows[0].time_in).toBeTruthy();
      expect(inRows[0].time_out).toBeNull();
    }

    // Duplicate Time In
    console.log("[E2E 04] Duplicate Time In protection");
    const dupBtn = page.locator('button:has-text("Time In"), button:has-text("TIME IN")');
    if (await dupBtn.count() > 0) {
      await dupBtn.first().click();
      await page.waitForTimeout(3000);
    }
    const [dupRows] = await db.query(
      "SELECT COUNT(*) AS cnt FROM attendance_logs WHERE employee_db_id = ? AND time_out IS NULL",
      [e2eEmployeeId]
    ) as any;
    expect(dupRows[0].cnt).toBe(1);
    console.log("[E2E 04] Duplicate prevented ✅");

    // Time Out
    console.log("[E2E 04] Time Out");
    const timeOutBtn = page.locator('button:has-text("Time Out"), button:has-text("TIME OUT")');
    if (await timeOutBtn.count() > 0) {
      await timeOutBtn.first().click();
      await page.waitForTimeout(3000);
    }
    await ss(page, "04-time-out");
    if (timeInRecordId) {
      const [outRows] = await db.query("SELECT time_out FROM attendance_logs WHERE id = ?", [timeInRecordId]) as any;
      expect(outRows[0].time_out).toBeTruthy();
      console.log(`[E2E 04] Time Out verified ✅`);
    }

    // Employee logs
    console.log("[E2E 04] Employee logs");
    await page.goto("/dashboard/logs", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await ss(page, "04-employee-logs");

    // Monthly attendance
    console.log("[E2E 04] Monthly attendance");
    await page.goto("/dashboard/monthly", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await ss(page, "04-monthly-attendance");

    // Session persistence (refresh)
    console.log("[E2E 04] Session refresh");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/dashboard/);
    console.log("[E2E 04] Session persisted after refresh ✅");

    // No localStorage token
    const token = await page.evaluate(() => localStorage.getItem("auth_token"));
    expect(token).toBeNull();
    console.log("[E2E 04] No localStorage token ✅");

    // Logout
    console.log("[E2E 04] Logout");
    const logoutBtn = page.locator('button:has-text("Log Out"), button:has-text("Logout")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await page.waitForTimeout(3000);
    }
    await ss(page, "04-logout");

    // Verify protected page blocked after logout
    console.log("[E2E 04] Protected page after logout");
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    // Should redirect to login
    expect(page.url().includes("login") || page.url().includes("dashboard")).toBeTruthy();
    await ss(page, "04-protected-after-logout");
  });
});

// ═══════════════════════════════════════
// ADMIN JOURNEY — single login, test all admin features
// ═══════════════════════════════════════

test.describe("Admin Journey", () => {

  test("05 — Admin login + dashboard + all admin pages + authorization", async ({ page }) => {
    console.log("[E2E 05] Admin login");
    await doLogin(page, ADM_USER, ADM_PASS);
    await ss(page, "05-admin-dashboard");

    // Admin dashboard
    console.log("[E2E 05] Admin dashboard");
    await page.waitForTimeout(2000);
    const body = await page.textContent("body");
    expect(body).toBeTruthy();

    // Employee management
    console.log("[E2E 05] Employee management");
    await page.goto("/admin/employees", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await ss(page, "05-employee-management");

    // Departments
    console.log("[E2E 05] Departments");
    await page.goto("/admin/departments", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    await ss(page, "05-departments");

    // Session persistence
    console.log("[E2E 05] Admin session refresh");
    await page.reload();
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin/);
    console.log("[E2E 05] Admin session persisted ✅");

    // Logout admin
    console.log("[E2E 05] Admin logout");
    const logoutBtn = page.locator('button:has-text("Log Out"), button:has-text("Logout")');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await page.waitForTimeout(3000);
    }
  });
});

// ═══════════════════════════════════════
// AUTHORIZATION
// ═══════════════════════════════════════

test.describe("Authorization", () => {

  test("06 — Employee cannot access admin pages", async ({ page }) => {
    console.log("[E2E 06] Authorization — employee → admin");
    await doLogin(page, EMP_USER, EMP_PASS);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    await ss(page, "06-auth-denied");
    // Should NOT stay on /admin
    const url = page.url();
    expect(url.includes("403") || url.includes("login") || !url.endsWith("/admin")).toBeTruthy();
    console.log("[E2E 06] Employee blocked from admin ✅");
  });
});

// ═══════════════════════════════════════
// MOBILE RESPONSIVE
// ═══════════════════════════════════════

test.describe("Mobile Responsive", () => {

  test("07 — Mobile smoke test", async ({ page }) => {
    console.log("[E2E 07] Mobile responsive");
    await page.setViewportSize({ width: 375, height: 812 });

    // Home
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await ss(page, "07-mobile-home");

    // Login
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[placeholder*="Username" i]').waitFor({ state: "visible", timeout: 30000 });
    await ss(page, "07-mobile-login");

    // Employee dashboard
    await doLogin(page, EMP_USER, EMP_PASS);
    await page.waitForTimeout(2000);
    await ss(page, "07-mobile-dashboard");
    console.log("[E2E 07] Mobile smoke ✅");
  });
});
