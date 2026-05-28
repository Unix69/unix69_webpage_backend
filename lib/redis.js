import { createClient } from "redis";

console.log("REDIS_URL =", process.env.REDIS_URL);

const client = createClient({
  url: process.env.REDIS_URL
});

client.on("error", console.error);

await client.connect();

export default client;

