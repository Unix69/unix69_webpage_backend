import express from "express";
import cors from "cors";
import helmet from "helmet";

import reserveSlot from "./routes/reserveSlot.js";
import book from "./routes/book.js";
import availability from "./routes/availability.js";

const app = express();

/*
========================
MIDDLEWARE
========================
*/

app.use(cors({
  origin: "*", // in produzione puoi restringere al tuo dominio GitHub Pages
}));

app.use(helmet());
app.use(express.json());

/*
========================
HEALTH CHECK (RAILWAY)
========================
*/

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "cal-booking-api",
  });
});

/*
========================
ROUTES
========================
*/

app.use("/api/cal/reserve-slot", reserveSlot);
app.use("/api/cal/book", book);
app.use("/api/cal/availability", availability);

/*
========================
GLOBAL ERROR HANDLER
========================
*/

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Internal server error",
  });
});

/*
========================
START SERVER
========================
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});