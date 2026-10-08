// M.69 — shared attendance source types (additive; existing pages keep
// their inline shapes until they migrate).

export type SourceMode = "online" | "biometrics" | "both";
export type SourceKind = "ONLINE_DTR" | "BIOMETRICS";

export interface SourceSession {
  source: SourceKind;
  source_id: number;
  id?: number;
  employee_db_id?: number;
  employee_id?: string | null;
  role?: string | null;
  name?: string | null;
  department_id?: number | null;
  date: string; // "YYYY-MM-DD" — Manila attendance day
  time_in: string | null;
  time_out: string | null;
  closed_by?: "user" | "auto" | "admin" | null;
  status?: string;
  pending?: boolean;
  no_time_out?: boolean;
}

export type ReconciliationState =
  | "MATCHED"
  | "BIOMETRIC_ONLY"
  | "ONLINE_ONLY"
  | "TIME_MISMATCH"
  | "MISSING_TIMEOUT"
  | "DUPLICATE_CANDIDATE";

export interface ReconciliationInfo {
  state: ReconciliationState;
  flags: string[];
}

export interface SummaryGroup {
  employee_db_id: number;
  employee_id?: string | null;
  role?: string | null;
  name: string | null;
  department_id: number | null;
  date: string;
  online: SourceSession[];
  biometrics: SourceSession[];
  reconciliation: ReconciliationInfo;
}

export interface SummaryResponse {
  groups: SummaryGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
