
import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Volume2, Loader2 } from 'lucide-react';
import { decodeRawPcm, decodeStandardAudio } from '../services/geminiService';

interface AudioPlayerProps {
  audioBase64: string | undefined;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioBase64 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  useEffect(() => {
    if (audioBase64) {
      loadAudio(audioBase64);
    }

    return () => {
      stopAudio();
    };
  }, [audioBase64]);

  const loadAudio = async (base64: string) => {
    try {
      setIsDecoding(true);
      // Initialize Audio Context lazily if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      let buffer: AudioBuffer;
      try {
        // Try decoding as standard containerized audio (WAV, MP3, etc)
        // This is usually what the Gemini API returns in Modality.AUDIO
        buffer = await decodeStandardAudio(base64, audioContextRef.current);
      } catch (standardError) {
        console.log("Standard decoding failed, attempting raw PCM fallback...");
        // Fallback to raw PCM if containerized decoding fails
        buffer = await decodeRawPcm(base64, audioContextRef.current);
      }

      audioBufferRef.current = buffer;
      stopAudio();
      pauseTimeRef.current = 0;
    } catch (e) {
      console.error("Critical audio decoding failure:", e);
    } finally {
      setIsDecoding(false);
    }
  };

  const playAudio = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return;

    // Resume context if suspended (browser policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBufferRef.current;
    source.connect(audioContextRef.current.destination);

    // Start from where we paused
    startTimeRef.current = audioContextRef.current.currentTime - pauseTimeRef.current;
    source.start(0, pauseTimeRef.current);

    source.onended = () => {
      setIsPlaying(false);
      pauseTimeRef.current = 0;
    };

    sourceNodeRef.current = source;
    setIsPlaying(true);
  };

  const pauseAudio = () => {
    if (sourceNodeRef.current && audioContextRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
      pauseTimeRef.current = audioContextRef.current.currentTime - startTimeRef.current;
      setIsPlaying(false);
    }
  };

  const stopAudio = () => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  };

  if (!audioBase64) return null;

  return (
    <button
      onClick={togglePlay}
      disabled={isDecoding || !audioBufferRef.current}
      className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all shadow-lg ${isDecoding ? 'bg-slate-700 animate-pulse cursor-wait' : 'bg-amber-500 hover:bg-amber-600 hover:shadow-amber-500/50 text-slate-900'
        }`}
    >
      {isDecoding ? <Loader2 size={20} className="animate-spin" /> : isPlaying ? <Pause size={20} /> : <Play size={20} />}
      <span className="uppercase tracking-wider text-sm">
        {isDecoding ? 'Decoding...' : isPlaying ? 'Pause Narration' : 'Listen to History'}
      </span>
      {!isDecoding && <Volume2 size={16} className="opacity-70" />}
    </button>
  );
};

export default AudioPlayer;
