'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from '@/lib/store';

// 1 Scene Unit = 1000 km
const SCALE = 1 / 1000;
const EARTH_RADIUS_KM = 6371;

type TrailPoint = [number, number, number];

export interface OrbitData {
  noradId: number;
  name: string;
  type: string;
  trail: TrailPoint[]; // Extracted positions scaled to scene units
  isAtRisk: boolean;
  riskTier?: 'critical' | 'high' | 'moderate' | 'low';
}

export interface ConjunctionLink {
  posA: TrailPoint;
  posB: TrailPoint;
  riskTier: 'critical' | 'high' | 'moderate' | 'low';
}

interface OrbitGlobeProps {
  orbits: OrbitData[];
  conjunctionLinks?: ConjunctionLink[];
}

function Earth() {
  return (
    <group>
      <Sphere args={[EARTH_RADIUS_KM * SCALE, 64, 64]}>
        <meshPhongMaterial 
          color="#0a1b3f" 
          emissive="#041024" 
          specular="#223344" 
          shininess={15} 
          transparent={true}
          opacity={0.9}
        />
      </Sphere>
      {/* Grid overlay for "hacker" look */}
      <Sphere args={[EARTH_RADIUS_KM * SCALE + 0.01, 32, 32]}>
        <meshBasicMaterial 
          color="#1e3a8a" 
          wireframe={true}
          transparent={true}
          opacity={0.25}
        />
      </Sphere>
    </group>
  );
}

function Atmosphere() {
  return (
    <Sphere args={[(EARTH_RADIUS_KM + 100) * SCALE, 32, 32]}>
      <meshBasicMaterial 
        color="#38bdf8" 
        transparent={true} 
        opacity={0.1} 
        side={THREE.BackSide} 
      />
    </Sphere>
  );
}

function Satellite({ data }: { data: OrbitData }) {
  const pointRef = useRef<THREE.Mesh>(null);
  const activeEvent = useAppStore(state => state.activeEvent);
  const timeCursorIndex = useAppStore(state => state.timeCursorIndex);
  
  const isActive = activeEvent && (data.noradId === activeEvent.objectA.noradId || data.noradId === activeEvent.objectB.noradId);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!pointRef.current || data.trail.length === 0) return;
    
    let progress = 0;
    const time = clock.getElapsedTime();

    if (timeCursorIndex !== null) {
      progress = timeCursorIndex;
    } else {
      const speedMultiplier = 0.5; 
      progress = (time * speedMultiplier) % data.trail.length;
    }

    const index = Math.floor(progress);
    const nextIndex = (index + 1) % data.trail.length;
    const lerpFactor = progress - index;
    
    const p1 = data.trail[index];
    const p2 = data.trail[nextIndex];
    
    pointRef.current.position.set(
      p1[0] + (p2[0] - p1[0]) * lerpFactor,
      p1[1] + (p2[1] - p1[1]) * lerpFactor,
      p1[2] + (p2[2] - p1[2]) * lerpFactor
    );

    if (isActive && materialRef.current) {
      // Pulse opacity
      materialRef.current.opacity = 0.4 + 0.6 * Math.sin(time * 5);
    } else if (materialRef.current) {
      materialRef.current.opacity = 0.3;
    }
  });

  const getRiskColor = () => {
    if (data.riskTier === 'critical') return '#ef4444'; 
    if (data.riskTier === 'high' || data.riskTier === 'moderate') return '#fbbf24'; 
    return '#38bdf8'; 
  };

  const color = getRiskColor();

  return (
    <group>
      <Line 
        points={data.trail} 
        color={isActive ? '#ffffff' : color} 
        transparent 
        lineWidth={isActive ? 2 : 1} 
      >
        <lineBasicMaterial ref={materialRef} attach="material" color={isActive ? '#ffffff' : color} transparent opacity={0.3} />
      </Line>
      <mesh ref={pointRef}>
        <sphereGeometry args={[isActive ? 0.1 : 0.05, 8, 8]} />
        <meshBasicMaterial color={isActive ? '#ffffff' : color} />
      </mesh>
    </group>
  );
}

function CameraRig({ orbits }: { orbits: OrbitData[] }) {
  const { controls } = useThree();
  const activeEvent = useAppStore(state => state.activeEvent);

  useFrame(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const ctrl = controls as any;
    if (activeEvent && ctrl && ctrl.target) {
      // Find one of the objects to look at
      const obj = orbits.find(o => o.noradId === activeEvent.objectA.noradId);
      if (obj && obj.trail.length > 0) {
        // Just look at its first position (or we could track it live)
        const [x, y, z] = obj.trail[0];
        const targetVec = new THREE.Vector3(x, y, z);
        
        // Smoothly interpolate camera target
        ctrl.target.lerp(targetVec, 0.05);
      }
    } else if (ctrl && ctrl.target) {
      // Return to center
      ctrl.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });

  return null;
}

export default function OrbitGlobe({ orbits, conjunctionLinks = [] }: OrbitGlobeProps) {
  return (
    <div className="w-full h-full min-h-[500px]">
      <Canvas camera={{ position: [0, 15, 25], fov: 45 }}>
        <color attach="background" args={['#050810']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <Earth />
        <Atmosphere />
        
        {orbits.map((orbit) => (
          <Satellite key={orbit.noradId} data={orbit} />
        ))}

        {conjunctionLinks.map((link, idx) => (
          <Line 
            key={idx} 
            points={[link.posA, link.posB]} 
            color={link.riskTier === 'critical' ? '#ef4444' : '#fbbf24'} 
            lineWidth={2}
            dashed={true}
          />
        ))}

        <CameraRig orbits={orbits} />

        <OrbitControls 
          makeDefault
          enablePan={false} 
          minDistance={EARTH_RADIUS_KM * SCALE + 1} 
          maxDistance={50}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}
