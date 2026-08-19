/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'satellite.js' {
  export const constants: any;
  export function twoline2satrec(tle1: string, tle2: string): any;
  export function propagate(satrec: any, date: Date): any;
  export function gstime(date: Date): any;
  export function eciToEcf(eciCoords: any, gmst: number): any;
  export function eciToGeodetic(eciCoords: any, gmst: number): any;
  export function degreesLat(radians: number): number;
  export function degreesLong(radians: number): number;
}
