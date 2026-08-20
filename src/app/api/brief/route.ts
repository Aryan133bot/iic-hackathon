import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { ConjunctionEvent } from '@/lib/types/orbits';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// In-memory cache keyed by "noradA-noradB-timestamp"
const briefingCache = new Map<string, unknown>();

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

    // Cache key
    const cacheKey = `${event.objectA.noradId}-${event.objectB.noradId}-${event.timeOfClosestApproach}`;
    if (briefingCache.has(cacheKey)) {
      return NextResponse.json(briefingCache.get(cacheKey));
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const prompt = `
You are an orbital mechanics AI assistant working at a Space Situational Awareness (SSA) Mission Control.
Generate a structured briefing analyzing the following conjunction event for a satellite operator who does NOT have an astrodynamics background.

Event Details:
- Primary Object: ${event.objectA.name} (NORAD: ${event.objectA.noradId})
- Secondary Object: ${event.objectB.name} (NORAD: ${event.objectB.noradId})
- Risk Tier: ${event.riskTier.toUpperCase()}
- Time of Closest Approach: ${new Date(event.timeOfClosestApproach).toUTCString()}
- Miss Distance: ${event.closestApproachKm.toFixed(3)} km
- Relative Velocity: ${event.relativeVelocityKmS.toFixed(3)} km/s

CRITICAL INSTRUCTIONS:
1. Do NOT invent or hallucinate any numbers. Use exactly the distance, velocity, and time figures provided above.
2. Provide a one-line plain-English summary of the risk.
3. Provide a practical implication (e.g., should they maneuver or monitor?).
4. Include a brief, honest caveat noting this is a simplified risk assessment (miss-distance based, not full covariance-based probability of collision).
5. Output your response as structured JSON.
`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A one-line plain-English summary of the risk"
            },
            implication: {
              type: Type.STRING,
              description: "The practical implication (e.g., should the operator consider a maneuver, or is this within normal margins)"
            },
            riskTier: {
              type: Type.STRING,
              description: "The risk tier label exactly matching the input"
            },
            caveat: {
              type: Type.STRING,
              description: "A brief, honest caveat noting this is a simplified risk assessment (miss-distance based, not full covariance-based probability of collision)"
            }
          },
          required: ["summary", "implication", "riskTier", "caveat"]
        }
      }
    });

    const text = response.text || '';
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(text);
    } catch {
      console.error('Failed to parse AI JSON response:', text);
      // Fallback to raw text if JSON parsing fails
      parsedResponse = {
        summary: "Analysis Generated:",
        implication: text,
        caveat: "This is a simplified risk assessment (miss-distance based, not full covariance-based probability of collision).",
        riskTier: event.riskTier.toUpperCase()
      };
    }

    const payload = { brief: parsedResponse };
    
    // Save to cache
    briefingCache.set(cacheKey, payload);

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error('Gemini API Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred during AI generation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
