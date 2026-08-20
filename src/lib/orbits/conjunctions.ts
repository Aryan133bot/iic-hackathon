/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConjunctionEvent, RiskTier } from '@/lib/types/orbits';
import { propagateAtTime, eciDistanceKm, relativeVelocityKmS, propagateOverWindow } from './propagation';

// Simplified risk thresholds (in km)
// Note: These are highly simplified heuristics for a hackathon demo. 
// Real-world systems like NASA CARA use covariance-based probability of collision (Pc)
// and track uncertainty ellipsoids, which is out of scope for a 6-day build.
// Future work: integrate covariance matrices and compute actual Pc.
const CRITICAL_DISTANCE_KM = 0.5;
const HIGH_DISTANCE_KM = 2.0;
const MODERATE_DISTANCE_KM = 5.0;
const LOW_DISTANCE_KM = 5.0;

// Above this relative velocity, risk is escalated one tier.
// (Though in orbital mechanics, ANY collision is catastrophic, we use this as an extra discriminator).
const HIGH_RELATIVE_VELOCITY_KMS = 10.0;

export function scoreRisk(closestApproachKm: number, relativeVelocityKmS: number): RiskTier {
  // Any approach under 0.5 km is critical regardless of velocity
  if (closestApproachKm < CRITICAL_DISTANCE_KM) return 'critical';

  // Distance < 2.0 km is 'high', but escalate to 'critical' if relative velocity is also high
  if (closestApproachKm < HIGH_DISTANCE_KM) {
    if (relativeVelocityKmS > HIGH_RELATIVE_VELOCITY_KMS) return 'critical';
    return 'high';
  }

  // Distance < 5.0 km is 'moderate', but escalate to 'high' if relative velocity is also high
  if (closestApproachKm < MODERATE_DISTANCE_KM) {
    if (relativeVelocityKmS > HIGH_RELATIVE_VELOCITY_KMS) return 'high';
    return 'moderate';
  }

  return 'low';
}

/**
 * Performs bisection refinement between two time offsets to find a more accurate
 * closest approach time and distance. Runs ~5 iterations of binary search.
 */
function bisectClosestApproach(
  satrecA: any,
  satrecB: any,
  startDate: Date,
  offsetBeforeSec: number,
  offsetAfterSec: number
): { dist: number; time: Date; relVel: number } | null {
  let lo = offsetBeforeSec;
  let hi = offsetAfterSec;
  const BISECT_ITERATIONS = 5;

  let bestDist = Infinity;
  let bestTime: Date | null = null;
  let bestRelVel = 0;

  for (let iter = 0; iter < BISECT_ITERATIONS; iter++) {
    const mid = (lo + hi) / 2;
    const tLo = new Date(startDate.getTime() + lo * 1000);
    const tMid = new Date(startDate.getTime() + mid * 1000);
    const tHi = new Date(startDate.getTime() + hi * 1000);

    const stateALo = propagateAtTime(satrecA, tLo);
    const stateBLo = propagateAtTime(satrecB, tLo);
    const stateAMid = propagateAtTime(satrecA, tMid);
    const stateBMid = propagateAtTime(satrecB, tMid);
    const stateAHi = propagateAtTime(satrecA, tHi);
    const stateBHi = propagateAtTime(satrecB, tHi);

    if (!stateALo || !stateBLo || !stateAMid || !stateBMid || !stateAHi || !stateBHi) {
      break;
    }

    const distLo = eciDistanceKm(stateALo.eciPosition, stateBLo.eciPosition);
    const distMid = eciDistanceKm(stateAMid.eciPosition, stateBMid.eciPosition);
    const distHi = eciDistanceKm(stateAHi.eciPosition, stateBHi.eciPosition);

    // Track the best (minimum distance) found
    const candidates = [
      { dist: distLo, offset: lo, stateA: stateALo, stateB: stateBLo, t: tLo },
      { dist: distMid, offset: mid, stateA: stateAMid, stateB: stateBMid, t: tMid },
      { dist: distHi, offset: hi, stateA: stateAHi, stateB: stateBHi, t: tHi },
    ];

    for (const c of candidates) {
      if (c.dist < bestDist) {
        bestDist = c.dist;
        bestTime = c.t;
        bestRelVel = relativeVelocityKmS(c.stateA.eciVelocity, c.stateB.eciVelocity);
      }
    }

    // Narrow the search: keep the half containing the minimum
    if (distLo < distHi) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  if (!bestTime) return null;
  return { dist: bestDist, time: bestTime, relVel: bestRelVel };
}

/**
 * Screens for conjunctions between a set of objects over a given time window.
 * 
 * OPTIMIZATION (O(n²) Pre-filter):
 * Because comparing every object against every other object step-by-step is O(n² * steps),
 * we first compute the approximate apogee and perigee (max and min altitude) for each object.
 * We only perform the expensive step-by-step propagation if the altitude bands of two objects
 * overlap (or come within the threshold distance of each other).
 */
export function screenConjunctions(
  objects: { noradId: number; name: string; satrec: any }[],
  startDate: Date,
  windowMinutes: number,
  stepSeconds: number,
  thresholdKm: number = LOW_DISTANCE_KM
): ConjunctionEvent[] {
  const events: ConjunctionEvent[] = [];
  const numObjects = objects.length;

  // 1. Coarse Pre-Filter: Compute Altitude Bands
  // We propagate each object over 360 minutes (6 hours) at a coarse step (60s)
  // to find its min (perigee) and max (apogee) altitude.
  // 360 mins better captures GEO/MEO orbit altitude ranges.
  const altitudeBands = objects.map(obj => {
    const coarseProp = propagateOverWindow(obj.satrec, startDate, 360, 60);
    let minAlt = Infinity;
    let maxAlt = -Infinity;
    for (const state of coarseProp) {
      if (state.geodetic.altitudeKm < minAlt) minAlt = state.geodetic.altitudeKm;
      if (state.geodetic.altitudeKm > maxAlt) maxAlt = state.geodetic.altitudeKm;
    }
    return { minAlt, maxAlt };
  });

  const durationSeconds = windowMinutes * 60;

  // 2. Pairwise Check
  for (let i = 0; i < numObjects; i++) {
    for (let j = i + 1; j < numObjects; j++) {
      const objA = objects[i];
      const objB = objects[j];
      const bandA = altitudeBands[i];
      const bandB = altitudeBands[j];

      // If one of the objects decayed or couldn't be propagated, skip
      if (bandA.minAlt === Infinity || bandB.minAlt === Infinity) continue;

      // Check for altitude band overlap (plus threshold buffer)
      const overlap = (bandA.minAlt - thresholdKm <= bandB.maxAlt) && 
                      (bandA.maxAlt + thresholdKm >= bandB.minAlt);
      
      if (!overlap) {
        continue; // Plausibly cannot collide, skip fine-grained screening
      }

      // 3. Fine-grained Screening
      let closestDist = Infinity;
      let closestTime: Date | null = null;
      let relVelAtClosest = 0;
      let inConjunction = false; // To track if we're inside a conjunction window to avoid recording multiple events for one pass
      let prevOffset = 0;

      for (let offset = 0; offset <= durationSeconds; offset += stepSeconds) {
        const t = new Date(startDate.getTime() + offset * 1000);
        
        const stateA = propagateAtTime(objA.satrec, t);
        const stateB = propagateAtTime(objB.satrec, t);

        if (!stateA || !stateB) { prevOffset = offset; continue; }

        const dist = eciDistanceKm(stateA.eciPosition, stateB.eciPosition);
        
        if (dist <= thresholdKm) {
          if (!inConjunction) {
            // Just entered a conjunction window — refine between previous and current timestep
            inConjunction = true;
          }
          if (dist < closestDist) {
            closestDist = dist;
            closestTime = t;
            relVelAtClosest = relativeVelocityKmS(stateA.eciVelocity, stateB.eciVelocity);

            // 4. Bisection Refinement: refine between previous timestep and current
            // to find a more accurate closest approach time and distance
            if (offset > 0) {
              const refined = bisectClosestApproach(
                objA.satrec, objB.satrec, startDate, prevOffset, offset
              );
              if (refined && refined.dist < closestDist) {
                closestDist = refined.dist;
                closestTime = refined.time;
                relVelAtClosest = refined.relVel;
              }
            }
          }
        } else if (inConjunction) {
          // We just exited a conjunction window. Record the event.
          if (closestTime) {
            events.push({
              objectA: { noradId: objA.noradId, name: objA.name },
              objectB: { noradId: objB.noradId, name: objB.name },
              closestApproachKm: closestDist,
              timeOfClosestApproach: closestTime.toISOString(),
              relativeVelocityKmS: relVelAtClosest,
              riskTier: scoreRisk(closestDist, relVelAtClosest),
            });
          }
          // Reset for potential future passes
          inConjunction = false;
          closestDist = Infinity;
          closestTime = null;
          relVelAtClosest = 0;
        }

        prevOffset = offset;
      }

      // If it ends while still in conjunction
      if (inConjunction && closestTime) {
        events.push({
          objectA: { noradId: objA.noradId, name: objA.name },
          objectB: { noradId: objB.noradId, name: objB.name },
          closestApproachKm: closestDist,
          timeOfClosestApproach: closestTime.toISOString(),
          relativeVelocityKmS: relVelAtClosest,
          riskTier: scoreRisk(closestDist, relVelAtClosest),
        });
      }
    }
  }

  // Sort by closest approach
  events.sort((a, b) => a.closestApproachKm - b.closestApproachKm);

  return events;
}
