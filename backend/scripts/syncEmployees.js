const db = require("../config/db");
const bcrypt = require("bcryptjs");

// ============================================================
// SPC Online DTR — Employee Synchronization
//
// Syncs application employee accounts from the school's
// dtr_user table. Handles:
//   - New user provisioning (SPC0 initial credential)
//   - Deactivation of inactive school users
//   - Reactivation of previously inactive school users
//
// Does NOT modify:
//   - dtr_user, dtr_entry, dtr_dept, dtr_org
//   - Existing passwords (unless admin reset)
//   - Existing usernames
//   - must_change_password for existing users
//   - Roles for existing users
// ============================================================

const INITIAL_PASSWORD = "SPC0";

const generateUsername = (fullname) => {
  return fullname
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
};

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });

const syncEmployees = async () => {
  try {
    // -------------------------------------------------------
    // STEP 1: Fetch all dtr_user records (active and inactive)
    // -------------------------------------------------------
    const allUsers = await query(`
      SELECT PK_user, fullname, isadmin, isactive
      FROM dtr_user
    `);

    const activeUsers = allUsers.filter((u) => u.isactive === 1);
    const inactiveUsers = allUsers.filter((u) => u.isactive === 0);

    let created = 0;
    let deactivated = 0;
    let reactivated = 0;
    let skipped = 0;

    // -------------------------------------------------------
    // STEP 2: Deactivate application accounts for inactive users
    // -------------------------------------------------------
    for (const user of inactiveUsers) {
      const result = await query(
        `UPDATE employees SET is_active = 0 WHERE dtr_user_id = ? AND is_active = 1`,
        [user.PK_user]
      );
      if (result.affectedRows > 0) {
        deactivated++;
        console.log(`⚪ Deactivated: ${user.fullname}`);
      }
    }

    // -------------------------------------------------------
    // STEP 3: Process active users (create new, reactivate existing)
    // -------------------------------------------------------
    for (const user of activeUsers) {
      const existing = await query(
        `SELECT id, is_active FROM employees WHERE dtr_user_id = ?`,
        [user.PK_user]
      );

      if (existing.length > 0) {
        // --- Existing account ---
        // Reactivate if previously deactivated
        if (existing[0].is_active === 0) {
          await query(
            `UPDATE employees SET is_active = 1 WHERE id = ?`,
            [existing[0].id]
          );
          reactivated++;
          console.log(`🔄 Reactivated: ${user.fullname}`);
        } else {
          skipped++;
        }
        // Do NOT modify: password, username, must_change_password,
        // role, active_session, session_expires_at
      } else {
        // --- New account ---
        const baseUsername = generateUsername(user.fullname);
        let username = baseUsername;

        // Ensure unique username
        let counter = 1;
        while (true) {
          const check = await query(
            `SELECT id FROM employees WHERE username = ?`,
            [username]
          );
          if (check.length === 0) break;
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Hash initial password — must_change_password forces change on first login
        const hashedPassword = await bcrypt.hash(INITIAL_PASSWORD, 10);

        await query(
          `INSERT INTO employees (
            dtr_user_id,
            name,
            username,
            password,
            role,
            must_change_password
          ) VALUES (?, ?, ?, ?, ?, TRUE)`,
          [
            user.PK_user,
            user.fullname,
            username,
            hashedPassword,
            user.isadmin ? "admin" : "employee",
          ]
        );

        created++;
        console.log(`✔ Created: ${user.fullname}`);
        console.log(`   Username: ${username}`);
      }
    }

    // -------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------
    console.log("\n========================================");
    console.log("✅ Employee sync completed!");
    console.log(`   Active dtr_user:   ${activeUsers.length}`);
    console.log(`   Inactive dtr_user: ${inactiveUsers.length}`);
    console.log(`   Created:           ${created}`);
    console.log(`   Reactivated:       ${reactivated}`);
    console.log(`   Deactivated:       ${deactivated}`);
    console.log(`   Skipped (existing): ${skipped}`);
    console.log("========================================\n");
  } catch (err) {
    console.error("Sync failed:", err);
  } finally {
    db.end();
  }
};

syncEmployees();