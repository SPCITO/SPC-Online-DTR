"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "react-hot-toast";

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [employee_id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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

  const addEmployee = async () => {
    if (!name || !employee_id || !password) {
      toast.error("Complete all fields");
      return;
    }

    try {
      setLoading(true);

      await api.addEmployee({
        name,
        employee_id,
        password,
      });

      toast.success("Employee added");

      setName("");
      setId("");
      setPassword("");

      fetchEmployees();
    } catch {
      toast.error("Failed to add employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-12 pb-32 px-6 shadow-xl">

        <div className="max-w-7xl mx-auto">

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-6 shadow-lg">

            <h1 className="text-4xl font-black text-white drop-shadow-md tracking-tight">
              Employees
            </h1>

            <p className="text-green-50/90 mt-1 text-sm font-medium">
              Manage employee accounts and access
            </p>

          </div>

        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-6 -mt-24 pb-16 space-y-8">

        {/* FORM */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border">

          <h2 className="text-xl font-bold text-green-800 mb-5">
            Add Employee
          </h2>

          <div className="grid md:grid-cols-4 gap-4">

            <input
              placeholder="Full Name"
              value={name}
              className="p-4 rounded-2xl border border-gray-300 text-gray-900 placeholder:text-gray-400 font-medium focus:ring-2 focus:ring-green-600 outline-none"
              onChange={(e) => setName(e.target.value)}
            />

            <input
              placeholder="Employee ID"
              value={employee_id}
              className="p-4 rounded-2xl border border-gray-300 text-gray-900 placeholder:text-gray-400 font-medium focus:ring-2 focus:ring-green-600 outline-none"
              onChange={(e) => setId(e.target.value)}
            />

            <input
              placeholder="Password"
              type="password"
              value={password}
              className="p-4 rounded-2xl border border-gray-300 text-gray-900 placeholder:text-gray-400 font-medium focus:ring-2 focus:ring-green-600 outline-none"
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={addEmployee}
              disabled={loading}
              className="
                bg-green-700 hover:bg-green-800
                text-white rounded-xl
                font-semibold transition
                active:scale-95
              "
            >
              {loading ? "Adding..." : "Add Employee"}
            </button>

          </div>

        </div>

        {/* TABLE */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border">

          <table className="w-full text-left">

            <thead className="bg-green-100/80 text-green-950 font-semibold">
              <tr>
                <th className="p-4">Name</th>
                <th>Employee ID</th>
                <th>Role</th>
              </tr>
            </thead>

            <tbody>
              {employees.length > 0 ? (
                employees.map((e, i) => (
                  <tr
                    key={i}
                    className="border-t hover:bg-green-50/50 transition"
                  >
                    <td className="p-5 font-semibold text-gray-900">
                      {e.name}
                    </td>

                    <td className="p-5 text-gray-800 font-medium">
                      {e.employee_id}
                    </td>

                    <td className="capitalize text-gray-800 font-medium">
                      {e.role}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="text-center p-6 text-gray-500"
                  >
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>

          </table>

        </div>

      </div>
    </div>
  );
}