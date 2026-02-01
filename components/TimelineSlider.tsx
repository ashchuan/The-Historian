
import React, { useState, useRef, useEffect } from 'react';
import { GripHorizontal } from 'lucide-react';
import { TimelineEvent } from '../types';

interface TimelineSliderProps {
  events: TimelineEvent[];
  currentProgress: number;
  onChange: (progress: number) => void;
}

const TimelineSlider: React.FC<TimelineSliderProps> = ({ events, currentProgress, onChange }) => {
  const [position, setPosition] = useState({ x: 0, y: -40 }); // Initial offset from bottom
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialPos = useRef({ x: 0, y: 0 });

  if (events.length === 0) return null;

  const min = 0;
  const max = events.length - 1;
  const currentIndex = Math.round(currentProgress);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag if clicking the background or handle, not the interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('input') || target.closest('button') || target.closest('.year-trigger')) {
      return;
    }

    setIsDragging(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    initialPos.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      
      setPosition({
        x: initialPos.current.x + dx,
        y: initialPos.current.y + dy
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div 
      onMouseDown={handleMouseDown}
      className={`w-full max-w-4xl mx-auto px-6 py-4 bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-3xl fixed bottom-0 left-1/2 z-[100] flex flex-col items-center shadow-2xl transition-shadow ${isDragging ? 'shadow-amber-500/20 cursor-grabbing' : 'cursor-grab'}`}
      style={{ 
        transform: `translateX(-50%) translate(${position.x}px, ${position.y}px)`,
        userSelect: isDragging ? 'none' : 'auto'
      }}
    >
      {/* Drag Handle Indicator */}
      <div className="absolute top-2 opacity-30 text-slate-400">
        <GripHorizontal size={16} />
      </div>

      {/* Year Indicators with distance-based scaling */}
      <div className="w-full flex justify-between mb-4 px-2 mt-2">
        {events.map((event, idx) => {
          const distance = Math.abs(currentProgress - idx);
          const isActive = distance < 0.5;
          const scale = Math.max(0.8, 1.2 - distance * 0.4);
          const opacity = Math.max(0.3, 1 - distance * 0.8);

          return (
            <div 
              key={idx} 
              className="year-trigger flex flex-col items-center cursor-pointer transition-all duration-150"
              style={{ transform: `scale(${scale})`, opacity }}
              onClick={() => onChange(idx)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className={`text-[10px] font-bold mb-1 ${isActive ? 'text-amber-400' : 'text-slate-500'} tracking-tighter`}>
                {event.year}
              </span>
              <div className={`w-2.5 h-2.5 rounded-full shadow-lg transition-colors ${isActive ? 'bg-amber-400 shadow-amber-500/50' : 'bg-slate-700'}`} />
            </div>
          );
        })}
      </div>

      {/* Slider Input - Continuous Scrubbing */}
      <div className="relative w-full px-1">
        <input
          type="range"
          min={min}
          max={max}
          step="0.01"
          value={currentProgress}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onMouseDown={(e) => e.stopPropagation()}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 transition-all hover:h-2"
        />
      </div>

      {/* Current Event Title */}
      <div className="mt-3 text-center h-6 flex items-center justify-center">
        <h3 className="text-sm text-amber-400/90 font-serif tracking-[0.2em] uppercase animate-in fade-in zoom-in-95 duration-500">
          {events[currentIndex]?.title}
        </h3>
      </div>
    </div>
  );
};

export default TimelineSlider;
