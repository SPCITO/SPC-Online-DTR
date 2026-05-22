const db = require("../config/db");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "generated_credentials.txt");

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
    const users = await query(`
      SELECT *
      FROM dtr_user
      WHERE isactive = 1
    `);

    for (let i = 0; i < users.length; i++) {
      const user = users[i];

      // skip if already synced
      const exists = await query(
        `SELECT id FROM employees WHERE dtr_user_id = ?`,
        [user.PK_user]
      );

      if (exists.length > 0) continue;

      const baseUsername = generateUsername(user.fullname);
      let username = baseUsername;

      // ensure unique username
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

      // generate password
      const tempPassword = `SPC${user.empid}`;
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      await query(
        `
        INSERT INTO employees (
          dtr_user_id,
          name,
          username,
          password,
          role
        ) VALUES (?, ?, ?, ?, ?)
        `,
        [
          user.PK_user,
          user.fullname,
          username,
          hashedPassword,
          user.isadmin ? "admin" : "employee",
        ]
      );

      console.log(`✔ Created: ${user.fullname}`);
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${tempPassword}`);

      fs.appendFileSync(
        logFile,
        `${user.fullname} | ${username} | ${tempPassword}\n`
      );
    }

    console.log("\n✅ Employee sync completed!");
    console.log(`Credentials saved to: ${logFile}`);
  } catch (err) {
    console.error("Sync failed:", err);
  }
};

syncEmployees();