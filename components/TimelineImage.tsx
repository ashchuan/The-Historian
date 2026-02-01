
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, Info } from 'lucide-react';
import { Viewer } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { TimelineEvent, SceneHotspot } from '../types';
import * as geminiService from '../services/geminiService';

interface TimelineImageProps {
  index: number;
  event: TimelineEvent;
  landmarkName: string;
  referenceImage?: string;
  onGenerated: (imageUrl: string, hotspots?: SceneHotspot[]) => void;
  currentProgress: number;
  isPanoramicMode: boolean;
}

const TimelineImage: React.FC<TimelineImageProps> = ({ 
  index,
  event, 
  landmarkName, 
  referenceImage, 
  onGenerated,
  currentProgress,
  isPanoramicMode
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<SceneHotspot | null>(null);
  const [hotspotScreenPos, setHotspotScreenPos] = useState<{ x: number, y: number } | null>(null);
  
  const psvContainerRef = useRef<HTMLDivElement>(null);
  const psvRef = useRef<Viewer | null>(null);
  const markersPluginRef = useRef<any>(null);

  const distance = Math.abs(currentProgress - index);
  const opacity = Math.max(0, Math.exp(-Math.pow(distance, 2) * (isPanoramicMode ? 3 : 2)));
  const isVisible = distance < (isPanoramicMode ? 1.0 : 1.2);
  const isTarget = distance < 0.5;

  const visualStyle = useMemo(() => {
    const year = event.year;
    let baseFilters = "";
    let grainOpacity = 0;
    if (year < 1920) {
      baseFilters = "sepia(0.6) contrast(1.1) brightness(0.9)";
      grainOpacity = 0.4;
    } else if (year < 1960) {
      baseFilters = "grayscale(1) contrast(1.05) brightness(0.95)";
      grainOpacity = 0.2;
    } else if (year < 2000) {
      baseFilters = "saturate(0.8) sepia(0.1) brightness(1.02)";
      grainOpacity = 0.05;
    } else {
      baseFilters = "saturate(1.05) contrast(1.02)";
      grainOpacity = 0;
    }
    return { baseFilters, grainOpacity };
  }, [event.year]);

  useEffect(() => {
    if (event.imageUrl || isGenerating) return;

    const triggerGeneration = async () => {
      setIsGenerating(true);
      try {
        const imageBase64 = await geminiService.generateHistoricalImage(event, landmarkName, referenceImage);
        const imageUrl = `data:image/jpeg;base64,${imageBase64}`;
        
        // Background reconnaissance
        const hotspots = await geminiService.identifyHotspotsInScene(imageBase64, landmarkName, event.year);
        
        onGenerated(imageUrl, hotspots);
      } catch (error) {
        console.error("Failed to generate lazy image", error);
      } finally {
        setIsGenerating(false);
      }
    };

    if (distance < 1.1) {
      triggerGeneration();
    }
  }, [event.imageUrl, distance, landmarkName, referenceImage, index, onGenerated, event]);

  // Handle Photo Sphere Viewer instantiation
  useEffect(() => {
    if (isPanoramicMode && event.imageUrl && psvContainerRef.current && !psvRef.current) {
      psvRef.current = new Viewer({
        container: psvContainerRef.current,
        panorama: event.imageUrl,
        caption: `${event.title} (${event.year})`,
        loadingImg: '',
        mousewheel: true,
        mousemove: true,
        navbar: false,
        defaultZoomLvl: 0,
        plugins: [
          [MarkersPlugin, {
            markers: []
          }]
        ]
      });

      markersPluginRef.current = psvRef.current.getPlugin(MarkersPlugin);
      
      // Update: Trigger on hover for 360 view
      markersPluginRef.current.addEventListener('over-marker', ({ marker }: any) => {
        const hotspot = event.hotspots?.find(h => h.id === marker.id);
        if (hotspot && psvRef.current) {
          // Calculate screen coordinates for the 3D marker
          const coords = psvRef.current.dataHelper.vector3ToViewerCoords(marker.position);
          setHotspotScreenPos(coords);
          setSelectedHotspot(hotspot);
        }
      });

      // Update: Hide on leave
      markersPluginRef.current.addEventListener('leave-marker', () => {
        setSelectedHotspot(null);
        setHotspotScreenPos(null);
      });

      // Close tooltip when user interacts with the view (panning)
      psvRef.current.addEventListener('position-updated', () => {
        setSelectedHotspot(null);
        setHotspotScreenPos(null);
      });
    }

    return () => {
      if (psvRef.current) {
        psvRef.current.destroy();
        psvRef.current = null;
      }
    };
  }, [isPanoramicMode, event.imageUrl, event.year, index, event.title, event.hotspots]);

  // Sync Markers
  useEffect(() => {
    if (markersPluginRef.current && event.hotspots) {
      markersPluginRef.current.clearMarkers();
      event.hotspots.forEach(hotspot => {
        const yaw = (hotspot.x - 0.5) * 2 * Math.PI;
        const pitch = (0.5 - hotspot.y) * Math.PI;

        markersPluginRef.current.addMarker({
          id: hotspot.id,
          position: { yaw, pitch },
          html: '<div class="custom-marker"></div>',
          anchor: 'center center',
          tooltip: hotspot.name,
          data: hotspot
        });
      });
    }
  }, [event.hotspots]);

  const blurAmount = isPanoramicMode ? 0 : Math.min(12, distance * 10);
  const scale = isPanoramicMode ? 1 : (1 + (distance * 0.05));

  const handle2DHotspotEnter = (hotspot: SceneHotspot) => {
    setSelectedHotspot(hotspot);
    setHotspotScreenPos({ x: hotspot.x, y: hotspot.y });
  };

  const handle2DHotspotLeave = () => {
    setSelectedHotspot(null);
    setHotspotScreenPos(null);
  };

  if (!isVisible && !isGenerating && !event.imageUrl) return null;

  return (
    <div 
      className={`absolute inset-0 w-full h-full pointer-events-none transition-all duration-700 ease-out will-change-[opacity,transform,filter]`}
      style={{ 
        opacity, 
        zIndex: isTarget ? 30 : 10,
        transform: `scale(${scale})`,
        filter: isPanoramicMode ? 'none' : `${visualStyle.baseFilters} blur(${blurAmount}px)`,
        visibility: opacity > 0 ? 'visible' : 'hidden'
      }}
    >
      {isPanoramicMode && event.imageUrl ? (
        <>
          <div 
            ref={psvContainerRef} 
            className="absolute inset-0 w-full h-full pointer-events-auto"
          />
          {selectedHotspot && hotspotScreenPos && (
            <div 
              className="absolute w-80 bg-black/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl pointer-events-none z-[100] animate-in zoom-in-95 fade-in shadow-2xl"
              style={{
                left: `${hotspotScreenPos.x}px`,
                top: `${hotspotScreenPos.y}px`,
                transform: `translate(${hotspotScreenPos.x > (psvContainerRef.current?.clientWidth || 0) / 2 ? '-100%' : '0%'}, ${hotspotScreenPos.y > (psvContainerRef.current?.clientHeight || 0) / 2 ? '-100%' : '0%'}) translate(${hotspotScreenPos.x > (psvContainerRef.current?.clientWidth || 0) / 2 ? '-24px' : '24px'}, ${hotspotScreenPos.y > (psvContainerRef.current?.clientHeight || 0) / 2 ? '-24px' : '24px'})`
              }}
            >
              <div className="flex items-center gap-2 mb-3 text-amber-500">
                <Info size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Reconnaissance Log</span>
              </div>
              <h3 className="text-xl font-serif text-white mb-2">{selectedHotspot.name}</h3>
              <p className="text-sm text-slate-300 leading-relaxed font-light">{selectedHotspot.description}</p>
              <div className="mt-4 pt-4 border-t border-white/5 text-[10px] text-slate-500 uppercase tracking-widest">Temporal Point: {event.year}</div>
            </div>
          )}
        </>
      ) : (
        <>
          {event.imageUrl ? (
            <div className="relative w-full h-full">
               <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover" />
               
               {isTarget && event.hotspots?.map(hotspot => (
                 <div
                   key={hotspot.id}
                   onMouseEnter={() => handle2DHotspotEnter(hotspot)}
                   onMouseLeave={handle2DHotspotLeave}
                   className="absolute custom-marker pointer-events-auto transition-all cursor-help"
                   style={{ 
                     left: `${hotspot.x * 100}%`, 
                     top: `${hotspot.y * 100}%`, 
                     transform: `translate(-50%, -50%) ${selectedHotspot?.id === hotspot.id ? 'scale(1.25)' : 'scale(1)'}` 
                   }}
                 />
               ))}

               {selectedHotspot && isTarget && (
                  <div 
                    className="absolute w-64 bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-2xl pointer-events-none z-[80] animate-in fade-in zoom-in-95 shadow-xl"
                    style={{ 
                      left: `${selectedHotspot.x * 100}%`, 
                      top: `${selectedHotspot.y * 100}%`,
                      transform: `translate(${selectedHotspot.x > 0.5 ? '-100%' : '0%'}, ${selectedHotspot.y > 0.5 ? '-100%' : '0%'}) translate(${selectedHotspot.x > 0.5 ? '-20px' : '20px'}, ${selectedHotspot.y > 0.5 ? '-20px' : '20px'})`
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-2 text-amber-500">
                      <Info size={12} />
                      <span className="text-[9px] font-bold uppercase tracking-widest">Historical Site</span>
                    </div>
                    <h4 className="text-white text-xs font-bold uppercase mb-1">{selectedHotspot.name}</h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-4">{selectedHotspot.description}</p>
                  </div>
               )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950">
              <Loader2 size={40} className="text-amber-500 animate-spin opacity-40" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimelineImage;
