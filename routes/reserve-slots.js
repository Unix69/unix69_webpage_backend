import express from "express";
import { acquireLock } from "../lib/lock.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { start } = req.body;

    if (!start) {
      return res.status(400).json({
        error: "Missing start time",
      });
    }

    const lockKey = `lock:cal-slot:${start}`;

    const { acquired, token } = await acquireLock(lockKey);

    if (!acquired) {
      return res.status(409).json({
        error: "Slot temporarily reserved",
      });
    }

    return res.status(200).json({
      success: true,
      token,
    });

  } catch (err) {
    return res.status(500).json({
      error: "Failed to reserve slot",
      details: err.message,
    });
  }
});

export default router;