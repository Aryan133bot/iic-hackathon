import React from 'react';
import { ShieldAlert, Activity, Satellite } from 'lucide-react';

export default function DashboardShell() {
  return (
    <main className="flex h-screen w-full flex-col p-4 gap-4">
      <header className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-accent w-6 h-6" />
          <h1 className="text-xl font-bold tracking-wider">ORBITGUARD</h1>
        </div>
        <div className="flex items-center gap-4 text-sm font-mono text-white/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
            SYSTEM ONLINE
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 gap-4">
        {/* Left Sidebar - Conjunction List Placeholder */}
        <aside className="col-span-3 border border-white/10 rounded-lg p-4 flex flex-col gap-4 bg-white/5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Active Alerts
          </h2>
          <div className="flex-1 flex items-center justify-center text-sm text-white/30 font-mono">
            Loading telemetry...
          </div>
        </aside>

        {/* Center - 3D View Placeholder */}
        <section className="col-span-6 border border-white/10 rounded-lg bg-black/50 relative overflow-hidden flex items-center justify-center">
          <div className="absolute top-4 left-4 text-xs font-mono text-white/30 flex items-center gap-2">
            <Satellite className="w-4 h-4" />
            EARTH ORBIT VISUALIZATION
          </div>
          <div className="text-sm font-mono tracking-widest text-white/20">
            [ 3D RENDER ENGINE OFFLINE ]
          </div>
        </section>

        {/* Right Sidebar - Details Placeholder */}
        <aside className="col-span-3 border border-white/10 rounded-lg p-4 bg-white/5">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-4">
            Analysis Brief
          </h2>
          <div className="space-y-4 font-mono text-xs text-white/60">
            <p>Select a conjunction event to view detailed collision risk analysis.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
