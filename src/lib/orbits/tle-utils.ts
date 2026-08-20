/**
 * Rewrites the epoch field in a TLE Line 1 string to the current UTC time.
 * This allows synthetic/historical TLEs to be used with SGP4 propagation
 * from "now" without epoch-mismatch errors.
 * Note: Does not recalculate the TLE checksum (satellite.js doesn't validate it).
 */
export function updateTLEEpochToNow(line1: string): string {
  const now = new Date();
  const year = now.getUTCFullYear() % 100;
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const diff = (now.getTime() - start.getTime()) / 86400000 + 1; // 1-indexed day of year
  const epochStr = `${year.toString().padStart(2, '0')}${diff.toFixed(8).padStart(12, '0')}`;
  return line1.substring(0, 18) + epochStr + line1.substring(32);
}
