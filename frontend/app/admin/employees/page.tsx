"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-hot-toast";
import { motion } from "framer-motion";
import {
  Users,
  UserPlus,
  Upload,
  Shield,
  Search,
  ArrowLeft,
} from "lucide-react";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [empid, setEmpid] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [search, setSearch] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setEmployees([]);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  // -------------------------
  // ADD SINGLE EMPLOYEE
  // -------------------------
  const addEmployee = async () => {
    if (!name || !empid || !password) {
      toast.error("Complete all fields");
      return;
    }

    try {
      setLoading(true);

      await api.addEmployee({
        name,
        employee_id: empid,
        password,
      });

      toast.success("Employee added");

      setName("");
      setEmpid("");
      setPassword("");

      fetchEmployees();
    } catch {
      toast.error("Failed to add employee");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------
  // CSV IMPORT
  // -------------------------
  const handleCSVUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setCsvLoading(true);

      const text = await file.text();

      const rows = text
        .split("\n")
        .map((row) => row.trim())
        .filter(Boolean);

      // remove header
      const dataRows = rows.slice(1);

      let successCount = 0;

      for (const row of dataRows) {
        const [name, employee_id, password] = row.split(",");

        if (!name || !employee_id || !password) continue;

        try {
          await api.addEmployee({
            name: name.trim(),
            employee_id: employee_id.trim(),
            password: password.trim(),
          });

          successCount++;
        } catch (err) {
          console.error("CSV row failed:", row);
        }
      }

      toast.success(`${successCount} employees imported`);

      fetchEmployees();
    } catch (err) {
      console.error(err);
      toast.error("CSV import failed");
    } finally {
      setCsvLoading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // -------------------------
  // FILTERED EMPLOYEES
  // -------------------------
  const filteredEmployees = employees.filter(
    (e) =>
      e.name?.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_id
        ?.toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">

      {/* BACKGROUND GLOW */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-120px] left-[-120px] w-[320px] h-[320px] rounded-full bg-green-200/30 blur-3xl" />
        <div className="absolute bottom-[-120px] right-[-120px] w-[320px] h-[320px] rounded-full bg-emerald-200/30 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="
            bg-white/90
            backdrop-blur-2xl
            border border-white
            rounded-[34px]
            shadow-[0_12px_40px_rgba(0,0,0,0.08)]
            p-5 sm:p-7
          "
        >

          <div className="flex flex-col lg:flex-row gap-6 lg:items-center lg:justify-between">

            {/* LEFT */}
            <div>

              <div className="flex items-center gap-3 mb-3">

                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                  <Users className="text-green-700" size={22} />
                </div>

                <div>

                  <p className="text-xs uppercase tracking-[0.22em] text-gray-400">
                    Admin Management
                  </p>

                  <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
                    Employees
                  </h1>

                </div>

              </div>

              <p className="text-gray-500 text-sm sm:text-base">
                Manage employee accounts, credentials, and bulk imports.
              </p>

            </div>

            {/* ACTIONS */}
            <div className="flex flex-col sm:flex-row gap-4">

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => (window.location.href = "/admin")}
                className="
                  flex items-center justify-center gap-2

                  px-5 py-3

                  rounded-2xl

                  bg-white
                  border border-gray-200

                  text-gray-700
                  font-semibold

                  hover:shadow-lg
                  transition-all
                "
              >
                <ArrowLeft size={18} />
                Dashboard
              </motion.button>

            </div>

          </div>

        </motion.div>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-white/95
              rounded-[30px]
              border border-white
              shadow-[0_10px_40px_rgba(0,0,0,0.06)]
              p-6
            "
          >

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Total Employees
                </p>

                <h2 className="text-4xl font-black text-gray-900 mt-2">
                  {employees.length}
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
                <Users className="text-green-700" size={24} />
              </div>

            </div>

          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-white/95
              rounded-[30px]
              border border-white
              shadow-[0_10px_40px_rgba(0,0,0,0.06)]
              p-6
            "
          >

            <div className="flex items-center justify-between">

              <div>
                <p className="text-sm text-gray-500 font-medium">
                  Admin Protected
                </p>

                <h2 className="text-3xl font-black text-green-700 mt-2">
                  Secure
                </h2>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Shield className="text-emerald-700" size={24} />
              </div>

            </div>

          </motion.div>

          <motion.div
            whileHover={{ y: -4 }}
            className="
              bg-gradient-to-br
              from-green-600
              to-emerald-600

              rounded-[30px]

              shadow-[0_15px_40px_rgba(34,197,94,0.28)]

              p-6

              text-white
            "
          >

            <p className="text-sm text-white/80 font-medium">
              Bulk Import
            </p>

            <h2 className="text-3xl font-black mt-2">
              CSV Ready
            </h2>

            <p className="mt-3 text-sm text-white/80 leading-relaxed">
              Quickly upload hundreds of employees using CSV automation.
            </p>

          </motion.div>

        </div>

        {/* ADD EMPLOYEE + CSV */}
        <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 mt-8">

          {/* ADD FORM */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="
              bg-white/95
              backdrop-blur-2xl

              rounded-[34px]

              border border-white

              shadow-[0_12px_50px_rgba(0,0,0,0.08)]

              p-6 sm:p-7
            "
          >

            <div className="flex items-center gap-3 mb-6">

              <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
                <UserPlus className="text-green-700" size={22} />
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-gray-400">
                  Employee Registration
                </p>

                <h2 className="text-2xl font-black text-gray-900">
                  Add Employee
                </h2>
              </div>

            </div>

            <div className="grid md:grid-cols-3 gap-4">

              <input
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="
                  h-14

                  px-5

                  rounded-2xl

                  bg-gray-100/80

                  border border-gray-200

                  text-gray-900
                  placeholder:text-gray-400

                  outline-none

                  focus:ring-2
                  focus:ring-green-500
                "
              />

              <input
                placeholder="Employee ID"
                value={empid}
                onChange={(e) => setEmpid(e.target.value)}
                className="
                  h-14

                  px-5

                  rounded-2xl

                  bg-gray-100/80

                  border border-gray-200

                  text-gray-900
                  placeholder:text-gray-400

                  outline-none

                  focus:ring-2
                  focus:ring-green-500
                "
              />

              <input
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="
                  h-14

                  px-5

                  rounded-2xl

                  bg-gray-100/80

                  border border-gray-200

                  text-gray-900
                  placeholder:text-gray-400

                  outline-none

                  focus:ring-2
                  focus:ring-green-500
                "
              />

            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={addEmployee}
              disabled={loading}
              className="
                mt-5

                w-full sm:w-auto

                px-8 py-4

                rounded-2xl

                bg-gradient-to-r
                from-green-600
                to-emerald-600

                text-white
                font-bold

                shadow-[0_10px_30px_rgba(34,197,94,0.28)]

                hover:shadow-[0_15px_40px_rgba(34,197,94,0.38)]

                transition-all
              "
            >
              {loading ? "Adding Employee..." : "Add Employee"}
            </motion.button>

          </motion.div>

          {/* CSV IMPORT */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="
              bg-gradient-to-br
              from-green-600
              via-emerald-600
              to-green-700

              rounded-[34px]

              p-6 sm:p-7

              text-white

              shadow-[0_15px_45px_rgba(34,197,94,0.28)]

              relative overflow-hidden
            "
          >

            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />

            <div className="relative z-10">

              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
                <Upload size={26} />
              </div>

              <p className="text-sm uppercase tracking-[0.22em] text-white/70">
                CSV Automation
              </p>

              <h2 className="text-3xl font-black mt-2">
                Bulk Employee Import
              </h2>

              <p className="mt-4 text-white/80 leading-relaxed text-sm">
                Upload a CSV file to instantly create multiple employee accounts.
              </p>

              {/* CSV FORMAT */}
              <div className="mt-5 bg-white/10 border border-white/10 rounded-2xl p-4">

                <p className="text-xs uppercase tracking-[0.18em] text-white/60 mb-2">
                  Required CSV Format
                </p>

                <code className="text-sm text-white/90">
                  name,employee_id,password
                </code>

              </div>

              {/* HIDDEN INPUT */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />

              {/* BUTTON */}
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={csvLoading}
                className="
                  mt-6

                  w-full

                  px-6 py-4

                  rounded-2xl

                  bg-white

                  text-green-700
                  font-bold

                  hover:shadow-2xl

                  transition-all
                "
              >
                {csvLoading
                  ? "Importing CSV..."
                  : "Upload CSV File"}
              </motion.button>

            </div>

          </motion.div>

        </div>

        {/* EMPLOYEE TABLE */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="
            mt-8

            bg-white/95
            backdrop-blur-2xl

            rounded-[34px]

            border border-white

            shadow-[0_12px_50px_rgba(0,0,0,0.08)]

            overflow-hidden
          "
        >

          {/* HEADER */}
          <div
            className="
              flex flex-col lg:flex-row
              gap-5
              lg:items-center
              lg:justify-between

              p-6 sm:p-7

              border-b border-gray-100
            "
          >

            <div>

              <p className="text-xs uppercase tracking-[0.22em] text-gray-400 mb-2">
                Employee Directory
              </p>

              <h2 className="text-2xl font-black text-gray-900">
                Employee Accounts
              </h2>

            </div>

            {/* SEARCH */}
            <div
              className="
                flex items-center gap-3

                bg-gray-100/80

                px-4 py-3

                rounded-2xl

                border border-gray-200

                w-full lg:w-[320px]
              "
            >

              <Search size={18} className="text-gray-500" />

              <input
                type="text"
                placeholder="Search employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="
                  bg-transparent
                  outline-none
                  text-sm
                  text-gray-700
                  placeholder:text-gray-400
                  w-full
                "
              />

            </div>

          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">

            <table className="w-full min-w-[700px]">

              <thead>

                <tr className="border-b border-gray-100">

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Name
                  </th>

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Employee ID
                  </th>

                  <th className="px-6 py-5 text-left text-xs uppercase tracking-[0.2em] text-gray-400 font-semibold">
                    Role
                  </th>

                </tr>

              </thead>

              <tbody>

                {filteredEmployees.length > 0 ? (

                  filteredEmployees.map((e, i) => (

                    <tr
                      key={i}
                      className="
                        border-b border-gray-100/80
                        hover:bg-green-50/40
                        transition-all
                      "
                    >

                      <td className="px-6 py-5">

                        <div className="flex items-center gap-4">

                          <div
                            className="
                              w-11 h-11

                              rounded-2xl

                              bg-green-100

                              flex items-center justify-center

                              font-bold
                              text-green-700
                            "
                          >
                            {e.name?.charAt(0)}
                          </div>

                          <div>

                            <p className="font-bold text-gray-900">
                              {e.name}
                            </p>

                            <p className="text-sm text-gray-500">
                              Employee Account
                            </p>

                          </div>

                        </div>

                      </td>

                      <td className="px-6 py-5 font-semibold text-gray-700">
                        {e.employee_id}
                      </td>

                      <td className="px-6 py-5">

                        <span
                          className="
                            inline-flex items-center

                            px-4 py-2

                            rounded-full

                            bg-green-100

                            text-green-700

                            text-xs
                            font-bold
                            uppercase
                            tracking-[0.12em]
                          "
                        >
                          {e.role}
                        </span>

                      </td>

                    </tr>

                  ))

                ) : (

                  <tr>

                    <td
                      colSpan={3}
                      className="
                        px-6 py-12

                        text-center

                        text-gray-400
                        font-medium
                      "
                    >
                      No employees found
                    </td>

                  </tr>

                )}

              </tbody>

            </table>

          </div>

        </motion.div>

      </div>

    </div>
  );
}