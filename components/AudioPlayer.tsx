
import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { decodeRawPcm } from '../services/geminiService';

interface AudioPlayerProps {
  audioBase64: string | undefined;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioBase64 }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);

  useEffect(() => {
    // Initialize Audio Context on mount
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    return () => {
      stopAudio();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, []);

  useEffect(() => {
    if (audioBase64 && audioContextRef.current) {
      loadAudio(audioBase64);
    }
  }, [audioBase64]);

  const loadAudio = async (base64: string) => {
    try {
      if (!audioContextRef.current) return;
      const buffer = await decodeRawPcm(base64, audioContextRef.current);
      audioBufferRef.current = buffer;
      // Reset state when new audio loads
      stopAudio();
      pauseTimeRef.current = 0;
    } catch (e) {
      console.error("Failed to decode audio", e);
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
      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-full font-bold transition-all shadow-lg hover:shadow-amber-500/50"
    >
      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      <span className="uppercase tracking-wider text-sm">{isPlaying ? 'Pause Narration' : 'Listen to History'}</span>
      <Volume2 size={16} className="opacity-70" />
    </button>
  );
};

export default AudioPlayer;
