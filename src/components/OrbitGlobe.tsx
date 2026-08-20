'use client';

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Line, Sphere } from '@react-three/drei';
import * as THREE from 'three';

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
    <Sphere args={[EARTH_RADIUS_KM * SCALE, 64, 64]}>
      {/* A clean, reliable procedural-looking Earth material */}
      <meshPhongMaterial 
        color="#0a1b3f" 
        emissive="#041024" 
        specular="#223344" 
        shininess={15} 
        transparent={true}
        opacity={0.9}
        wireframe={false}
      />
    </Sphere>
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
  
  // Animation logic
  // A simple time scrubber looping along the trail
  useFrame(({ clock }) => {
    if (!pointRef.current || data.trail.length === 0) return;
    
    const time = clock.getElapsedTime();
    // 60x speed, assuming trail points are e.g. 30s apart, we animate fast.
    // Let's abstract time as a simple percentage loop
    const speedMultiplier = 0.5; // adjust to taste
    const progress = (time * speedMultiplier) % data.trail.length;
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
  });

  const getRiskColor = () => {
    if (data.riskTier === 'critical') return '#ef4444'; // Red
    if (data.riskTier === 'high' || data.riskTier === 'moderate') return '#fbbf24'; // Amber
    return '#38bdf8'; // Default Cyan
  };

  const color = getRiskColor();

  return (
    <group>
      {/* Orbit Trail */}
      <Line 
        points={data.trail} 
        color={color} 
        opacity={0.3} 
        transparent 
        lineWidth={1} 
      />
      {/* Current Position Marker */}
      <mesh ref={pointRef}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
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

        {/* Render conjunction links if any exist */}
        {conjunctionLinks.map((link, idx) => (
          <Line 
            key={idx} 
            points={[link.posA, link.posB]} 
            color={link.riskTier === 'critical' ? '#ef4444' : '#fbbf24'} 
            lineWidth={2}
            dashed={true}
          />
        ))}

        <OrbitControls 
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
