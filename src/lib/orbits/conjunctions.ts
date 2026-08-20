/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConjunctionEvent, RiskTier } from '@/lib/types/orbits';
import { propagateAtTime, eciDistanceKm, relativeVelocityKmS, propagateOverWindow } from './propagation';

// Simplified risk thresholds (in km)
// Note: These are highly simplified heuristics for a hackathon demo. 
// Real-world systems like NASA CARA use covariance-based probability of collision (Pc)
// and track uncertainty ellipsoids, which is out of scope for a 6-day build.
// Future work: integrate covariance matrices and compute actual Pc.
const CRITICAL_DISTANCE_KM = 0.5;
const HIGH_DISTANCE_KM = 1.0;
const MODERATE_DISTANCE_KM = 2.0;
const LOW_DISTANCE_KM = 5.0;

// Above this relative velocity, a critical distance is considered 'critical'.
// (Though in orbital mechanics, ANY collision is catastrophic, we use this as an extra discriminator).
const HIGH_RELATIVE_VELOCITY_KMS = 10.0;

export function scoreRisk(closestApproachKm: number, relativeVelocityKmS: number): RiskTier {
  if (closestApproachKm < CRITICAL_DISTANCE_KM && relativeVelocityKmS > HIGH_RELATIVE_VELOCITY_KMS) {
    return 'critical';
  }
  if (closestApproachKm < HIGH_DISTANCE_KM) {
    return 'high';
  }
  if (closestApproachKm < MODERATE_DISTANCE_KM) {
    return 'moderate';
  }
  return 'low';
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
  // We propagate each object over a full orbit (e.g. 120 minutes) at a coarse step (e.g. 60s) 
  // to find its min (perigee) and max (apogee) altitude.
  const altitudeBands = objects.map(obj => {
    // 120 mins covers most LEO orbits. If it's MEO/GEO, this is just an approximation of its current band.
    const coarseProp = propagateOverWindow(obj.satrec, startDate, 120, 60);
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

      for (let offset = 0; offset <= durationSeconds; offset += stepSeconds) {
        const t = new Date(startDate.getTime() + offset * 1000);
        
        const stateA = propagateAtTime(objA.satrec, t);
        const stateB = propagateAtTime(objB.satrec, t);

        if (!stateA || !stateB) continue;

        const dist = eciDistanceKm(stateA.eciPosition, stateB.eciPosition);
        
        if (dist <= thresholdKm) {
          inConjunction = true;
          if (dist < closestDist) {
            closestDist = dist;
            closestTime = t;
            relVelAtClosest = relativeVelocityKmS(stateA.eciVelocity, stateB.eciVelocity);
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
