import express from "express";
import axios from "axios";
import { releaseLock } from "../lib/lock.js";
import redis from "../lib/redis.js";

const router = express.Router();
router.post("/", async (req, res) => {
  // Ora leggiamo 'type' dal body che arriva dal frontend
  const { 
    start, end, name, email, title, lockToken, idempotencyKey, 
    tutoring_event_id, subject, type
  } = req.body;

  // 1. Validazione base
  if (!start || !end || !name || !email || !title || !tutoring_event_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  console.log("DEBUG - Variabile ambiente CAL_EVENT_1H_STRIPE:", process.env.CAL_EVENT_1H_STRIPE);
  console.log("DEBUG - Variabile ambiente CAL_EVENT_1H_MANUAL:", process.env.CAL_EVENT_1H_MANUAL);
  console.log("DEBUG - Variabile ambiente CAL_EVENT_2H_STRIPE:", process.env.CAL_EVENT_2H_STRIPE);
  console.log("DEBUG - Variabile ambiente CAL_EVENT_2H_MANUAL:", process.env.CAL_EVENT_2H_MANUAL);

  console.log("DEBUG - TUTTE LE VARIABILI:", process.env);
  
  const eventMapping = {
    "1h-stripe": process.env.CAL_EVENT_1H_STRIPE,
    "1h-manual": process.env.CAL_EVENT_1H_MANUAL,
    "2h-stripe": process.env.CAL_EVENT_2H_STRIPE,
    "2h-manual": process.env.CAL_EVENT_2H_MANUAL,
  };

  const eventTypeId = eventMapping[tutoring_event_id];

  if (!eventTypeId) {
    return res.status(400).json({ error: "Invalid event type id" });
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
    

    // 1. Definisci il payload come oggetto puro
    const payload = {
      eventTypeId: Number(eventTypeId),
      start: formattedStart,
      //end: formattedEnd,
      attendee: {
        name: name,
        email: email,
        timeZone: "Europe/Rome",
        language: "it"
      },
      bookingFieldsResponses: {
        title: title,
        type: type,
        subject: subject
      },
      metadata: { source: "web-booking" }
    };

    console.log("PAYLOAD PRIMA DI AXIOS:", JSON.stringify(payload));

    // 2. Esegui la richiesta in modo esplicito
    const response = await axios({
      method: 'post',
      url: 'https://api.cal.com/v2/bookings',
      data: payload,
      headers: {
        'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2026-02-25'
      }
    });

    console.log("CAL RESPONSE:", JSON.stringify(response.data));

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