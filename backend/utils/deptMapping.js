// Centralized Department Configuration
// This ensures consistent department IDs and names across the entire application

const departmentMap = {
  1: {
    id: 1,
    name: "Basic Education",
    displayName: "Basic Ed",
    code: "BE",
  },
  2: {
    id: 2,
    name: "Collegiate",
    displayName: "Collegiate",
    code: "COL",
  },
  3: {
    id: 3,
    name: "Administrative / Personnel",
    displayName: "Admin-Personnel",
    code: "ADMIN",
  },
  4: {
    id: 4,
    name: "Student Assistant",
    displayName: "Student Assistant",
    code: "SA",
  },
};

// Get department by ID
const getDepartmentById = (id) => {
  return departmentMap[id] || null;
};

// Get all departments as array (sorted by ID for consistency)
const getAllDepartments = () => {
  return Object.values(departmentMap).sort((a, b) => a.id - b.id);
};

// Get department name by ID (full name)
const getDepartmentName = (id) => {
  return departmentMap[id]?.name || "Unknown Department";
};

// Get display name by ID (shorter version for UI)
const getDepartmentDisplayName = (id) => {
  return departmentMap[id]?.displayName || "Unknown";
};

// Get department code by ID (for filenames, etc.)
const getDepartmentCode = (id) => {
  return departmentMap[id]?.code || "UNK";
};

// Sanitize string for filenames (remove special characters)
const sanitizeForFilename = (str) => {
  return str
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
};

// Generate standardized filename for exports
const generateExportFilename = ({
  type = "report",
  departmentId,
  dateRange,
  extension = "xlsx",
}) => {
  const parts = ["dtr-export"];

  if (departmentId) {
    const deptCode = getDepartmentCode(departmentId);
    parts.push(deptCode);
  }

  if (dateRange) {
    parts.push(dateRange);
  }

  parts.push(type);

  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  parts.push(timestamp);

  return `${parts.join("-")}.${extension}`;
};

module.exports = {
  departmentMap,
  getDepartmentById,
  getAllDepartments,
  getDepartmentName,
  getDepartmentDisplayName,
  getDepartmentCode,
  sanitizeForFilename,
  generateExportFilename,
};