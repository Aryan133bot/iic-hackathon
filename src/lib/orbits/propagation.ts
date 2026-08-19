/* eslint-disable @typescript-eslint/no-explicit-any */
import * as satellite from 'satellite.js';
import { Vector3, PropagationResult } from '@/lib/types/orbits';

/**
 * Parses a two-line element set (TLE) into a satellite record (satrec) object.
 * @param line1 - The first line of the TLE.
 * @param line2 - The second line of the TLE.
 * @returns The satrec object initialized for propagation.
 * @throws Error if the TLE is malformed or invalid.
 */
export function parseTLEToSatrec(line1: string, line2: string): any {
  if (!line1 || !line2 || line1.length < 69 || line2.length < 69) {
    throw new Error('Malformed TLE: lines must be at least 69 characters long.');
  }
  
  const satrec = satellite.twoline2satrec(line1, line2);
  // satellite.js doesn't strictly throw on bad TLEs, but it leaves satrec.error set
  if (satrec.error) {
    throw new Error(`Invalid TLE (satellite.js error code: ${satrec.error})`);
  }
  return satrec;
}

/**
 * Propagates a satellite's orbit to a given time, returning its position and velocity
 * in Earth-Centered Inertial (ECI) coordinates, along with its Geodetic coordinates.
 * @param satrec - The initialized satellite record.
 * @param date - The target time for propagation.
 * @returns The PropagationResult (position in km, velocity in km/s, and geodetic coords) or null if propagation fails (e.g. decayed orbit).
 */
export function propagateAtTime(satrec: any, date: Date): PropagationResult | null {
  try {
    const positionAndVelocity = satellite.propagate(satrec, date);
    
    // Check if the propagation returned valid positional data
    const positionEci = positionAndVelocity.position as Vector3 | boolean | undefined;
    const velocityEci = positionAndVelocity.velocity as Vector3 | boolean | undefined;

    if (!positionEci || !velocityEci || typeof positionEci === 'boolean' || typeof velocityEci === 'boolean') {
      console.warn(`Propagation failed at ${date.toISOString()} for object ${satrec.satnum} (possibly decayed).`);
      return null;
    }

    const gmst = satellite.gstime(date);
    const geodetic = satellite.eciToGeodetic(positionEci, gmst);

    return {
      timestamp: date,
      eciPosition: { x: positionEci.x, y: positionEci.y, z: positionEci.z },
      eciVelocity: { x: velocityEci.x, y: velocityEci.y, z: velocityEci.z },
      geodetic: {
        latitudeDegrees: satellite.degreesLat(geodetic.latitude),
        longitudeDegrees: satellite.degreesLong(geodetic.longitude),
        altitudeKm: geodetic.height,
      },
    };
  } catch (error) {
    console.warn(`Exception during propagation for object ${satrec.satnum} at ${date.toISOString()}:`, error);
    return null;
  }
}

/**
 * Propagates a satellite over a time window, producing an array of sampled states.
 * @param satrec - The initialized satellite record.
 * @param startDate - The beginning of the time window.
 * @param durationMinutes - The length of the time window in minutes.
 * @param stepSeconds - The sample interval in seconds.
 * @returns Array of PropagationResult samples across the time window.
 */
export function propagateOverWindow(
  satrec: any,
  startDate: Date,
  durationMinutes: number,
  stepSeconds: number
): PropagationResult[] {
  const results: PropagationResult[] = [];
  const durationSeconds = durationMinutes * 60;
  const startTimeMs = startDate.getTime();

  for (let offset = 0; offset <= durationSeconds; offset += stepSeconds) {
    const targetDate = new Date(startTimeMs + offset * 1000);
    const state = propagateAtTime(satrec, targetDate);
    if (state) {
      results.push(state);
    }
  }

  return results;
}

/**
 * Calculates the Euclidean distance between two ECI position vectors.
 * @param posA - First ECI position vector (km).
 * @param posB - Second ECI position vector (km).
 * @returns The distance in kilometers.
 */
export function eciDistanceKm(posA: Vector3, posB: Vector3): number {
  const dx = posA.x - posB.x;
  const dy = posA.y - posB.y;
  const dz = posA.z - posB.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates the magnitude of relative velocity between two objects.
 * @param velA - First ECI velocity vector (km/s).
 * @param velB - Second ECI velocity vector (km/s).
 * @returns The relative velocity in km/s.
 */
export function relativeVelocityKmS(velA: Vector3, velB: Vector3): number {
  const dvx = velA.x - velB.x;
  const dvy = velA.y - velB.y;
  const dvz = velA.z - velB.z;
  return Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
}
