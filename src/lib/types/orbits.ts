export type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type GeodeticCoordinates = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeKm: number;
};

export type PropagationResult = {
  timestamp: Date;
  eciPosition: Vector3; // Earth-Centered Inertial position in km
  eciVelocity: Vector3; // Earth-Centered Inertial velocity in km/s
  geodetic: GeodeticCoordinates;
};

export type RiskTier = 'critical' | 'high' | 'moderate' | 'low';

export type ConjunctionEvent = {
  objectA: {
    noradId: number;
    name: string;
  };
  objectB: {
    noradId: number;
    name: string;
  };
  closestApproachKm: number;
  timeOfClosestApproach: string; // ISO string
  relativeVelocityKmS: number;
  riskTier: RiskTier;
};
