import express from "express";
import axios from "axios";

import { releaseLock } from "../lib/lock.js";
import redis  from "../lib/redis.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const {
    start,
    end,
    name,
    email,
    title,
    lockToken,
    idempotencyKey,
  } = req.body;

  /*
  =========================================
  BASIC VALIDATION
  =========================================
  */

  if (
    !start ||
    !end ||
    !name ||
    !email ||
    !title ||
    !lockToken ||
    !idempotencyKey
  ) {
    return res.status(400).json({
      error: "Missing required fields",
    });
  }

  const lockKey = `lock:cal-slot:${start}`;
  const bookingKey = `booking:${idempotencyKey}`;

  try {

    /*
    =========================================
    1. IDEMPOTENCY CHECK
    =========================================
    */

    const existing = await redis.get(bookingKey);

    if (existing) {
      return res.status(200).json(
        JSON.parse(existing)
      );
    }

    /*
    =========================================
    2. VERIFY LOCK
    =========================================
    */

    const currentToken = await redis.get(lockKey);

    if (!currentToken || currentToken !== lockToken) {
      return res.status(409).json({
        error: "Invalid or expired reservation",
      });
    }

    /*
    =========================================
    3. FINAL CAL.COM BOOKING
    =========================================
    */

    const { data } = await axios.post(
      "https://api.cal.com/v2/bookings",
      {
        eventTypeId: process.env.CAL_EVENT_TYPE_ID,
        start,
        end,
        title,
        timeZone: "Europe/Rome",
        attendees: [
          {
            name,
            email,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.CAL_API_KEY}`,
          "Content-Type": "application/json",
        },

        timeout: 10000,
      }
    );

    /*
    =========================================
    4. SAVE IDEMPOTENT RESULT
    =========================================
    */

    await redis.set(
      bookingKey,
      JSON.stringify(data),
      "EX",
      60 * 60 * 24
    );

    return res.status(200).json(data);

  } catch (err) {

    console.error(err?.response?.data || err.message);

    return res.status(500).json({
      error: "Booking failed",
      details:
        err?.response?.data ||
        err.message,
    });

  } finally {

    /*
    =========================================
    5. SAFE LOCK RELEASE
    =========================================
    */

    await releaseLock(lockKey, lockToken);
  }
});

export default router;

