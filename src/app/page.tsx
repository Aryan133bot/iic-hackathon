'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Activity, Satellite, Loader2, Bot, AlertTriangle } from 'lucide-react';
import OrbitGlobe, { OrbitData } from '@/components/OrbitGlobe';
import { parseTLEToSatrec, propagateOverWindow } from '@/lib/orbits/propagation';
import { TLEResponse } from '@/lib/types/tle';
import { ConjunctionEvent } from '@/lib/types/orbits';

// Utility to convert ECI coordinates to Three.js coordinates
const eciToThree = (x: number, y: number, z: number): [number, number, number] => {
  const SCALE = 1 / 1000;
  return [x * SCALE, z * SCALE, -y * SCALE];
};

export default function DashboardShell() {
  const [orbits, setOrbits] = useState<OrbitData[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeEvent, setActiveEvent] = useState<ConjunctionEvent | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefData, setBriefData] = useState<{ summary: string; implication: string; caveat: string; riskTier: string } | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);

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

        const startDate = new Date();
        const processedOrbits: OrbitData[] = [];

        for (const obj of tleData.objects) {
          try {
            const satrec = parseTLEToSatrec(obj.line1, obj.line2);
            const trajectory = propagateOverWindow(satrec, startDate, 90, 30);
            const trail = trajectory.map(pos => eciToThree(pos.eciPosition.x, pos.eciPosition.y, pos.eciPosition.z));
            
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

  const handleSelectEvent = async (event: ConjunctionEvent) => {
    setActiveEvent(event);
    setBriefLoading(true);
    setBriefData(null);
    setBriefError(null);

    try {
      const res = await fetch('/api/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to generate brief');
      setBriefData(data.brief);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error communicating with AI';
      setBriefError(message);
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <main className="flex h-screen w-full flex-col p-4 gap-4 bg-background text-foreground font-sans">
      <header className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
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
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 font-mono text-xs cursor-pointer">
            {loading ? (
              <div className="flex items-center justify-center h-full text-white/30">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            ) : conjunctions.length === 0 ? (
              <div className="text-white/30 p-4 border border-white/10 rounded">No critical approaches detected in the next 24 hours.</div>
            ) : (
              conjunctions.map((event, i) => (
                <div 
                  key={i} 
                  onClick={() => handleSelectEvent(event)}
                  className={`p-3 rounded border transition-colors hover:bg-white/10 ${activeEvent === event ? 'bg-white/10 ring-1 ring-accent' : ''} ${event.riskTier === 'critical' ? 'border-critical/50' : 'border-warning/50'}`}
                >
                  <div className={`font-bold mb-1 ${event.riskTier === 'critical' ? 'text-critical' : 'text-warning'}`}>
                    RISK: {event.riskTier.toUpperCase()}
                  </div>
                  <div className="text-white/90">{event.objectA.name}</div>
                  <div className="text-white/50 my-1 text-[10px]">vs</div>
                  <div className="text-white/90">{event.objectB.name}</div>
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
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4 shrink-0 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            AI Tactical Brief
          </h2>
          <div className="overflow-y-auto flex-1">
            {!activeEvent ? (
              <div className="font-mono text-xs text-white/30 italic">Select an active alert from the left panel to generate a tactical AI briefing on the conjunction risk.</div>
            ) : briefLoading ? (
              <div className="font-mono text-xs flex items-center gap-2 text-accent">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating brief...
              </div>
            ) : briefError ? (
              <div className="font-mono text-xs text-critical flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {briefError}
              </div>
            ) : briefData ? (
              <div className="animate-in fade-in duration-500 flex flex-col gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Summary</div>
                  <div className="text-sm font-sans text-white/90 leading-snug">{briefData.summary}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Implication</div>
                  <div className="text-sm font-sans text-white/80 leading-snug">{briefData.implication}</div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Caveat</div>
                  <div className="text-xs font-mono text-white/40 italic">{briefData.caveat}</div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
