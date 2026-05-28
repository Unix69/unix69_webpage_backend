import axios from "axios";
import express from "express";
import redis  from "../lib/redis.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    if (!process.env.CAL_API_KEY || !process.env.CAL_EVENT_TYPE_ID) {
      return res.status(500).json({
        error: "Missing env variables",
      });
    }

    const { data } = await axios.get(
      "https://api.cal.com/v1/slots",
      {
        headers: {
          Authorization: `Bearer ${process.env.CAL_API_KEY}`,
        },
        params: {
          eventTypeId: process.env.CAL_EVENT_TYPE_ID,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      }
    );

    // SAFE SLOTS
    const slots = data?.slots || [];

    // SAFE REDIS SCAN (NO KEYS)
    let cursor = "0";
    let keys = [];

    do {
      const reply = await redis.scan(
        cursor,
        "MATCH",
        "lock:cal-slot:*",
        "COUNT",
        100
      );

      cursor = reply[0];
      keys.push(...reply[1]);

    } while (cursor !== "0");

    const lockedSlots = new Set(
      keys.map(k => k.replace("lock:cal-slot:", ""))
    );

    const filtered = {
      ...data,
      slots: slots.filter(slot => {
        return !lockedSlots.has(slot.startTime);
      }),
    };

    return res.status(200).json(filtered);

  } catch (err) {
    return res.status(500).json({
      error: "Failed to fetch availability",
      details: err.message,
    });
  }
});

export default router;