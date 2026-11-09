// ============================================================
// SPC Online DTR — Identity-aware attendance log search (P1-1).
//
// Two ID namespaces exist and must never be conflated:
//   employees.id / attendance_logs.employee_db_id — APP account id
//   dtr_user.PK_user / employees.dtr_user_id      — SCHOOL DTR identity
//
// A bare number is ambiguous across them (the ranges overlap), so the
// admin log search accepts an explicit namespace via `id_space`:
//
//   (omitted)       — legacy semantics, unchanged: a numeric term matches
//                     the display name OR the APP account id. Never the
//                     school namespace.
//   `app_id`        — exact attendance_logs.employee_db_id match.
//   `school_dtr_id` — resolved through employees.dtr_user_id FIRST; the
//                     school number is never compared to employee_db_id.
//                       missing mapping    -> empty result (documented)
//                       duplicate mapping  -> 409 style error (never an
//                                             arbitrary account pick)
//
// The resolver takes an injectable query function so the identity logic
// can be regression-tested without a database connection.
// ============================================================

const ID_SPACE = {
  LEGACY: "legacy",
  APP: "app_id",
  SCHOOL: "school_dtr_id",
};

const NAME_FILTER = `COALESCE(d.fullname, e.name) LIKE ?`;

/** Validate the `id_space` query parameter. Missing/blank -> legacy. */
function parseIdSpace(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: ID_SPACE.LEGACY };
  }
  const v = String(raw).trim().toLowerCase();
  if (v === ID_SPACE.APP || v === ID_SPACE.SCHOOL) {
    return { ok: true, value: v };
  }
  return { ok: false };
}

/** Strict whole-string numeric term (explicit namespaces only). */
function isNumericTerm(term) {
  return /^\d+$/.test(String(term).trim());
}

/**
 * Build the search WHERE fragment for the online-logs query.
 *
 * @param {Object} opts
 * @param {string} opts.term    raw `search` query value
 * @param {string} opts.idSpace one of ID_SPACE.*
 * @param {Function} opts.query async (sql, params) => rows (injectable)
 * @returns {Promise<
 *   { conditions: string[], params: any[] } |
 *   { error: { status: number, code: string, message: string } }
 * >}
 */
async function buildSearchFilter({ term, idSpace, query }) {
  const conditions = [];
  const params = [];

  if (term === undefined || term === null || String(term).trim() === "") {
    return { conditions, params };
  }

  // ---- legacy mode: preserve the historical predicate exactly ----
  if (idSpace === ID_SPACE.LEGACY) {
    const searchNum = parseInt(term);
    if (!isNaN(searchNum)) {
      conditions.push(`(${NAME_FILTER} OR al.employee_db_id = ?)`);
      params.push(`%${term}%`, searchNum);
    } else {
      conditions.push(NAME_FILTER);
      params.push(`%${term}%`);
    }
    return { conditions, params };
  }

  // ---- explicit namespaces: the term must be a plain number ----
  if (!isNumericTerm(term)) {
    return {
      error: {
        status: 400,
        code: "INVALID_SEARCH_TERM",
        message: `A numeric term is required when id_space='${idSpace}' is used.`,
      },
    };
  }

  if (idSpace === ID_SPACE.APP) {
    conditions.push(`al.employee_db_id = ?`);
    params.push(Number(term));
    return { conditions, params };
  }

  if (idSpace === ID_SPACE.SCHOOL) {
    // Resolve the school identity through the mapping column only —
    // never compare the school number to attendance_logs.employee_db_id.
    const mapped = await query(
      "SELECT id FROM employees WHERE dtr_user_id = ?",
      [Number(term)]
    );
    if (!mapped || mapped.length === 0) {
      // Documented safe result for a missing mapping: no attendance rows.
      conditions.push(`1 = 0`);
      return { conditions, params };
    }
    if (mapped.length > 1) {
      // Duplicate mapping: fail safely rather than picking an account.
      return {
        error: {
          status: 409,
          code: "AMBIGUOUS_DTR_IDENTITY",
          message:
            `DTR identity ${term} is linked to ${mapped.length} application ` +
            "accounts. Resolve the duplicate mapping before searching.",
        },
      };
    }
    conditions.push(`al.employee_db_id = ?`);
    params.push(mapped[0].id);
    return { conditions, params };
  }

  // Unreachable when parseIdSpace validated the value.
  return {
    error: {
      status: 400,
      code: "INVALID_ID_SPACE",
      message: "Invalid id_space. Use 'app_id' or 'school_dtr_id'.",
    },
  };
}

module.exports = { ID_SPACE, NAME_FILTER, parseIdSpace, isNumericTerm, buildSearchFilter };
