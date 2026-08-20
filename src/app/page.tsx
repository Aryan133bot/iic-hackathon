'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity, Satellite, Loader2 } from 'lucide-react';
import OrbitGlobe, { OrbitData } from '@/components/OrbitGlobe';
import { parseTLEToSatrec, propagateOverWindow } from '@/lib/orbits/propagation';
import { TLEResponse } from '@/lib/types/tle';
import { ConjunctionEvent } from '@/lib/types/orbits';

// Utility to convert ECI coordinates to Three.js coordinates
// ECI Z is North Pole. Three.js Y is up.
const eciToThree = (x: number, y: number, z: number): [number, number, number] => {
  const SCALE = 1 / 1000;
  return [x * SCALE, z * SCALE, -y * SCALE];
};

export default function DashboardShell() {
  const [orbits, setOrbits] = useState<OrbitData[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [tleRes, conjRes] = await Promise.all([
          fetch('/api/tle').then(r => r.json()),
          fetch('/api/conjunctions').then(r => r.json())
        ]);

        if (tleRes.error && !tleRes.objects?.length) {
          throw new Error(tleRes.error);
        }

        const tleData: TLEResponse = tleRes;
        const conjData: { events: ConjunctionEvent[] } = conjRes;

        setConjunctions(conjData.events || []);

        // Process TLEs into Orbit trails
        const startDate = new Date();
        const processedOrbits: OrbitData[] = [];

        for (const obj of tleData.objects) {
          try {
            const satrec = parseTLEToSatrec(obj.line1, obj.line2);
            // Propagate over a 90-minute window (typical LEO orbit) with 30s steps
            const trajectory = propagateOverWindow(satrec, startDate, 90, 30);
            
            const trail = trajectory.map(pos => eciToThree(pos.eciPosition.x, pos.eciPosition.y, pos.eciPosition.z));
            
            // Check if this object is at risk
            const riskEvent = conjData.events?.find(e => e.objectA.noradId === obj.noradId || e.objectB.noradId === obj.noradId);

            processedOrbits.push({
              noradId: obj.noradId,
              name: obj.name,
              type: obj.objectType,
              trail,
              isAtRisk: !!riskEvent,
              riskTier: riskEvent?.riskTier
            });
          } catch {
            // Ignore unparseable
          }
        }

        setOrbits(processedOrbits);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message || 'Failed to load telemetry data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  return (
    <main className="flex h-screen w-full flex-col p-4 gap-4 bg-background text-foreground font-sans">
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-accent w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wider">ORBITGUARD</h1>
        </div>
        <div className="flex items-center gap-4 text-sm font-mono text-white/50">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-warning animate-pulse' : 'bg-accent animate-pulse'}`}></div>
            {loading ? 'ACQUIRING TELEMETRY...' : 'SYSTEM ONLINE'}
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Left Sidebar */}
        <aside className="col-span-3 border border-white/10 rounded-lg p-4 flex flex-col gap-4 bg-white/5 overflow-hidden">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 flex items-center gap-2 shrink-0">
            <Activity className="w-4 h-4" />
            Active Alerts
          </h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 font-mono text-xs">
            {loading ? (
              <div className="flex items-center justify-center h-full text-white/30">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            ) : conjunctions.length === 0 ? (
              <div className="text-white/30 p-4 border border-white/10 rounded">No critical approaches detected in the next 24 hours.</div>
            ) : (
              conjunctions.map((event, i) => (
                <div key={i} className={`p-3 rounded border ${event.riskTier === 'critical' ? 'border-critical/50 bg-critical/10' : 'border-warning/50 bg-warning/10'}`}>
                  <div className="font-bold mb-1 text-white/90">RISK: {event.riskTier.toUpperCase()}</div>
                  <div className="text-white/70">{event.objectA.name} <br/>vs<br/> {event.objectB.name}</div>
                  <div className="mt-2 text-white/50">Dist: {event.closestApproachKm.toFixed(2)} km</div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Center - 3D View */}
        <section className="col-span-6 border border-white/10 rounded-lg bg-black/50 relative overflow-hidden flex items-center justify-center">
          <div className="absolute top-4 left-4 text-xs font-mono text-white/30 flex items-center gap-2 z-10">
            <Satellite className="w-4 h-4" />
            EARTH ORBIT VISUALIZATION
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-sm font-mono tracking-widest text-white/20">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              [ INITIALIZING 3D RENDER ENGINE ]
            </div>
          ) : error ? (
            <div className="text-critical font-mono">{error}</div>
          ) : (
            <OrbitGlobe orbits={orbits} />
          )}
        </section>

        {/* Right Sidebar */}
        <aside className="col-span-3 border border-white/10 rounded-lg p-4 bg-white/5 flex flex-col gap-4 overflow-hidden">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 shrink-0">
            Analysis Brief
          </h2>
          <div className="space-y-4 font-mono text-xs text-white/60 overflow-y-auto flex-1">
            <p>Tracking {orbits.length} active objects.</p>
            <p>Scanning 24-hour forward window for conjunctions under 10km.</p>
            {conjunctions.length > 0 && (
              <p className="text-warning">Detected {conjunctions.length} potential conjunction events requiring operator review.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
