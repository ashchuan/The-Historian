
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, MapPin, Loader2, ArrowLeft, Info, X, ZoomIn, ZoomOut, Maximize, RefreshCw, Globe, Save, Trash2, BookOpen, StickyNote, Mic, Download, FileText, CheckCircle2 } from 'lucide-react';
import { LandmarkData, LoadingState, ViewMode, SceneHotspot, UserNote, ResearchPaper } from './types';
import * as geminiService from './services/geminiService';
import * as storageService from './services/storageService';
import { generatePDF } from './services/pdfService';
import TimelineSlider from './components/TimelineSlider';
import AudioPlayer from './components/AudioPlayer';
import TimelineImage from './components/TimelineImage';
import UserNotesManager from './components/UserNotesManager';
import HistorianAgent from './components/HistorianAgent';

const PRESETS = [
  { id: 'eiffel', name: 'Eiffel Tower', location: 'Paris, France', image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&q=80&w=800' },
  { id: 'sagrada', name: 'Sagrada Família', location: 'Barcelona, Spain', image: 'https://images.unsplash.com/photo-1583779457094-0ddcf20a55e4?auto=format&fit=crop&q=80&w=1200' }, 
  { id: 'colosseum', name: 'Colosseum', location: 'Rome, Italy', image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800' },
  { id: 'stpauls', name: "St Paul's Cathedral", location: 'London, UK', image: 'https://images.unsplash.com/photo-1549893072-4bc678117f45?auto=format&fit=crop&q=80&w=800' },
  { id: 'tajmahal', name: 'Taj Mahal', location: 'Agra, India', image: 'https://images.unsplash.com/photo-1548013146-72479768bbaa?auto=format&fit=crop&q=80&w=800' },
  { id: 'greatwall', name: 'Great Wall of China', location: 'Huairou, China', image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&q=80&w=800' },
];

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.HOME);
  const [landmarkData, setLandmarkData] = useState<LandmarkData | null>(null);
  const [savedLandmarks, setSavedLandmarks] = useState<LandmarkData[]>([]);
  const [researchPapers, setResearchPapers] = useState<ResearchPaper[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle' });
  const [currentProgress, setCurrentProgress] = useState(0); 
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [isPanoramicMode, setIsPanoramicMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Pre-generation status tracking
  const [presetStatus, setPresetStatus] = useState<Record<string, 'ready' | 'loading' | 'idle'>>({});
  const [pregeneratedLandmarks, setPregeneratedLandmarks] = useState<Record<string, LandmarkData>>({});
  
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const currentEventIndex = Math.round(currentProgress);

  useEffect(() => {
    document.body.style.overflow = viewMode === ViewMode.EXPERIENCE ? 'hidden' : 'auto';
    if (viewMode === ViewMode.HOME) {
      loadInitialData();
    }
  }, [viewMode]);

  const loadInitialData = async () => {
    const all = await storageService.getAllLandmarks();
    setSavedLandmarks(all);
    
    const allPapers = await storageService.getAllResearchPapers();
    setResearchPapers(allPapers.sort((a, b) => b.timestamp - a.timestamp));

    // Initialize preset status from DB
    const status: Record<string, 'ready' | 'loading' | 'idle'> = {};
    const memoryCache: Record<string, LandmarkData> = {};
    
    for (const preset of PRESETS) {
      const cached = all.find(l => l.id === preset.id);
      if (cached) {
        status[preset.id] = 'ready';
        memoryCache[preset.id] = cached;
      } else {
        status[preset.id] = 'idle';
      }
    }
    setPresetStatus(status);
    setPregeneratedLandmarks(memoryCache);

    // Trigger background generation for any idle presets
    triggerBackgroundQueue(status);
  };

  const triggerBackgroundQueue = async (currentStatus: Record<string, 'ready' | 'loading' | 'idle'>) => {
    const idlePresets = PRESETS.filter(p => currentStatus[p.id] === 'idle');
    // Speed up pre-generation using parallel processing for all idle presets simultaneously
    await Promise.all(idlePresets.map(preset => pregeneratePreset(preset)));
  };

  const pregeneratePreset = async (preset: typeof PRESETS[0], force = false) => {
    setPresetStatus(prev => ({ ...prev, [preset.id]: 'loading' }));
    try {
      const timelineEvents = await geminiService.generateTimelinePlan(preset.name, preset.location);
      const audioNarrative = await geminiService.generateNarration(preset.name, timelineEvents);
      
      const newLandmark: LandmarkData = {
        id: preset.id,
        name: preset.name,
        location: preset.location,
        timeline: timelineEvents,
        audioNarrative,
        isCustom: false,
        userNotes: []
      };

      await storageService.saveLandmark(newLandmark);
      setPregeneratedLandmarks(prev => ({ ...prev, [preset.id]: newLandmark }));
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'ready' }));
    } catch (error) {
      console.error(`Pre-generation failed for ${preset.name}:`, error);
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'idle' }));
    }
  };

  const loadSavedLandmarks = async () => {
    const all = await storageService.getAllLandmarks();
    setSavedLandmarks(all);
  };

  const loadResearchPapers = async () => {
    const all = await storageService.getAllResearchPapers();
    setResearchPapers(all.sort((a, b) => b.timestamp - a.timestamp));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      const uniqueId = `upload-${Date.now()}`;
      startExperience(base64Data, true, { id: uniqueId });
    };
    reader.readAsDataURL(file);
  };

  const startExperience = async (base64Image: string | undefined, isCustom: boolean, presetData?: any, ignoreCache = false) => {
    setViewMode(ViewMode.EXPERIENCE);
    const id = presetData?.id || 'unknown';

    // If we have pre-generated data and we aren't ignoring cache, load instantly
    if (!ignoreCache && pregeneratedLandmarks[id]) {
      setLandmarkData(pregeneratedLandmarks[id]);
      setLoadingState({ status: 'ready', progress: 100 });
      return;
    }

    setLoadingState({ status: 'planning', message: 'Initializing temporal anchor...', progress: 5 });

    try {
      if (!ignoreCache) {
        setLoadingState({ status: 'planning', message: 'Checking archives...', progress: 10 });
        const cached = await storageService.getLandmark(id);
        if (cached) {
          setLandmarkData(cached);
          setLoadingState({ status: 'ready', progress: 100 });
          return;
        }
      }

      let name = presetData?.name || "Target Site";
      let location = presetData?.location || "Unknown";

      if (isCustom && base64Image) {
        setLoadingState({ status: 'identifying', message: 'Analyzing target structure...', progress: 15 });
        const idData = await geminiService.identifyLandmark(base64Image);
        name = idData.name;
        location = idData.location;
      }

      setLoadingState({ status: 'planning', message: `Researching ${name}...`, progress: 30 });
      const timelineEvents = await geminiService.generateTimelinePlan(name, location);
      
      const newLandmark: LandmarkData = {
        id, name, location, originalImage: base64Image, timeline: timelineEvents, isCustom, userNotes: []
      };
      setLandmarkData(newLandmark);

      setLoadingState({ status: 'visualizing', message: 'Visualizing history & narration...', progress: 60 });
      
      const generationTasks = [
        geminiService.generateHistoricalImage(timelineEvents[0], name, base64Image),
        geminiService.generateNarration(name, timelineEvents)
      ];

      const [firstImageBase64, audioNarrative] = await Promise.all(generationTasks);

      const updatedLandmark: LandmarkData = {
        ...newLandmark,
        timeline: timelineEvents.map((ev, i) => i === 0 ? {
          ...ev,
          imageUrl: `data:image/jpeg;base64,${firstImageBase64}`,
          isGenerated: true
        } : ev),
        audioNarrative
      };

      setLandmarkData(updatedLandmark);
      await storageService.saveLandmark(updatedLandmark);
      setLoadingState({ status: 'ready', progress: 100 });
    } catch (error: any) {
      console.error(error);
      setLoadingState({ status: 'error', message: error.message || 'Generation failed.' });
    }
  };

  const handleLaunchJourneyFromPaper = async (paper: ResearchPaper) => {
    setViewMode(ViewMode.EXPERIENCE);
    const id = `journey-from-paper-${paper.id}`;
    setLoadingState({ status: 'planning', message: 'Extracting timeline from research...', progress: 10 });

    try {
      const cached = await storageService.getLandmark(id);
      if (cached) {
        setLandmarkData(cached);
        setLoadingState({ status: 'ready', progress: 100 });
        await storageService.deleteResearchPaper(paper.id);
        await loadResearchPapers();
        return;
      }

      setLoadingState({ status: 'planning', message: 'Synthesizing historical moments...', progress: 30 });
      const timelineEvents = await geminiService.generateTimelineFromResearch(paper.topic, paper.content);
      
      const newLandmark: LandmarkData = {
        id, 
        name: paper.title, 
        location: "Historical Records", 
        timeline: timelineEvents, 
        isCustom: true, 
        userNotes: []
      };
      setLandmarkData(newLandmark);

      setLoadingState({ status: 'visualizing', message: 'Generating visualizations...', progress: 60 });
      
      const referenceImg = paper.images.length > 0 ? paper.images[0].split(',')[1] : undefined;

      const generationTasks = [
        geminiService.generateHistoricalImage(timelineEvents[0], paper.title, referenceImg),
        geminiService.generateNarration(paper.title, timelineEvents)
      ];

      const [firstImageBase64, audioNarrative] = await Promise.all(generationTasks);

      const updatedLandmark: LandmarkData = {
        ...newLandmark,
        timeline: timelineEvents.map((ev, i) => i === 0 ? {
          ...ev,
          imageUrl: `data:image/jpeg;base64,${firstImageBase64}`,
          isGenerated: true
        } : ev),
        audioNarrative
      };

      setLandmarkData(updatedLandmark);
      await storageService.saveLandmark(updatedLandmark);
      await storageService.deleteResearchPaper(paper.id);
      await loadResearchPapers();
      
      setLoadingState({ status: 'ready', progress: 100 });
    } catch (error: any) {
      console.error(error);
      setLoadingState({ status: 'error', message: error.message || 'Journey transformation failed.' });
    }
  };

  const handleLazyImageGenerated = async (index: number, imageUrl: string, hotspots?: SceneHotspot[]) => {
    setLandmarkData(prev => {
      if (!prev) return null;
      const newTimeline = [...prev.timeline];
      newTimeline[index] = { 
        ...newTimeline[index], 
        imageUrl, 
        isGenerated: true,
        hotspots: hotspots || newTimeline[index].hotspots 
      };
      const updated = { ...prev, timeline: newTimeline };
      storageService.saveLandmark(updated);
      return updated;
    });
  };

  const handleSaveToCollection = async () => {
    if (!landmarkData) return;
    setIsSaving(true);
    await storageService.saveLandmark(landmarkData);
    await loadSavedLandmarks();
    setIsSaving(false);
  };

  const handleDeleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Remove this landmark from your collection?")) {
      await storageService.deleteLandmark(id);
      loadInitialData();
    }
  };

  const handleRefreshPreset = async (preset: typeof PRESETS[0], e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Refresh the historical data for ${preset.name}? This will regenerate the timeline and narration.`)) {
      await storageService.deleteLandmark(preset.id);
      setPregeneratedLandmarks(prev => {
        const next = { ...prev };
        delete next[preset.id];
        return next;
      });
      pregeneratePreset(preset, true);
    }
  };

  const handleRegenerate = async () => {
    if (!landmarkData) return;
    const isCustom = landmarkData.isCustom;
    const originalImage = landmarkData.originalImage;
    const preset = PRESETS.find(p => p.id === landmarkData.id);
    await storageService.deleteLandmark(landmarkData.id);
    startExperience(originalImage, isCustom, preset || { id: landmarkData.id }, true);
  };

  const handleSaveNote = async (note: UserNote) => {
    if (!landmarkData) return;
    const updated = {
      ...landmarkData,
      userNotes: [...(landmarkData.userNotes || []), note]
    };
    setLandmarkData(updated);
    await storageService.saveLandmark(updated);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!landmarkData) return;
    const updated = {
      ...landmarkData,
      userNotes: (landmarkData.userNotes || []).filter(n => n.id !== noteId)
    };
    setLandmarkData(updated);
    await storageService.saveLandmark(updated);
  };

  const reset = () => {
    setViewMode(ViewMode.HOME);
    setLandmarkData(null);
    setLoadingState({ status: 'idle' });
    setCurrentProgress(0);
    setIsInfoVisible(false);
    setIsPanoramicMode(false);
    setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isPanoramicMode) return;
    setTransform(prev => {
      const zoomSpeed = 0.001;
      const newScale = Math.max(0.5, Math.min(5, prev.scale - e.deltaY * zoomSpeed));
      return { ...prev, scale: newScale, x: newScale <= 1.05 ? 0 : prev.x, y: newScale <= 1.05 ? 0 : prev.y };
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanoramicMode) return;
    if (!isDragging && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTilt({ 
        x: ((e.clientY - (rect.top + rect.height/2)) / (rect.height/2)) * -4, 
        y: ((e.clientX - (rect.left + rect.width/2)) / (rect.width/2)) * 4 
      });
    }
    if (isDragging) {
      setTransform(prev => ({ 
        ...prev, 
        x: prev.x + (e.clientX - lastMousePos.current.x), 
        y: prev.y + (e.clientY - lastMousePos.current.y) 
      }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const renderHome = () => {
    const researchDiscoveryLandmarks = savedLandmarks.filter(l => !PRESETS.find(p => p.id === l.id));

    return (
      <div className="min-h-screen flex flex-col items-center py-12 px-6 relative overflow-auto scrollbar-hide pb-32">
        <div className="fixed inset-0 z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 opacity-95"></div>
          <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1920" alt="bg" className="w-full h-full object-cover opacity-10 blur-sm" />
        </div>
        <div className="relative z-10 max-w-5xl w-full text-center">
          <header className="mb-16">
            <h1 className="text-5xl md:text-8xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 mb-6 drop-shadow-lg py-2">The Historian</h1>
            <p className="text-xl md:text-2xl text-slate-300 mb-4 font-light max-w-2xl mx-auto">Witness the evolution of humanity's greatest achievements.</p>
          </header>

          {researchDiscoveryLandmarks.length > 0 && (
            <div className="text-left mb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest opacity-80 mb-8 border-l-4 border-amber-500 pl-4">Your Discoveries</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {researchDiscoveryLandmarks.map(landmark => (
                  <div key={landmark.id} className="group relative h-80 rounded-2xl overflow-hidden shadow-2xl border border-white/5 transition-all hover:scale-[1.02]">
                    <button 
                      onClick={() => {
                        setLandmarkData(landmark);
                        setViewMode(ViewMode.EXPERIENCE);
                        setLoadingState({ status: 'ready', progress: 100 });
                      }} 
                      className="absolute inset-0 w-full h-full text-left"
                    >
                      <img 
                        src={landmark.originalImage ? `data:image/jpeg;base64,${landmark.originalImage}` : landmark.timeline[landmark.timeline.length-1].imageUrl} 
                        alt={landmark.name} 
                        className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:brightness-90 transition-all" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8 transition-all group-hover:from-amber-950/80">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400 mb-2">{landmark.name}</h3>
                        <div className="flex items-center gap-2 text-slate-300 text-sm tracking-widest uppercase"><MapPin size={16} className="text-amber-500" />{landmark.location}</div>
                      </div>
                    </button>
                    
                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                      <button 
                        onClick={(e) => handleDeleteSaved(landmark.id, e)}
                        className="p-3 bg-red-900/60 hover:bg-red-600 backdrop-blur-md rounded-full text-white/70 hover:text-white shadow-lg"
                        title="Remove from Collection"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-left mb-20">
            <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest opacity-80 mb-8 border-l-4 border-amber-500 pl-4">Curated Journeys</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {PRESETS.map(preset => {
                const status = presetStatus[preset.id] || 'idle';
                return (
                  <div key={preset.id} className="group relative h-80 rounded-2xl overflow-hidden shadow-2xl hover:scale-[1.02] transition-all border border-white/5">
                    <button 
                      onClick={() => startExperience(undefined, false, preset)} 
                      className="absolute inset-0 w-full h-full text-left"
                    >
                      <img src={preset.image} alt={preset.name} className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:brightness-90" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8 transition-all group-hover:from-amber-950/80">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400 mb-2">{preset.name}</h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-300 text-sm tracking-widest uppercase"><MapPin size={16} className="text-amber-500" />{preset.location}</div>
                          <div className="flex items-center gap-2">
                             {status === 'loading' ? (
                               <div className="flex items-center gap-1.5 text-amber-500/60 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                                 <Loader2 size={12} className="animate-spin" /> Archiving...
                               </div>
                             ) : status === 'ready' ? (
                               <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold uppercase tracking-widest opacity-60 group-hover:opacity-100">
                                 <CheckCircle2 size={12} /> Ready
                               </div>
                             ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                    
                    <div className="absolute top-4 right-4 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all z-20">
                       <button 
                        onClick={(e) => handleRefreshPreset(preset, e)}
                        className="p-3 bg-slate-900/60 hover:bg-amber-500 backdrop-blur-md rounded-full text-white/70 hover:text-slate-950 shadow-lg"
                        title="Regenerate Journey"
                      >
                        <RefreshCw size={16} className={status === 'loading' ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
            <section className="bg-slate-800/40 backdrop-blur-xl p-10 rounded-3xl border border-white/5 hover:bg-slate-800/60 transition-all cursor-pointer group relative overflow-hidden shadow-2xl h-full flex flex-col justify-center">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
              <div className="flex flex-col items-center gap-6 text-slate-300 group-hover:text-amber-400 transition-colors">
                <div className="p-6 bg-slate-700/50 rounded-full group-hover:bg-slate-600/50 transition-all group-hover:scale-110 shadow-inner">
                  <Camera size={56} className="text-amber-500" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2 font-serif">Identify & Explore</h3>
                  <p className="text-slate-400 font-light text-sm">Upload a photo to travel through its specific history</p>
                </div>
              </div>
            </section>

            <HistorianAgent 
              papers={researchPapers}
              onRefresh={loadResearchPapers}
              onLaunchJourney={handleLaunchJourneyFromPaper} 
            />
          </div>
        </div>
      </div>
    );
  };

  const renderExperience = () => {
    if (loadingState.status !== 'ready' && loadingState.status !== 'error') {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 text-amber-50">
          <Loader2 size={80} className="animate-spin text-amber-500 relative z-10" />
          <h2 className="text-3xl font-serif mb-6 animate-pulse text-center tracking-widest uppercase mt-8">{loadingState.message || 'Connecting to Temporal Stream...'}</h2>
        </div>
      );
    }

    if (loadingState.status === 'error') {
      return (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
           <h2 className="text-3xl font-serif text-red-400 mb-6 uppercase tracking-widest">Temporal Paradox</h2>
           <p className="mb-8 opacity-80 font-light">{loadingState.message}</p>
           <button onClick={reset} className="px-10 py-4 bg-slate-800 hover:bg-amber-500 rounded-full font-bold uppercase text-xs tracking-widest">Return to Origin</button>
        </div>
      );
    }

    if (!landmarkData) return null;
    const currentEvent = landmarkData.timeline[currentEventIndex];
    const isSavedInCollection = savedLandmarks.some(l => l.id === landmarkData.id);

    return (
      <div className="fixed inset-0 z-50 bg-black text-slate-100 flex flex-col">
        {/* Experience Header */}
        <div className="absolute top-0 left-0 w-full z-[60] p-8 flex justify-between items-start bg-gradient-to-b from-black via-black/60 to-transparent pointer-events-none">
          <div className="pointer-events-auto">
            <button onClick={reset} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 group uppercase tracking-widest text-xs font-bold">
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back
            </button>
            <h1 className="text-4xl md:text-5xl font-serif text-white mb-1">{landmarkData.name}</h1>
            <p className="text-amber-400 font-light flex items-center gap-2 tracking-widest uppercase text-xs"><MapPin size={14}/> {landmarkData.location}</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
            {landmarkData.isCustom && (
              <button 
                onClick={handleSaveToCollection} 
                disabled={isSaving || isSavedInCollection}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-xl group border ${isSavedInCollection ? 'bg-green-600/20 border-green-500/50 text-green-400 cursor-default' : 'bg-amber-500 border-amber-500 text-slate-950 hover:bg-amber-400'}`}
              >
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : isSavedInCollection ? <Globe size={18} /> : <Save size={18} />}
                <span className="uppercase tracking-widest text-xs">
                  {isSavedInCollection ? 'Saved to Collection' : isSaving ? 'Archiving...' : 'Save to Collection'}
                </span>
              </button>
            )}
            <button onClick={handleRegenerate} className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/80 border border-white/10 text-amber-500 hover:bg-amber-500 hover:text-slate-900 transition-all"><RefreshCw size={20} /></button>
            {landmarkData.audioNarrative && <AudioPlayer audioBase64={landmarkData.audioNarrative} />}
            
            {landmarkData.id.startsWith('journey-from-paper-') && (
              <button 
                onClick={async () => {
                   const paperId = landmarkData.id.replace('journey-from-paper-', '');
                   const paper = await storageService.getResearchPaper(paperId);
                   if (paper) generatePDF(paper);
                }} 
                className={`px-6 py-3 rounded-full font-bold transition-all border bg-slate-800 text-amber-400 border-amber-500/50 hover:bg-amber-500 hover:text-slate-950 flex items-center gap-2`}
              >
                <Download size={18} />
                <span className="uppercase tracking-widest text-xs">Download Research</span>
              </button>
            )}

            <button onClick={() => setIsInfoVisible(true)} className={`px-6 py-3 rounded-full font-bold transition-all border bg-transparent text-white border-white/20 hover:bg-white/10 flex items-center gap-2`}>
              <BookOpen size={18} />
              <span className="uppercase tracking-widest text-xs">View Details</span>
            </button>
          </div>
        </div>

        {/* Viewport Control Actions */}
        <div className="absolute right-8 bottom-48 z-[60] flex flex-col gap-3 pointer-events-auto">
          <button 
            onClick={() => {
              setIsPanoramicMode(!isPanoramicMode);
              if (!isPanoramicMode) setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 });
            }} 
            className={`p-4 rounded-full border border-white/10 transition-all ${isPanoramicMode ? 'bg-amber-500 text-slate-950 scale-110' : 'bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-900'}`}
          >
            <Globe size={24} />
          </button>
          {!isPanoramicMode && (
            <>
              <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale + 0.5, 5) }))} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-white hover:bg-amber-500 hover:text-slate-900"><ZoomIn size={24} /></button>
              <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale - 0.5, 0.5) }))} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-white hover:bg-amber-500 hover:text-slate-900"><ZoomOut size={24} /></button>
              <button onClick={() => setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 })} className="p-4 bg-amber-500 rounded-full text-slate-950 hover:scale-110"><Maximize size={24} /></button>
            </>
          )}
        </div>

        {/* User Notes Manager */}
        <UserNotesManager 
          landmarkName={landmarkData.name} 
          yearContext={currentEvent?.year || 0} 
          notes={landmarkData.userNotes || []} 
          onSaveNote={handleSaveNote} 
          onDeleteNote={handleDeleteNote} 
        />

        <div 
          ref={containerRef} 
          className="flex-1 relative bg-black overflow-hidden select-none" 
          style={{ perspective: isPanoramicMode ? 'none' : '1200px' }} 
          onWheel={handleWheel} 
          onMouseDown={(e) => { if((transform.scale > 1) && !isPanoramicMode) setIsDragging(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; }} 
          onMouseMove={handleMouseMove} 
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => { setIsDragging(false); setTilt({ x: 0, y: 0 }); }}
        >
          <div 
            className={`absolute inset-0 w-full h-full transition-all duration-700 ease-out`} 
            style={{ 
              transform: isPanoramicMode ? 'none' : `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotateX(${transform.rx + tilt.x}deg) rotateY(${transform.ry + tilt.y}deg)`, 
              transformOrigin: 'center center', 
              transformStyle: 'preserve-3d' 
            }}
          >
             {landmarkData.timeline.map((event, idx) => (
               <TimelineImage 
                key={`${landmarkData.id}-${idx}`} 
                index={idx} 
                event={event} 
                landmarkName={landmarkData.name} 
                referenceImage={landmarkData.originalImage} 
                currentProgress={currentProgress} 
                isPanoramicMode={isPanoramicMode}
                onGenerated={(url, hts) => handleLazyImageGenerated(idx, url, hts)} 
              />
             ))}
          </div>

          {isInfoVisible && currentEvent && (
            <>
              <div 
                className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-in fade-in pointer-events-auto"
                onClick={() => setIsInfoVisible(false)}
              />
              
              <div className="absolute top-0 right-0 h-full w-full md:w-[480px] bg-slate-950/90 border-l border-white/10 z-[110] shadow-2xl animate-in slide-in-from-right duration-500 ease-out pointer-events-auto flex flex-col">
                <div className="p-8 flex justify-between items-center border-b border-white/5">
                  <div className="flex items-center gap-2 text-amber-500">
                    <BookOpen size={20} />
                    <span className="text-xs font-bold uppercase tracking-[0.2em]">Temporal Dossier</span>
                  </div>
                  <button 
                    onClick={() => setIsInfoVisible(false)} 
                    className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 md:p-12 scrollbar-hide">
                  <div className="mb-12">
                    <span className="text-8xl font-serif text-amber-500/80 drop-shadow-glow">{currentEvent.year}</span>
                    <div className="h-1 w-24 bg-amber-500 mt-4 rounded-full"></div>
                  </div>

                  <h3 className="text-4xl font-serif text-white mb-8 leading-tight">{currentEvent.title}</h3>
                  
                  <div className="space-y-6 text-slate-300 text-lg leading-relaxed font-light">
                    {currentEvent.description.split('\n').map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>

                  {currentEvent.hotspots && currentEvent.hotspots.length > 0 && (
                    <div className="mt-16 pt-8 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-6">Identified Contextual Sites</h4>
                      <div className="space-y-6">
                        {currentEvent.hotspots.map((hotspot) => (
                          <div key={hotspot.id} className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <h5 className="text-amber-400 font-bold mb-1">{hotspot.name}</h5>
                            <p className="text-sm text-slate-400 leading-relaxed">{hotspot.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(landmarkData.userNotes || []).some(n => n.yearContext === currentEvent.year) && (
                    <div className="mt-16 pt-8 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500 mb-6">User Journal Entries</h4>
                      <div className="space-y-4">
                        {(landmarkData.userNotes || []).filter(n => n.yearContext === currentEvent.year).map(note => (
                          <div key={note.id} className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                            {note.type === 'text' ? (
                              <p className="text-sm text-slate-300 italic">"{note.content}"</p>
                            ) : (
                              <div className="text-xs text-amber-400 font-bold uppercase flex items-center gap-2">
                                <Mic size={14} /> Recorded Dispatch
                              </div>
                            )}
                            <div className="mt-2 text-[10px] text-slate-500 text-right">{new Date(note.timestamp).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-8 border-t border-white/5 bg-slate-900/50">
                  <button 
                    onClick={() => setIsInfoVisible(false)}
                    className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg active:scale-[0.98]"
                  >
                    Return to Observation
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <TimelineSlider events={landmarkData.timeline} currentProgress={currentProgress} onChange={setCurrentProgress} />
      </div>
    );
  };

  return viewMode === ViewMode.HOME ? renderHome() : renderExperience();
};

export default App;
