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
