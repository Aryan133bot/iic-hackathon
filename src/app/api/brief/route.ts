import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConjunctionEvent } from '@/lib/types/orbits';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to .env.local' },
        { status: 500 }
      );
    }

    const event: ConjunctionEvent = await req.json();

    if (!event || !event.objectA || !event.objectB) {
      return NextResponse.json({ error: 'Invalid conjunction event data provided' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an orbital mechanics AI assistant working at a Space Situational Awareness (SSA) Mission Control.
Generate a short, urgent, tactical briefing (max 3-4 sentences) analyzing the following conjunction event.
Format the output as a clean text response suitable for a dashboard (no markdown headers).
Maintain a highly professional, clinical, aerospace tone.

Event Details:
- Primary Object: ${event.objectA.name} (NORAD: ${event.objectA.noradId})
- Secondary Object: ${event.objectB.name} (NORAD: ${event.objectB.noradId})
- Risk Tier: ${event.riskTier.toUpperCase()}
- Time of Closest Approach: ${new Date(event.timeOfClosestApproach).toUTCString()}
- Miss Distance: ${event.closestApproachKm.toFixed(3)} km
- Relative Velocity: ${event.relativeVelocityKmS.toFixed(3)} km/s

Provide a brief assessment of the risk and recommend whether an avoidance maneuver should be considered based on the risk tier.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ brief: text });
  } catch (error: unknown) {
    console.error('Gemini API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred during AI generation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
