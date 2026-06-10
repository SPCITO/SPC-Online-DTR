"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  Users,
  UserPlus,
  Search,
  Building2,
  ChevronDown,
  MoreHorizontal,
  Mail,
  Loader2,
  Edit2,
  Trash2,
  Power,
  X,
  Check,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  email: string | null;
  employee_id: string | null;
  department_name?: string | null;
  role: string;
  is_active: number; // 1 or 0
  created_at: string;
}

export default function EmployeesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(5); 
  const [hasMore, setHasMore] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);

  // Modal State
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Role Guard
  useEffect(() => {
    if (!authLoading) {
      if (!user || user.role !== "admin") {
        router.replace(user ? "/403" : "/login");
      }
    }
  }, [user, authLoading, router]);

  // ✅ FIX 1: Debounce Search Input Only
  // This updates debouncedSearch ONLY when the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset to page 1 when search term changes
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ✅ FIX 2: Fetch Data based on Page OR DebouncedSearch changes
  // We explicitly depend on [debouncedSearch, page]
  useEffect(() => {
    // Prevent fetching if we are just waiting for the debounce to finish on mount
    // But we DO want to fetch immediately if debouncedSearch is empty (initial load)
    
    const loadData = async () => {
      if (page === 1) {
        setLoading(true);
        setEmployees([]); // Clear list for new search/page 1
      } else {
        setFetchingMore(true);
      }

      try {
        const data = await api.getEmployees({ 
          page: page, 
          limit, 
          search: debouncedSearch 
        });

        const newEmployees: Employee[] = (data as any).formattedRows || [];

        if (newEmployees.length === 0 || newEmployees.length < limit) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }

        setEmployees((prev) => {
          if (page === 1) return newEmployees;
          
          // Deduplicate for "Load More"
          const existingIds = new Set(prev.map(e => String(e.id)));
          const uniqueNew = newEmployees.filter(e => !existingIds.has(String(e.id)));
          return [...prev, ...uniqueNew];
        });

      } catch (err) {
        console.error("Failed to fetch employees:", err);
      } finally {
        setLoading(false);
        setFetchingMore(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, page, limit]);

  const handleLoadMore = () => {
    if (!fetchingMore && hasMore) {
      setPage((prev) => prev + 1);
    }
  };

  // --- Actions Handlers ---

  const handleEditClick = (emp: Employee) => {
    setEditingEmployee({ ...emp });
    setIsModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    setActionLoading(true);
    try {
      await api.updateEmployee(editingEmployee.id, {
        name: editingEmployee.name,
        employee_id: editingEmployee.employee_id,
        email: editingEmployee.email,
        role: editingEmployee.role,
        is_active: editingEmployee.is_active
      });

      setEmployees(prev => prev.map(emp => emp.id === editingEmployee.id ? editingEmployee : emp));
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to update employee");
    } finally {
      setActionLoading(false);
    }
  };

  const toggleStatus = async (emp: Employee) => {
    if (!confirm(`Are you sure you want to ${emp.is_active ? 'disable' : 'enable'} ${emp.name}?`)) return;

    try {
      const newStatus = emp.is_active ? 0 : 1;
      await api.updateEmployee(emp.id, { is_active: newStatus });

      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: newStatus } : e));
    } catch (err: any) {
      alert(err.message || "Failed to update status");
    }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`WARNING: This will permanently delete ${emp.name}. This action cannot be undone.`)) return;

    try {
      await api.deleteEmployee(emp.id);
      setEmployees(prev => prev.filter(e => e.id !== emp.id));
    } catch (err: any) {
      alert(err.message || "Failed to delete employee");
    }
  };

  // Calculate stats safely
  const totalLoaded = employees.length;
  const activeCount = employees.filter(e => e.is_active === 1).length;
  const adminCount = employees.filter(e => e.role === 'admin').length;

  if (authLoading || (loading && employees.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-gray-500 font-medium">Loading workforce...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7f5] overflow-x-hidden">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] bg-blue-200/30 blur-3xl rounded-full" />
        <div className="absolute bottom-[-100px] left-[-100px] w-[400px] h-[400px] bg-emerald-200/30 blur-3xl rounded-full" />
      </div>

      <div className="relative px-6 lg:px-8 py-8 lg:py-12">
        <div className="max-w-7xl mx-auto space-y-8">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4">
                <Users size={14} /> Workforce Management
              </div>
              <h1 className="text-4xl lg:text-5xl font-black text-gray-900 tracking-tight">Employees</h1>
              <p className="mt-2 text-gray-500 text-lg">Manage staff, access roles, and account status.</p>
            </div>
            <button onClick={() => router.push('/admin/employees/new')} className="group flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-full font-semibold shadow-lg shadow-gray-900/20 transition-all hover:scale-105 active:scale-95">
              <UserPlus size={18} /> <span>Add Employee</span>
            </button>
          </motion.div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <motion.div whileHover={{ y: -4 }} className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-100/50 blur-2xl rounded-full -mr-8 -mt-8" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600"><Users size={24} /></div>
                <div><p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Loaded</p><h2 className="text-3xl font-black text-gray-900">{totalLoaded}</h2></div>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -4 }} className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-100/50 blur-2xl rounded-full -mr-8 -mt-8" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center text-green-600"><Check size={24} /></div>
                <div><p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Active Accounts</p><h2 className="text-3xl font-black text-gray-900">{activeCount}</h2></div>
              </div>
            </motion.div>
            <motion.div whileHover={{ y: -4 }} className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50 border border-white">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-100/50 blur-2xl rounded-full -mr-8 -mt-8" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600"><ShieldCheck size={24} /></div>
                <div><p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Admins</p><h2 className="text-3xl font-black text-gray-900">{adminCount}</h2></div>
              </div>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} onClick={() => router.push('/admin/departments')} className="cursor-pointer group relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 shadow-xl shadow-gray-900/20 flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><Building2 size={24} className="text-white" /></div>
              <h3 className="text-white font-bold">Manage Depts</h3><p className="text-gray-400 text-xs mt-1">View structure</p>
            </motion.div>
          </div>

          {/* Main Table Section */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="relative overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50 border border-white flex flex-col">
            {/* Toolbar */}
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-xl font-bold text-gray-900">Directory</h3>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search name, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm text-gray-900 placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Table Container - Internal Scroll */}
            <div className="relative w-full overflow-y-auto" style={{ maxHeight: '500px' }}>
              <table className="w-full min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">Employee</th>
                    <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">ID / Email</th>
                    <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">Role</th>
                    <th className="px-6 py-4 text-left text-xs uppercase tracking-wider text-gray-500 font-bold">Status</th>
                    <th className="px-6 py-4 text-right text-xs uppercase tracking-wider text-gray-500 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <AnimatePresence>
                    {employees.length > 0 ? (
                      employees.map((emp) => (
                        <motion.tr key={`emp-${emp.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="group hover:bg-gray-50/80 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${emp.is_active ? 'bg-gradient-to-br from-emerald-100 to-blue-100 text-emerald-700' : 'bg-gray-100 text-gray-400 grayscale'}`}>
                                {emp.name.charAt(0)}
                              </div>
                              <div>
                                <p className={`font-semibold ${emp.is_active ? 'text-gray-900' : 'text-gray-400'}`}>{emp.name}</p>
                                <p className="text-xs text-gray-500">Joined {new Date(emp.created_at).toLocaleDateString()}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-mono text-gray-600">{emp.employee_id || 'N/A'}</span>
                              <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} /> {emp.email || 'No Email'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                              <ShieldCheck size={12} className="mr-1.5" /> {emp.role.charAt(0).toUpperCase() + emp.role.slice(1)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${emp.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                              {emp.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => handleEditClick(emp)} className="p-2 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                <Edit2 size={18} />
                              </button>
                              <button onClick={() => toggleStatus(emp)} className={`p-2 rounded-lg transition-colors ${emp.is_active ? 'hover:bg-orange-50 text-gray-400 hover:text-orange-600' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`} title={emp.is_active ? "Disable" : "Enable"}>
                                <Power size={18} />
                              </button>
                              <button onClick={() => handleDelete(emp)} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500"><div className="flex flex-col items-center gap-2"><Search size={32} className="opacity-20" /><p>{loading ? "Searching..." : "No employees found."}</p></div></td></tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Load More Footer */}
            {hasMore && !loading && (
              <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-center">
                <button onClick={handleLoadMore} disabled={fetchingMore} className="flex items-center gap-2 px-6 py-2 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-600 hover:text-emerald-600 hover:border-emerald-200 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {fetchingMore ? <Loader2 size={16} className="animate-spin" /> : <><>Load More Employees</> <ChevronDown size={16} /></>}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* EDIT MODAL */}
      <AnimatePresence>
        {isModalOpen && editingEmployee && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Edit2 size={18} className="text-blue-600"/> Edit Employee</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
              </div>
              
              <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                    <input required value={editingEmployee.name} onChange={e => setEditingEmployee({...editingEmployee, name: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Employee ID</label>
                    <input required value={editingEmployee.employee_id || ''} onChange={e => setEditingEmployee({...editingEmployee, employee_id: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                  <input type="email" value={editingEmployee.email || ''} onChange={e => setEditingEmployee({...editingEmployee, email: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Role</label>
                    <select value={editingEmployee.role} onChange={e => setEditingEmployee({...editingEmployee, role: e.target.value})} className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                    <div className="flex items-center gap-2 mt-2">
                      <button type="button" onClick={() => setEditingEmployee({...editingEmployee, is_active: 1})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editingEmployee.is_active === 1 ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'bg-gray-100 text-gray-500'}`}>Active</button>
                      <button type="button" onClick={() => setEditingEmployee({...editingEmployee, is_active: 0})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${editingEmployee.is_active === 0 ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-gray-100 text-gray-500'}`}>Disabled</button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
                  <button type="submit" disabled={actionLoading} className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex justify-center">
                    {actionLoading ? <Loader2 className="animate-spin" /> : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}