'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ShieldAlert, Activity, Satellite, Loader2, Bot, AlertTriangle, RefreshCw, Info, ChevronDown, ChevronUp, FastForward, FlaskConical } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { OrbitData } from '@/components/OrbitGlobe';
const OrbitGlobe = dynamic(() => import('@/components/OrbitGlobe'), { ssr: false });
import { parseTLEToSatrec, propagateOverWindow } from '@/lib/orbits/propagation';
import { TLEResponse } from '@/lib/types/tle';
import { ConjunctionEvent } from '@/lib/types/orbits';
import { useAppStore, FilterTier } from '@/lib/store';

const eciToThree = (x: number, y: number, z: number): [number, number, number] => {
  const SCALE = 1 / 1000;
  return [x * SCALE, z * SCALE, -y * SCALE];
};

export default function DashboardShell() {
  const [orbits, setOrbits] = useState<OrbitData[]>([]);
  const [allConjunctions, setAllConjunctions] = useState<ConjunctionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [infoOpen, setInfoOpen] = useState(false);
  const dataStartDate = useRef<number>(Date.now());

  // Zustand Store
  const { 
    activeEvent, setActiveEvent,
    lastRefreshTime, setLastRefreshTime,
    filterTier, setFilterTier,
    isDemoMode, setDemoMode,
    timeCursorIndex, setTimeCursorIndex
  } = useAppStore();

  const [briefLoading, setBriefLoading] = useState(false);
  const [briefData, setBriefData] = useState<{ summary: string; implication: string; caveat: string; riskTier: string } | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);

  const loadData = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setTimeCursorIndex(null);
    setActiveEvent(null);

    try {
      const qs = new URLSearchParams();
      if (forceRefresh) qs.append('refresh', 'true');
      if (isDemoMode) qs.append('demo', 'true');

      const [tleRes, conjRes] = await Promise.all([
        fetch('/api/tle?' + qs.toString()).then(r => r.json()),
        fetch('/api/conjunctions?' + qs.toString()).then(r => r.json())
      ]);

      if (tleRes.error && !tleRes.objects?.length) {
        throw new Error(tleRes.error);
      }

      const tleData: TLEResponse = tleRes;
      const conjData: { events: ConjunctionEvent[] } = conjRes;

      setAllConjunctions(conjData.events || []);
      setLastRefreshTime(new Date(tleData.fetchedAt));

      const startDate = new Date();
      dataStartDate.current = startDate.getTime();
      const processedOrbits: OrbitData[] = [];

      for (const obj of tleData.objects) {
        try {
          const satrec = parseTLEToSatrec(obj.line1, obj.line2);
          const trajectory = propagateOverWindow(satrec, startDate, 1440, 30); // 24h at 30s
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
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  const handleSelectEvent = async (event: ConjunctionEvent) => {
    if (activeEvent === event) {
      setActiveEvent(null);
      setTimeCursorIndex(null);
      return;
    }
    setActiveEvent(event);
    setBriefLoading(true);
    setBriefData(null);
    setBriefError(null);
    setTimeCursorIndex(null);

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

  const handleFastForward = (e: React.MouseEvent, event: ConjunctionEvent) => {
    e.stopPropagation();
    if (timeCursorIndex !== null) {
      setTimeCursorIndex(null); // play normally
      return;
    }
    // Calculate index in the trail
    const tca = new Date(event.timeOfClosestApproach).getTime();
    const diffMs = tca - dataStartDate.current;
    const targetIndex = Math.max(0, diffMs / (30 * 1000));
    setTimeCursorIndex(targetIndex);
  };

  const conjunctions = useMemo(() => {
    return allConjunctions.filter(ev => {
      if (filterTier !== 'all' && ev.riskTier !== filterTier) return false;
      return true;
    });
  }, [allConjunctions, filterTier]);

  return (
    <main className="flex h-screen w-full flex-col p-4 gap-4 bg-background text-foreground font-sans overflow-hidden">
      {isDemoMode && (
        <div className="absolute top-0 left-0 w-full bg-warning text-warning-foreground font-bold text-center py-1 text-xs tracking-widest z-50 shadow-md">
          DEMO SCENARIO — Illustrative data, not live
        </div>
      )}

      <header className={`flex items-center justify-between border-b border-white/10 pb-4 shrink-0 ${isDemoMode ? 'mt-4' : ''}`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="text-accent w-6 h-6" />
            <h1 className="text-xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-white to-accent drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]">
              ORBITGUARD
            </h1>
          </div>
          <div className="text-xs font-mono text-white/40 flex items-center gap-2 bg-white/5 px-3 py-1 rounded">
            <Activity className="w-3 h-3" />
            UTC: {new Date().toISOString().split('T')[1].substring(0, 8)}
          </div>
        </div>
        
        <div className="flex items-center gap-6 text-sm font-mono text-white/50">
          <button 
            onClick={() => setDemoMode(!isDemoMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors font-bold ${isDemoMode ? 'bg-warning/20 text-warning border border-warning/50' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
          >
            <FlaskConical className="w-4 h-4" />
            {isDemoMode ? 'DEMO MODE' : 'LIVE DATA'}
          </button>

          <div className="flex items-center gap-2 border-l border-white/10 pl-6">
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-warning animate-pulse' : 'bg-accent animate-pulse'}`}></div>
            {loading ? 'ACQUIRING TELEMETRY...' : 'SYSTEM ONLINE'}
          </div>
          
          {lastRefreshTime && (
            <div className="text-xs text-white/40">
              TLE AS OF: {lastRefreshTime.toISOString().split('T')[1].substring(0, 5)}Z
            </div>
          )}
          <button 
            onClick={() => loadData(true)}
            disabled={loading}
            className="p-2 hover:bg-white/10 rounded transition-colors"
            title="Force Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        {/* Main 3D View */}
        <section className={`col-span-8 border border-white/10 rounded-lg bg-black/50 relative overflow-hidden flex items-center justify-center transition-all ${isDemoMode ? 'ring-1 ring-warning' : ''}`}>
          <div className="absolute top-4 left-4 text-xs font-mono text-white/30 flex flex-col gap-2 z-10">
            <div className="flex items-center gap-2">
              <Satellite className="w-4 h-4" />
              EARTH ORBIT VISUALIZATION
            </div>
            <div className="bg-white/5 p-2 rounded backdrop-blur max-w-sm border border-white/10">
              <button onClick={() => setInfoOpen(!infoOpen)} className="flex items-center justify-between w-full text-white/50 hover:text-white/80 transition-colors">
                <span className="flex items-center gap-2 font-bold"><Info className="w-3 h-3" /> HOW THIS WORKS</span>
                {infoOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {infoOpen && (
                <div className="mt-2 text-[10px] text-white/60 leading-relaxed border-t border-white/10 pt-2">
                  1. <b>Live TLE Data:</b> Orbital parameters are fetched from CelesTrak.<br/>
                  2. <b>SGP4 Propagation:</b> We mathematically project trajectories 24h into the future.<br/>
                  3. <b>Pairwise Screening:</b> Altitude bands are filtered, then close passes under 10km are calculated.<br/>
                  4. <b>AI Interpretation:</b> Complex conjunction metrics are translated into operational tactical briefings.
                </div>
              )}
            </div>
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-sm font-mono tracking-widest text-white/20">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              [ INITIALIZING 3D RENDER ENGINE ]
            </div>
          ) : error && !isDemoMode ? (
            <div className="absolute inset-0 bg-background/80 backdrop-blur z-20 flex flex-col items-center justify-center p-8 text-center border-2 border-critical rounded-lg">
              <AlertTriangle className="w-12 h-12 text-critical mb-4" />
              <h2 className="text-xl font-bold mb-2">TELEMETRY OFFLINE</h2>
              <p className="text-white/60 mb-6 max-w-md">
                Unable to reach CelesTrak and no cached data is available. 
                <br /><br />
                <span className="font-mono text-xs text-critical/80 bg-critical/10 p-2 rounded block">{error}</span>
              </p>
              <button 
                onClick={() => setDemoMode(true)}
                className="bg-warning/20 hover:bg-warning/40 text-warning border border-warning/50 px-6 py-3 rounded transition-colors font-bold flex items-center gap-2"
              >
                <FlaskConical className="w-5 h-5" />
                LOAD DEMO SCENARIO
              </button>
            </div>
          ) : (
            <OrbitGlobe orbits={orbits} />
          )}
        </section>

        {/* Right Sidebar - Alerts */}
        <aside className="col-span-4 border border-white/10 rounded-lg p-4 flex flex-col gap-4 bg-white/5 overflow-hidden">
          <div className="flex items-center justify-between shrink-0 border-b border-white/10 pb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Active Alerts
            </h2>
            <select 
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value as FilterTier)}
              className="bg-background text-white/70 border border-white/10 rounded px-2 py-1 text-xs font-mono outline-none"
            >
              <option value="all">ALL TIERS</option>
              <option value="critical">CRITICAL ONLY</option>
              <option value="high">HIGH ONLY</option>
              <option value="moderate">MODERATE ONLY</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 font-mono text-xs cursor-pointer">
            {loading ? (
              <div className="flex items-center justify-center h-full text-white/30">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
              </div>
            ) : error && !isDemoMode ? (
              <div className="text-critical/50 p-4 border border-critical/20 rounded flex flex-col items-center justify-center h-48 text-center gap-4">
                <AlertTriangle className="w-8 h-8 opacity-50" />
                Data unavailable.
              </div>
            ) : conjunctions.length === 0 ? (
              <div className="text-white/30 p-4 border border-white/10 rounded flex flex-col items-center justify-center h-48 text-center gap-4">
                <ShieldAlert className="w-8 h-8 opacity-50" />
                No conjunctions above the 10km threshold in the next 24h — this is expected most of the time.
                <button 
                  onClick={() => setDemoMode(true)}
                  className="bg-accent/20 hover:bg-accent/40 text-accent px-4 py-2 rounded transition-colors mt-2 font-bold"
                >
                  Load Demo Scenario
                </button>
              </div>
            ) : (
              conjunctions.map((event, i) => {
                const isActive = activeEvent === event;
                const msToApproach = new Date(event.timeOfClosestApproach).getTime() - Date.now();
                const hours = Math.floor(msToApproach / (1000 * 60 * 60));
                const mins = Math.floor((Math.abs(msToApproach) % (1000 * 60 * 60)) / (1000 * 60));
                const isPast = msToApproach < 0;
                
                return (
                  <div 
                    key={i} 
                    onClick={() => handleSelectEvent(event)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectEvent(event); }}
                    className={`p-3 rounded border transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-accent ${isActive ? 'bg-white/10 ring-1 ring-accent' : ''} ${event.riskTier === 'critical' ? 'border-critical/50' : 'border-warning/50'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className={`font-bold flex items-center gap-1 ${event.riskTier === 'critical' ? 'text-critical' : 'text-warning'}`}>
                        {event.riskTier === 'critical' ? <ShieldAlert className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        RISK: {event.riskTier.toUpperCase()}
                      </div>
                      <div className="text-white/40 text-[10px]">
                        {isPast ? 'PASSED' : `T- ${hours}h ${mins}m`}
                      </div>
                    </div>
                    
                    <div className="text-white/90">{event.objectA.name}</div>
                    <div className="text-white/50 my-1 text-[10px]">vs</div>
                    <div className="text-white/90">{event.objectB.name}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-white/50">Dist: {event.closestApproachKm.toFixed(3)} km</div>
                      
                      {isDemoMode && isActive && (
                        <button 
                          onClick={(e) => handleFastForward(e, event)}
                          className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${timeCursorIndex !== null ? 'bg-white/20 text-white' : 'bg-accent/20 text-accent hover:bg-accent/40'}`}
                          title="Fast Forward to Closest Approach"
                        >
                          <FastForward className="w-3 h-3" />
                          {timeCursorIndex !== null ? 'RESUME' : 'JUMP'}
                        </button>
                      )}
                    </div>
                    
                    {/* Lazy Loaded AI Briefing */}
                    {isActive && (
                      <div className="mt-4 pt-4 border-t border-white/10 flex flex-col gap-3 cursor-default" onClick={e => e.stopPropagation()}>
                        <h3 className="text-[10px] font-bold text-accent flex items-center gap-2">
                          <Bot className="w-3 h-3" /> TACTICAL AI BRIEF
                        </h3>
                        
                        {briefLoading ? (
                          <div className="flex items-center gap-2 text-white/40 italic">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analyzing scenario...
                          </div>
                        ) : briefError ? (
                          <div className="text-critical flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            {briefError}
                          </div>
                        ) : briefData ? (
                          <div className="animate-in fade-in flex flex-col gap-3">
                            <div>
                              <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Summary</div>
                              <div className="text-white/90 font-sans">{briefData.summary}</div>
                            </div>
                            <div>
                              <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Implication</div>
                              <div className="text-white/80 font-sans">{briefData.implication}</div>
                            </div>
                            <div className="text-[9px] text-white/30 italic">
                              {briefData.caveat}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
