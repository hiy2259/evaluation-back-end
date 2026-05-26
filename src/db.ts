import mongoose from 'mongoose';
import { config } from './config.js';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2_000;

export async function connectDb(uri: string = config.mongoUri): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);

  let attempt = 0;
  let lastErr: unknown;

  while (attempt < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(uri, {
        maxPoolSize: 5,
        serverSelectionTimeoutMS: 5_000,
      });
      console.log(`[db] connected (attempt ${attempt + 1})`);
      return conn;
    } catch (err) {
      lastErr = err;
      attempt += 1;
      console.error(`[db] connect failed (attempt ${attempt}/${MAX_RETRIES}):`, (err as Error).message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(`[db] failed to connect after ${MAX_RETRIES} attempts: ${(lastErr as Error)?.message}`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
