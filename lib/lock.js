import { redis } from "./redis.js";
import { randomUUID } from "crypto";

const LOCK_TTL = 20; // meglio 15–30s per booking reali

/**
 * ACQUIRE LOCK
 * returns: { acquired: boolean, token: string }
 */
export async function acquireLock(key) {
  const token = randomUUID();

  const result = await redis.set(
    key,
    token,
    "NX",
    "EX",
    LOCK_TTL
  );

  return {
    acquired: result === "OK",
    token,
  };
}


export async function releaseLock(key, token) {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  return await redis.eval(script, 1, key, token);
}