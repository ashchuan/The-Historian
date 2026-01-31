import React from 'react';
import { TimelineEvent } from '../types';

interface TimelineSliderProps {
  events: TimelineEvent[];
  currentProgress: number;
  onChange: (progress: number) => void;
}

const TimelineSlider: React.FC<TimelineSliderProps> = ({ events, currentProgress, onChange }) => {
  if (events.length === 0) return null;

  const min = 0;
  const max = events.length - 1;
  const currentIndex = Math.round(currentProgress);

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-4 bg-slate-900/80 backdrop-blur-md border-t border-slate-700 fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center">
      
      {/* Year Indicators with distance-based scaling */}
      <div className="w-full flex justify-between mb-4 px-2">
        {events.map((event, idx) => {
          const distance = Math.abs(currentProgress - idx);
          const isActive = distance < 0.5;
          const scale = Math.max(0.8, 1.2 - distance * 0.4);
          const opacity = Math.max(0.3, 1 - distance * 0.8);

          return (
            <div 
              key={idx} 
              className="flex flex-col items-center cursor-pointer transition-all duration-150"
              style={{ transform: `scale(${scale})`, opacity }}
              onClick={() => onChange(idx)}
            >
              <span className={`text-xs font-bold mb-1 ${isActive ? 'text-amber-400' : 'text-slate-400'}`}>
                {event.year}
              </span>
              <div className={`w-3 h-3 rounded-full shadow-lg transition-colors ${isActive ? 'bg-amber-400 shadow-amber-500/50' : 'bg-slate-600'}`} />
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
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 transition-all hover:h-3"
        />
      </div>

      {/* Current Event Title */}
      <div className="mt-4 text-center h-8">
        <h3 className="text-xl text-amber-400 font-serif tracking-widest uppercase animate-in fade-in transition-all duration-300">
          {events[currentIndex]?.title}
        </h3>
      </div>
    </div>
  );
};

export default TimelineSlider;
