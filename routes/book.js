import express from "express";
import axios from "axios";
import { releaseLock } from "../lib/lock.js";
import redis from "../lib/redis.js";

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
  VALIDATION
  =========================================
  */
  if (!start || !end || !name || !email || !title || !lockToken || !idempotencyKey) {
    return res.status(400).json({
      error: "Missing required fields",
    });
  }

  const lockKey = `lock:cal-slot:${start}`;
  const bookingKey = `booking:${idempotencyKey}`;

  try {
    console.log("BOOK REQUEST START:", start);
    console.log("LOCK KEY:", lockKey);

    /*
    =========================================
    1. IDEMPOTENCY CHECK
    =========================================
    */
    const existing = await redis.get(bookingKey);

    if (existing) {
      return res.status(200).json(JSON.parse(existing));
    }

    /*
    =========================================
    2. VERIFY LOCK
    =========================================
    */
    const currentToken = await redis.get(lockKey);

    console.log("REDIS TOKEN:", currentToken);
    console.log("CLIENT TOKEN:", lockToken);

    if (!currentToken || currentToken !== lockToken) {
      return res.status(409).json({
        error: "Invalid or expired reservation",
      });
    }

    /*
    =========================================
    3. CAL.COM BOOKING (FIXED v2)
    =========================================
    */
    const formattedStart = new Date(start).toISOString();
    const formattedEnd = new Date(end).toISOString();
    
    /*
    =========================================
    3. CAL.COM BOOKING (FIXED v2)
    =========================================
    */
    const payload = {
      // 1. Dati obbligatori richiesti dallo schema v2
      eventTypeId: Number(process.env.CAL_EVENT_TYPE_ID),
      start: start,
      end: end, // Nota: La v2 calcola spesso la durata da start/end
      
      // 2. Attendee (Obbligatorio)
      attendee: {
        name: name,
        email: email,
        timeZone: "Europe/Rome",
        language: "it"
      },
      
      // 3. Metadata (Obbligatorio come oggetto, anche se vuoto)
      metadata: {},
      
      // 4. Campi aggiuntivi per prevenire errori di validazione "missing field"
      bookingFieldsResponses: {},
      location: { type: "online" } // Impostato di default per evitare errori
    };

    console.log("CAL PAYLOAD:", payload);

    const response = await axios.post(
      "https://api.cal.com/v2/bookings",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.CAL_API_KEY}`,
          "Content-Type": "application/json",
          "call-api-version": "2026-02-25"
        },
      }
    );

    console.log("CAL RESPONSE:", stringify(response.data));

    const data = response.data;

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
    
    if (err?.response?.data?.error?.details?.errors) {
        console.error("DETTAGLI ERRORI CAL.COM:", JSON.stringify(err.response.data.error.details.errors, null, 2));
    }

    console.error("BOOK ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      error: "Booking failed",
      details: err?.response?.data || err.message,
    });

  } finally {
      try {
        if (lockKey && lockToken) {
          await releaseLock(lockKey, lockToken);
        }
      } catch (err) {
        console.error("LOCK RELEASE ERROR:", err.message);
      }
    }
});

export default router;