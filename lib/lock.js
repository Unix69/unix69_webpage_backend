import redis from "./redis.js";
import { randomUUID } from "crypto";

const LOCK_TTL = 120;

/*
=========================================
ACQUIRE LOCK
=========================================
*/
export async function acquireLock(key) {
  if (!key || typeof key !== "string") {
    throw new Error("Invalid lock key");
  }

  const token = randomUUID();

  const result = await redis.set(
    key,
    token,
    {
      NX: true,
      EX: LOCK_TTL,
    }
  );

  return {
    acquired: result === "OK",
    token,
  };
}

/*
=========================================
RELEASE LOCK (SAFE VERSION)
=========================================
*/
export async function releaseLock(key, token) {
  if (!key || typeof key !== "string") return 0;
  if (!token || typeof token !== "string") return 0;

  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  try {
    return await redis.eval(script, {
      keys: [key],
      arguments: [token],
    });
  } catch (err) {
    console.error("releaseLock failed:", err.message);
    return 0;
  }
}