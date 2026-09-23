// ============================================================
// SPC Online DTR — Synchronization API Routes
//
// Endpoints for the local sync agent to push attendance events.
//
// POST /api/sync/push   — receive batch of sync events
// GET  /api/sync/status — service health check
//
// Authentication: SYNC_API_KEY via Authorization header.
// These routes bypass CSRF and CORS (machine-to-machine).
// ============================================================

const express = require("express");
const router = express.Router();
const { processBatch, getSyncStatus } = require("../services/syncService");
const { syncLimiter } = require("../middleware/syncAuth");

// Apply sync-specific rate limiting to all sync routes
router.use(syncLimiter);

// ==========================
// POST /api/sync/push
// Receive a batch of sync events from the local agent.
// ==========================
router.post("/push", async (req, res) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: "events array is required" });
    }

    // Validate batch size
    if (events.length > 100) {
      return res.status(400).json({ message: "Maximum 100 events per batch" });
    }

    // Validate each event has required fields
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.source_pk_entry == null || e.dtr_user_id == null || !e.tdate) {
        return res.status(400).json({
          message: `Event at index ${i} missing required fields: source_pk_entry, dtr_user_id, tdate`,
        });
      }
    }

    const { results, errors } = await processBatch(events);

    res.json({
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (err) {
    console.error("[SyncAPI] Push error:", err);
    res.status(500).json({ message: "Sync processing failed" });
  }
});

// ==========================
// GET /api/sync/status
// Health check for the sync service.
// ==========================
router.get("/status", async (req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (err) {
    console.error("[SyncAPI] Status error:", err);
    res.status(500).json({ message: "Status check failed" });
  }
});

module.exports = router;
