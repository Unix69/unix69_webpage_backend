import axios from "axios";
import express from "express";
import redis  from "../lib/redis.js";

const router = express.Router();

router.get("/", async (req, res) => {

  const { start, end } = req.query;
  console.log("PARAMETRI RICEVUTI:", req.query);

  if (!start || !end) {
    return res.status(400).json({ error: "Missing start or end date" });
  }

  try {
    const { data } = await axios.get("https://api.cal.com/v2/slots", {
      headers: { Authorization: `Bearer ${process.env.CAL_API_KEY}`, "cal-api-version": "2024-09-04" },
      params: {
        eventTypeId: process.env.CAL_EVENT_TYPE_ID,
        start: start, // Usiamo le date passate dal frontend
        end: end,
      },
    });

    // 1. TRASFORMAZIONE: Converti l'oggetto data (date come chiavi) in un array piatto di slot
    let flatSlots = [];
    if (data?.data) {
      Object.values(data.data).forEach(daySlots => {
        flatSlots.push(...daySlots);
      });
    }

    // 2. Assicuriamoci che ogni slot abbia 'start' e 'end' 
    // (Cal.com v2 a volte manda solo lo start, se manca l'end lo calcoliamo noi)
    const normalizedSlots = flatSlots.map(s => ({
      start: s.start,
      end: s.end || new Date(new Date(s.start).getTime() + 3600000).toISOString() // default 1h
    }));

    // SAFE REDIS SCAN (NO KEYS)
    let cursor = "0";
    let keys = [];

    do {
      let reply;

      try {
        reply = await redis.scan(
          cursor,
          "MATCH",
          "lock:cal-slot:*",
          "COUNT",
          100
        );

        console.log("RAW REDIS SCAN:", reply);

      } catch (e) {
        console.error("REDIS SCAN FAILED:", e);
        throw e;
      }

      const nextCursor =
        Array.isArray(reply) ? reply[0] : reply?.cursor ?? "0";

      const scannedKeys =
        Array.isArray(reply) ? reply[1] : reply?.keys ?? [];

      cursor = nextCursor;
      keys.push(...scannedKeys);

    } while (cursor !== "0");

    

    console.log("Redis keys trovate:", keys); // Vediamo cosa restituisce effettivamente Redis

    const lockedSlots = new Set(
      keys.map(k => k.replace("lock:cal-slot:", ""))
    );
    
    console.log("Set dei lock (pulito):", Array.from(lockedSlots));

    const filteredSlots = normalizedSlots.filter(slot => {
      const isLocked = lockedSlots.has(slot.start);
      if (isLocked) {
        console.log("MATCH TROVATO! Slot bloccato:", slot.start);
      }
      return !isLocked;
    });

    const filtered = {
      status: "success",
      slots: filteredSlots
    };

    console.log("Slot totali da Cal.com:", normalizedSlots.length);
    console.log("Slot restituiti al frontend:", filtered.slots.length);

    return res.status(200).json(filtered);

  } catch (err) {
    console.error("AVAILABILITY ERROR FULL:");
    console.error("STATUS:", err?.response?.status);
    console.error("DATA:", err?.response?.data);
    console.error("MESSAGE:", err.message);

    return res.status(500).json({
      error: "Failed to fetch availability",
      details: err?.response?.data || err.message,
    });
  }
});

export default router;