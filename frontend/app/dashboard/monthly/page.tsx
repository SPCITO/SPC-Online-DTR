"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function MonthlyDashboard() {
  const [user, setUser] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  // -----------------------
  // LOAD USER
  // -----------------------
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  // -----------------------
  // FETCH DATA
  // -----------------------
  const fetchMonthly = async () => {
    if (!user) return;

    const res = await api.getMonthlyLogs(
      user.employee_id,
      currentDate.getFullYear(),
      currentDate.getMonth() + 1
    );

    setData(res);
  };

  useEffect(() => {
    if (user) fetchMonthly();
  }, [
    user,
    currentDate.getFullYear(),
    currentDate.getMonth(),
  ]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-green-800">
        Loading monthly attendance...
      </div>
    );
  }

  // -----------------------
  // CALENDAR SETUP
  // -----------------------
  const monthStart = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );

  const monthEnd = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  );

  const startDay = monthStart.getDay();
  const totalDays = monthEnd.getDate();

  const daysArray: (number | null)[] = [];

  for (let i = 0; i < startDay; i++) daysArray.push(null);
  for (let i = 1; i <= totalDays; i++) daysArray.push(i);

  // -----------------------
  // HELPERS
  // -----------------------
  const getDayRecord = (day: number) => {
    const fullDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    return data.days.find(
      (d: any) =>
        new Date(d.date).toDateString() === fullDate.toDateString()
    );
  };

  const isPastDay = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const isWeekday = (date: Date) => {
    const d = date.getDay();
    return d !== 0 && d !== 6;
  };

  const isLate = (date: string) => {
    const d = new Date(date);
    return (
      d.getHours() > 8 ||
      (d.getHours() === 8 && d.getMinutes() > 30)
    );
  };

  const getDayColor = (day: number, record: any) => {
    const fullDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    const past = isPastDay(fullDate);
    const weekday = isWeekday(fullDate);

    if (!record && past && weekday)
      return "bg-red-100 text-red-600";

    if (!record)
      return "bg-gray-100 text-gray-400";

    if (isLate(record.first_in))
      return "bg-yellow-200 text-yellow-800";

    return "bg-green-200 text-green-800";
  };

  const getTooltip = (day: number, record: any) => {
    const fullDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      day
    );

    if (!isWeekday(fullDate)) return "Weekend";
    if (!isPastDay(fullDate)) return "Future date";
    if (!record) return "Absent";

    return isLate(record.first_in) ? "Late" : "Present";
  };

  const progress =
    (parseFloat(data.summary.total_hours) / 160) * 100;

  // -----------------------
  // UI
  // -----------------------
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-green-700 pt-10 pb-28 px-6 shadow-xl">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-white">
              Monthly Attendance
            </h1>
            <p className="text-green-200 text-sm">
              Track your attendance performance
            </p>
          </div>

          <button
            onClick={() => (window.location.href = "/dashboard")}
            className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition"
          >
            ← Dashboard
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 flex justify-center px-6 -mt-20 pb-16">
        <div className="w-full max-w-5xl space-y-6">

          {/* SUMMARY */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow">
              <p className="text-gray-500 text-sm">Total Hours</p>
              <h2 className="text-2xl font-bold text-green-700">
                {data.summary.total_hours}
              </h2>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow">
              <p className="text-gray-500 text-sm">Late Days</p>
              <h2 className="text-2xl font-bold text-yellow-600">
                {data.summary.late_days}
              </h2>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow">
              <p className="text-gray-500 text-sm">Days Worked</p>
              <h2 className="text-2xl font-bold text-green-700">
                {data.summary.total_days}
              </h2>
            </div>
          </div>

          {/* PROGRESS */}
          <div className="bg-white p-5 rounded-2xl shadow">
            <p className="text-sm text-gray-500 mb-2">
              Monthly Progress
            </p>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-green-600 h-3 rounded-full"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-xs mt-2 text-gray-500">
              {progress.toFixed(1)}% of 160 hours
            </p>
          </div>

            <p className="text-sm text-gray-500 mb-2">
              Select a date to view attendance details
            </p>
            
          {/* CALENDAR */}
          <div className="bg-white p-5 rounded-2xl shadow">

            {/* NAV */}
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() - 1
                    )
                  )
                }
                className="px-3 py-1 bg-green-500 rounded-lg"
              >
                ←
              </button>

              <h2 className="font-semibold text-green-800">
                {currentDate.toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>

              <button
                onClick={() =>
                  setCurrentDate(
                    new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + 1
                    )
                  )
                }
                className="px-3 py-1 bg-green-500 rounded-lg"
              >
                →
              </button>
            </div>

            {/* WEEK */}
            <div className="grid grid-cols-7 text-xs text-gray-400 text-center mb-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* GRID */}
            <div className="grid grid-cols-7 gap-2">
              {daysArray.map((day, i) => {
                if (!day) return <div key={i} />;

                const record = getDayRecord(day);
                const color = getDayColor(day, record);
                const tooltip = getTooltip(day, record);

                const isSelected =
                  selectedDay &&
                  new Date(selectedDay.date).getDate() === day;

                return (
                  <div key={i} className="relative group">
                    <button
                      onClick={() => setSelectedDay(record)}
                      className={`
                        h-12 w-full rounded-lg border text-sm font-semibold
                        flex items-center justify-center
                        transition hover:scale-105
                        ${color}
                        ${isSelected ? "ring-2 ring-green-700 scale-105" : ""}
                      `}
                    >
                      {day}
                    </button>

                    {/* TOOLTIP */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block text-xs bg-black text-white px-2 py-1 rounded">
                      {tooltip}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* LEGEND */}
            <div className="flex gap-4 mt-4 text-sm text-gray-800 font-medium">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-500 rounded-full" />
                Present
              </div>

              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-yellow-400 rounded-full" />
                Late
              </div>

              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-500 rounded-full" />
                Absent
              </div>
            </div>

            </div>

            {/* SELECTED DAY */}
            <div className="bg-white p-5 rounded-2xl shadow">
              {selectedDay ? (
                <>
                  <h2 className="text-lg font-bold text-green-800">
                    {new Date(selectedDay.date).toLocaleDateString()}
                  </h2>

                  <p className="text-sm mt-2 text-gray-800 font-medium">
                    Status:{" "}
                    {isLate(selectedDay.first_in)
                      ? "Late"
                      : "On Time"}
                  </p>

                  <p className="text-sm text-gray-800 font-medium">
                    Time In:{" "}
                    {new Date(
                      selectedDay.first_in
                    ).toLocaleTimeString()}
                  </p>

                  <p className="text-sm text-gray-800 font-medium">
                    Time Out:{" "}
                    {selectedDay.last_out
                      ? new Date(
                          selectedDay.last_out
                        ).toLocaleTimeString()
                      : "—"}
                  </p>

                  <p className="text-sm text-gray-800 font-medium">
                    Hours: {selectedDay.hours}
                  </p>
                </>
              ) : (
                <p className="text-gray-500 text-sm">
                  Click a date to view details
                </p>
              )}
            </div>

        </div>
      </div>
    </div>
  );
}