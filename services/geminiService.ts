
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TimelineEvent, SceneHotspot } from "../types";

// Helper to decode base64 string to Uint8Array
const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM data returned by Gemini TTS.
 * This data is headerless 16-bit mono 24kHz.
 */
export const decodeRawPcm = async (
  base64Data: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  let byteData = decodeBase64(base64Data);
  const sampleRate = 24000;
  const numChannels = 1;
  
  if (byteData.length % 2 !== 0) {
      byteData = byteData.slice(0, byteData.length - 1);
  }

  const dataInt16 = new Int16Array(byteData.buffer);
  const frameCount = dataInt16.length / numChannels;
  
  const buffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  
  return buffer;
};

/**
 * Decodes standard containerized audio (WebM, MP3, WAV) from base64.
 */
export const decodeStandardAudio = async (
  base64Data: string,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  const byteData = decodeBase64(base64Data);
  return await audioContext.decodeAudioData(byteData.buffer);
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryOperation<T>(
  operation: () => Promise<T>, 
  retries = 3, 
  baseDelay = 1500
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.code;
    const message = error?.message || "";
    
    const isRetryable = 
      status === 429 || 
      status === 503 || 
      status === 500 || 
      status === 504 ||
      message.includes('429') || 
      message.includes('503') ||
      message.includes('overloaded') ||
      message.includes('quota');

    if (retries > 0 && isRetryable) {
      const delay = baseDelay + Math.random() * 1000;
      await wait(delay);
      return retryOperation(operation, retries - 1, baseDelay * 1.5);
    }
    throw error;
  }
}

export const identifyLandmark = async (imageBase64: string): Promise<{ name: string; location: string }> => {
  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: "Identify this landmark. Return ONLY a JSON object with 'name' and 'location' properties." }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            location: { type: Type.STRING }
          },
          required: ['name', 'location']
        }
      }
    });

    return JSON.parse(response.text || '{"name": "Unknown", "location": "Unknown"}');
  });
};

export const generateTimelinePlan = async (landmarkName: string, location: string): Promise<TimelineEvent[]> => {
  const researchResponse = await retryOperation(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Search for historical facts and key temporal points about ${landmarkName} in ${location}. Focus on 4 major eras.`,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
  });

  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Based on the following research, create a historical timeline for "${landmarkName}".
      I need exactly 4 distinct temporal points. 
      For each point, provide a year, a title, a short historical description, and a visualPrompt.
      
      Research Data:
      ${researchResponse.text}
      `,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.INTEGER },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              visualPrompt: { type: Type.STRING }
            },
            required: ['year', 'title', 'description', 'visualPrompt']
          }
        }
      }
    });

    const rawEvents = JSON.parse(response.text || '[]');
    return rawEvents.map((e: any) => ({
      ...e,
      imageUrl: undefined,
      isGenerated: false,
      isPanoramic: true
    }));
  });
};

export const generateTimelineFromResearch = async (topic: string, report: string): Promise<TimelineEvent[]> => {
  return retryOperation(async () => {
    const prompt = `
      Based on this research report about "${topic}", create a 4-point historical timeline.
      Report: "${report.substring(0, 5000)}"
      For each point, provide:
      - year: integer
      - title: string
      - description: string
      - visualPrompt: descriptive text for generating a 360 panoramic view of this moment.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.INTEGER },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              visualPrompt: { type: Type.STRING }
            },
            required: ['year', 'title', 'description', 'visualPrompt']
          }
        }
      }
    });

    const rawEvents = JSON.parse(response.text || '[]');
    return rawEvents.map((e: any) => ({
      ...e,
      imageUrl: undefined,
      isGenerated: false,
      isPanoramic: true
    }));
  });
};

export const generateHistoricalImage = async (
  event: TimelineEvent,
  landmarkName: string,
  referenceImageBase64?: string
): Promise<string> => {
  return retryOperation(async () => {
    const model = 'gemini-2.5-flash-image';
    let promptText = `Generate a photorealistic, ultra-high-definition, seamless equirectangular 360-degree panoramic view of ${landmarkName} in the year ${event.year}. ${event.visualPrompt}.`;
    
    let parts: any[] = [];
    if (referenceImageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: referenceImageBase64 } });
      promptText = `Historical 360 expansion for ${event.year}: ${event.visualPrompt}`;
    }
    parts.push({ text: promptText });

    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: { imageConfig: { aspectRatio: "16:9" } }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return part.inlineData.data;
    }
    throw new Error("No image generated");
  });
};

export const identifyHotspotsInScene = async (
  imageBase64: string,
  landmarkName: string,
  year: number
): Promise<SceneHotspot[]> => {
  return retryOperation(async () => {
    const prompt = `
      Analyze this historical 360-degree panorama of ${landmarkName} in ${year}. 
      Identify 3-4 significant 'nearby' buildings, statues, or architectural features visible in the background or periphery.
      For each, provide:
      - 'name': The name of the structure.
      - 'description': A brief historical fact about it in the year ${year}.
      - 'x': Approximate horizontal position (0 to 1, where 0.5 is center).
      - 'y': Approximate vertical position (0 to 1, where 0.5 is horizon).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER }
            },
            required: ['name', 'description', 'x', 'y']
          }
        }
      }
    });

    const results = JSON.parse(response.text || '[]');
    return results.map((r: any, i: number) => ({
      ...r,
      id: `hotspot-${i}-${year}`
    }));
  });
};

export const generateResearchImage = async (prompt: string): Promise<string> => {
  return retryOperation(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A historical illustration for a research report: ${prompt}. High quality, documentary style.` }]
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) return part.inlineData.data;
    }
    throw new Error("Research image generation failed");
  });
};

export const conductHistoricalResearch = async (audioBase64: string): Promise<{ 
  approved: boolean; 
  reason?: string; 
  topic?: string;
  title?: string; 
  report?: string;
  imagePrompts?: string[];
  sources?: { title: string; url: string }[];
}> => {
  // Step 1: Research (Grounded Search from Audio)
  // We avoid JSON here as per the rules: grounded responses might not be JSON.
  const researchTextResponse = await retryOperation(async () => {
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/webm', data: audioBase64 } },
          { text: "Listen to this research request. Use Google Search to conduct thorough historical research on the identified topic. Produce a detailed report with facts and key eras." }
        ]
      },
      config: { 
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
  });

  const reportText = researchTextResponse.text || "";
  const groundingChunks = researchTextResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const extractedSources = groundingChunks
    .filter((chunk: any) => chunk.web)
    .map((chunk: any) => ({
      title: chunk.web.title || "Source",
      url: chunk.web.uri || "#"
    }));

  // Step 2: Synthesis into structured JSON
  return retryOperation(async () => {
    const synthesisResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Convert the following historical research report into a structured JSON dossier. 
      Ensure 'approved' is true if the content is historical/educational. 
      Identify the core topic and create a formal title.
      Synthesize the findings into a 'report' string.
      Provide 2-3 'imagePrompts' for historical illustrations.
      
      Report Content:
      ${reportText}
      `,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            title: { type: Type.STRING },
            topic: { type: Type.STRING },
            report: { type: Type.STRING },
            imagePrompts: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }
            }
          },
          required: ['approved']
        }
      }
    });

    const parsed = JSON.parse(synthesisResponse.text || '{"approved": false}');
    return {
      ...parsed,
      sources: extractedSources.length > 0 ? extractedSources : (parsed.sources || [])
    };
  });
};

export const validateRelevance = async (
  landmarkName: string,
  year: number,
  content: string,
  isAudio: boolean
): Promise<{ relevant: boolean; feedback: string }> => {
  return retryOperation(async () => {
    const parts: any[] = [];
    
    const relevanceGuidance = `
      Instructions: Determine if the provided content is relevant to the landmark "${landmarkName}".
      Relevance criteria:
      1. Historical or architectural facts about "${landmarkName}" in the year ${year} or any other era.
      2. Personal memories, anecdotes, or descriptions of a recent visit to "${landmarkName}".
      3. Observations about the landmark's current state.
      
      DO NOT REJECT content just because it refers to a time after ${year}.
      ONLY REJECT if the content is completely unrelated.
    `;

    if (isAudio) {
      parts.push({ inlineData: { mimeType: 'audio/webm', data: content } });
      parts.push({ text: `${relevanceGuidance}\n\nReview this audio recording. If it is relevant, return {"relevant": true, "feedback": ""}. Otherwise return {"relevant": false, "feedback": "Brief explanation."}.` });
    } else {
      parts.push({ text: `${relevanceGuidance}\n\nContent: "${content}"\n\nIs this text relevant? Return JSON object with "relevant" (bool) and "feedback" (string).` });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relevant: { type: Type.BOOLEAN },
            feedback: { type: Type.STRING }
          },
          required: ['relevant', 'feedback']
        }
      }
    });

    return JSON.parse(response.text || '{"relevant": false, "feedback": "Unable to verify content."}');
  });
};

export const generateNarration = async (landmarkName: string, timeline: TimelineEvent[]): Promise<string> => {
  const scriptResponse = await retryOperation(async () => {
    const storyPrompt = `Write a short narration about ${landmarkName}'s evolution from ${timeline[0].year} to today. Plain text.`;
    return await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: storyPrompt,
      config: { thinkingBudget: 0 }
    });
  });

  const script = scriptResponse.text || `Welcome to ${landmarkName}.`;

  return retryOperation(async () => {
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: script }] }],
      config: {
        responseModalities: [Modality.AUDIO], 
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
        },
      },
    });

    const parts = ttsResponse.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          return part.inlineData.data;
        }
      }
    }
    
    return "";
  });
};
