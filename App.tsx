
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, MapPin, Loader2, ArrowLeft, Info, X, ZoomIn, ZoomOut, Maximize, RefreshCw, Globe, Save, Trash2, BookOpen, StickyNote, Mic, Download, FileText, CheckCircle2, ShieldCheck, ExternalLink, Settings, Link as LinkIcon, Sparkles, Printer, Image as ImageIcon, Menu, Upload, FileJson, Server, Key } from 'lucide-react';
import { LandmarkData, LoadingState, ViewMode, SceneHotspot, UserNote, ResearchPaper, StorageConfig } from './types';
import * as geminiService from './services/geminiService';
import * as storageService from './services/storageService';
import { generatePDF } from './services/pdfService';
import TimelineSlider from './components/TimelineSlider';
import AudioPlayer from './components/AudioPlayer';
import TimelineImage from './components/TimelineImage';
import UserNotesManager from './components/UserNotesManager';
import HistorianAgent from './components/HistorianAgent';

const SKY_BLUE_CANVAS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='100%25' height='100%25' fill='%2387CEEB'/%3E%3C/svg%3E";
const DEFAULT_GCS_URL = "https://storage.googleapis.com/thehistorianstarterdata/data.json";

const PRESETS = [
  { id: 'eiffel', name: 'Eiffel Tower', location: 'Paris, France', image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&q=80&w=800' },
  { id: 'sagrada', name: 'Sagrada Família', location: 'Barcelona, Spain', image: './images/sagrada.png' }, 
  { id: 'colosseum', name: 'Colosseum', location: 'Rome, Italy', image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800' },
  { id: 'stpauls', name: "St Paul's Cathedral", location: 'London, UK', image: './images/stpaul.png' },
  { id: 'tajmahal', name: 'Taj Mahal', location: 'Agra, India', image: './images/tajmahal.png' },
  { id: 'greatwall', name: 'Great Wall of China', location: 'Huairou, China', image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&q=80&w=800' },
];

const App: React.FC = () => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.HOME);
  const [landmarkData, setLandmarkData] = useState<LandmarkData | null>(null);
  const [savedLandmarks, setSavedLandmarks] = useState<LandmarkData[]>([]);
  const [researchPapers, setResearchPapers] = useState<ResearchPaper[]>([]);
  const [loadingState, setLoadingState] = useState<LoadingState>({ status: 'idle' });
  const [currentProgress, setCurrentProgress] = useState(0); 
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [isPanoramicMode, setIsPanoramicMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [storageConfig, setStorageConfig] = useState<StorageConfig>({ url: DEFAULT_GCS_URL });

  const [stickerSheetUrl, setStickerSheetUrl] = useState<string | null>(null);
  const [isGeneratingStickers, setIsGeneratingStickers] = useState(false);
  const [stickerTargetName, setStickerTargetName] = useState<string | null>(null);

  const [presetStatus, setPresetStatus] = useState<Record<string, 'ready' | 'loading' | 'idle'>>({});
  const [pregeneratedLandmarks, setPregeneratedLandmarks] = useState<Record<string, LandmarkData>>({});
  
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const currentEventIndex = Math.round(currentProgress);

  useEffect(() => {
    checkApiKeyStatus();
  }, []);

  const checkApiKeyStatus = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setIsSetupComplete(hasKey);
    } else {
      setIsSetupComplete(true);
    }
  };

  const handleOpenKeySelection = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
    }
    setIsSetupComplete(true);
  };

  useEffect(() => {
    document.body.style.overflow = (viewMode === ViewMode.EXPERIENCE || stickerSheetUrl || isAboutVisible || isConfigOpen) ? 'hidden' : 'auto';
    if (viewMode === ViewMode.HOME && isSetupComplete) {
      loadInitialData();
    }
  }, [viewMode, isSetupComplete, stickerSheetUrl, isAboutVisible, isConfigOpen]);

  const loadInitialData = async () => {
    let all = await storageService.getAllLandmarks();
    const existingConfig = await storageService.getStorageConfig();
    if (existingConfig) setStorageConfig(existingConfig);

    // Seeding Logic: If landmarks store is empty, fetch from Google Bucket URL
    if (all.length === 0) {
      try {
        console.group("🕰️ The Historian: Initial Seeding");
        const config = existingConfig || storageConfig;
        const fetchUrl = config.url || DEFAULT_GCS_URL;
        
        console.log(`Fetching seed data from: ${fetchUrl}`);
        
        const headers: HeadersInit = {};
        if (config.accessKey) {
          headers['Authorization'] = `Bearer ${config.accessKey}`;
        }

        const response = await fetch(fetchUrl, { headers });
        
        if (response.ok) {
          const seedData = await response.json();
          if (seedData.landmarks) {
            for (const l of seedData.landmarks) await storageService.saveLandmark(l);
          }
          if (seedData.papers) {
            for (const p of seedData.papers) await storageService.saveResearchPaper(p);
          }
          all = await storageService.getAllLandmarks();
          console.log("Seed data successfully ingested.");
        } else {
          console.warn(`Initial seeding failed (Status: ${response.status}). Store remains empty.`);
          if (response.status === 403 || response.status === 401) {
            setIsConfigOpen(true); // Ask for access key if forbidden
          }
        }
        console.groupEnd();
      } catch (err) {
        console.error("Critical error during initial seeding:", err);
        console.groupEnd();
      }
    }

    setSavedLandmarks(all);
    const allPapers = await storageService.getAllResearchPapers();
    setResearchPapers(allPapers.sort((a, b) => b.timestamp - a.timestamp));

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
    if (isSetupComplete) triggerParallelSync(status);
  };

  const triggerParallelSync = async (currentStatus: Record<string, 'ready' | 'loading' | 'idle'>) => {
    const idlePresets = PRESETS.filter(p => currentStatus[p.id] === 'idle');
    await Promise.allSettled(idlePresets.map(preset => pregeneratePreset(preset)));
  };

  const pregeneratePreset = async (preset: typeof PRESETS[0]) => {
    setPresetStatus(prev => ({ ...prev, [preset.id]: 'loading' }));
    try {
      const { timeline: timelineEvents, sources } = await geminiService.generateTimelinePlan(preset.name, preset.location);
      const audioNarrative = await geminiService.generateNarration(preset.name, timelineEvents);
      const newLandmark: LandmarkData = {
        id: preset.id, name: preset.name, location: preset.location,
        timeline: timelineEvents, audioNarrative, isCustom: false, userNotes: [], sources
      };
      await storageService.saveLandmark(newLandmark);
      setPregeneratedLandmarks(prev => ({ ...prev, [preset.id]: newLandmark }));
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'ready' }));
    } catch (error) {
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'idle' }));
    }
  };

  const handleExportArchive = async () => {
    try {
      const landmarks = await storageService.getAllLandmarks();
      const papers = await storageService.getAllResearchPapers();
      
      const allItems = [
        ...landmarks.map(l => ({ ...l, __type: 'landmark' })),
        ...papers.map(p => ({ ...p, __type: 'paper' }))
      ];

      // Request: Export to multiple files if file size exceeds 10MB
      const CHUNK_LIMIT = 10 * 1024 * 1024; 
      const chunks: any[] = [];
      let currentChunk: any[] = [];
      let currentSize = 0;

      for (const item of allItems) {
        const itemSize = JSON.stringify(item).length;
        if (itemSize > CHUNK_LIMIT) {
          console.warn(`Individual item ${item.id} is larger than 10MB. Exporting it solo.`);
          chunks.push([item]);
          continue;
        }

        if (currentSize + itemSize > CHUNK_LIMIT) {
          chunks.push(currentChunk);
          currentChunk = [item];
          currentSize = itemSize;
        } else {
          currentChunk.push(item);
          currentSize += itemSize;
        }
      }
      if (currentChunk.length > 0) chunks.push(currentChunk);

      chunks.forEach((chunk, i) => {
        const archiveData = {
          version: "1.0",
          timestamp: Date.now(),
          part: i + 1,
          total: chunks.length,
          landmarks: chunk.filter((x: any) => x.__type === 'landmark'),
          papers: chunk.filter((x: any) => x.__type === 'paper')
        };
        const blob = new Blob([JSON.stringify(archiveData)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TheHistorian_Archive_Part${i + 1}_of_${chunks.length}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
      
      setIsMenuOpen(false);
      alert(`Exported ${chunks.length} archive part(s).`);
    } catch (err) {
      console.error("Export failed", err);
      alert("Archive export failed. Store might be too large for direct serialization.");
    }
  };

  const handleImportArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.landmarks) {
          for (const l of json.landmarks) await storageService.saveLandmark(l);
        }
        if (json.papers) {
          for (const p of json.papers) await storageService.saveResearchPaper(p);
        }
        alert("Discovery Archive Successfully Integrated.");
        loadInitialData();
        setIsMenuOpen(false);
      } catch (err: any) {
        alert("Integrity Check Failed: " + err.message);
      } finally {
        if (importFileRef.current) importFileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleClearArchive = async () => {
    if (window.confirm("Purge local archive? All custom discoveries will be lost.")) {
      await storageService.clearAllData();
      window.location.reload();
    }
  };

  const handleSaveConfig = async () => {
    await storageService.saveStorageConfig(storageConfig);
    setIsConfigOpen(false);
    loadInitialData();
    alert("Storage configuration updated. Seeding attempted.");
  };

  const handleGenerateStickers = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGeneratingStickers(true);
    setStickerTargetName(name);
    try {
      const base64 = await geminiService.generateStickerSheet(name);
      setStickerSheetUrl(`data:image/png;base64,${base64}`);
    } catch (error: any) {
      if (error?.message?.includes("Requested entity was not found")) handleOpenKeySelection();
      else alert("Sticker manifestation failed.");
    } finally {
      setIsGeneratingStickers(false);
    }
  };

  const handlePrintStickers = () => {
    if (!stickerSheetUrl) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><body style="margin:0;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="${stickerSheetUrl}" style="max-width:100%;" onload="window.print();window.close();" /></body></html>`);
      printWindow.document.close();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      startExperience(base64Data, true, { id: `upload-${Date.now()}` });
    };
    reader.readAsDataURL(file);
  };

  const startExperience = async (base64Image: string | undefined, isCustom: boolean, presetData?: any, ignoreCache = false) => {
    const id = presetData?.id || 'unknown';
    if (viewMode !== ViewMode.EXPERIENCE) setPresetStatus(prev => ({ ...prev, [id]: 'loading' }));
    if (!ignoreCache && pregeneratedLandmarks[id]) {
      setLandmarkData(pregeneratedLandmarks[id]);
      setLoadingState({ status: 'ready', progress: 100 });
      setViewMode(ViewMode.EXPERIENCE);
      return;
    }
    setViewMode(ViewMode.EXPERIENCE);
    setLoadingState({ status: 'planning', message: 'Initializing temporal anchor...', progress: 5 });
    try {
      let name = presetData?.name || "Target Site";
      let location = presetData?.location || "Unknown";
      if (isCustom && base64Image) {
        setLoadingState({ status: 'identifying', message: 'Analyzing target...', progress: 15 });
        const idData = await geminiService.identifyLandmark(base64Image);
        name = idData.name; location = idData.location;
      }
      setLoadingState({ status: 'planning', message: `Researching ${name}...`, progress: 30 });
      const { timeline: timelineEvents, sources } = await geminiService.generateTimelinePlan(name, location);
      const newLandmark: LandmarkData = { id, name, location, originalImage: base64Image, timeline: timelineEvents, isCustom, userNotes: [], sources };
      setLandmarkData(newLandmark);
      setLoadingState({ status: 'visualizing', message: 'Visualizing history...', progress: 60 });
      const [firstImageBase64, audioNarrative] = await Promise.all([
        geminiService.generateHistoricalImage(timelineEvents[0], name, base64Image),
        geminiService.generateNarration(name, timelineEvents)
      ]);
      const updatedLandmark: LandmarkData = {
        ...newLandmark,
        timeline: timelineEvents.map((ev, i) => i === 0 ? { ...ev, imageUrl: `data:image/jpeg;base64,${firstImageBase64}`, isGenerated: true } : ev),
        audioNarrative
      };
      setLandmarkData(updatedLandmark);
      await storageService.saveLandmark(updatedLandmark);
      setPregeneratedLandmarks(prev => ({ ...prev, [id]: updatedLandmark }));
      setPresetStatus(prev => ({ ...prev, [id]: 'ready' }));
      setLoadingState({ status: 'ready', progress: 100 });
    } catch (error: any) {
      if (error?.message?.includes("Quota Exhausted")) setIsSetupComplete(false);
      setLoadingState({ status: 'error', message: error.message || 'Temporal paradox occurred.' });
    }
  };

  const handleLaunchJourneyFromPaper = async (paper: ResearchPaper) => {
    setViewMode(ViewMode.EXPERIENCE);
    const id = `journey-from-paper-${paper.id}`;
    setLoadingState({ status: 'planning', message: 'Extracting timeline...', progress: 10 });
    try {
      const timelineEvents = await geminiService.generateTimelineFromResearch(paper.topic, paper.content);
      const newLandmark: LandmarkData = { id, name: paper.title, location: "Archives", timeline: timelineEvents, isCustom: true, userNotes: [], sources: paper.sources, fullReport: paper };
      setLandmarkData(newLandmark);
      setLoadingState({ status: 'visualizing', message: 'Visualizing history...', progress: 60 });
      const referenceImg = paper.images.length > 0 ? paper.images[0].split(',')[1] : undefined;
      const [firstImageBase64, audioNarrative] = await Promise.all([
        geminiService.generateHistoricalImage(timelineEvents[0], paper.title, referenceImg),
        geminiService.generateNarration(paper.title, timelineEvents)
      ]);
      const updated = { ...newLandmark, timeline: timelineEvents.map((ev, i) => i === 0 ? { ...ev, imageUrl: `data:image/jpeg;base64,${firstImageBase64}`, isGenerated: true } : ev), audioNarrative };
      setLandmarkData(updated);
      await storageService.saveLandmark(updated);
      setLoadingState({ status: 'ready', progress: 100 });
    } catch (error: any) {
      setLoadingState({ status: 'error', message: error.message });
    }
  };

  const reset = () => {
    setViewMode(ViewMode.HOME);
    setLandmarkData(null);
    setLoadingState({ status: 'idle' });
    setCurrentProgress(0);
    setIsInfoVisible(false);
    setIsPanoramicMode(false);
    setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 });
    setIsMenuOpen(false);
  };

  const handleSaveToCollection = async () => {
    if (!landmarkData) return;
    setIsSaving(true);
    try {
      await storageService.saveLandmark(landmarkData);
      const all = await storageService.getAllLandmarks();
      setSavedLandmarks(all);
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = () => {
    if (!landmarkData) return;
    startExperience(landmarkData.originalImage, landmarkData.isCustom, { 
      id: landmarkData.id, 
      name: landmarkData.name, 
      location: landmarkData.location 
    }, true);
  };

  const handleLazyImageGenerated = (index: number, imageUrl: string, hts?: SceneHotspot[]) => {
    setLandmarkData(prev => {
      if (!prev) return null;
      const newTimeline = [...prev.timeline];
      newTimeline[index] = { ...newTimeline[index], imageUrl, isGenerated: true, hotspots: hts || newTimeline[index].hotspots };
      const updated = { ...prev, timeline: newTimeline };
      storageService.saveLandmark(updated);
      return updated;
    });
  };

  if (!isSetupComplete) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-white text-center">
      <ShieldCheck size={64} className="text-amber-500 mb-8" />
      <h1 className="text-5xl font-serif mb-4">Secure Engine</h1>
      <p className="text-slate-400 mb-8 max-w-md">Initialize credentials for high-bandwidth archival access.</p>
      <button onClick={handleOpenKeySelection} className="px-10 py-5 bg-amber-500 rounded-2xl text-slate-950 font-bold uppercase tracking-widest hover:bg-amber-400 transition-all flex items-center gap-3">
        <Settings size={20} className="animate-spin-slow" /> Configure Credentials
      </button>
    </div>
  );

  return (
    <>
      <input type="file" ref={importFileRef} onChange={handleImportArchive} accept=".json" className="hidden" />
      
      <div className="fixed top-6 right-6 z-[200]">
        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl text-amber-500 hover:bg-amber-500 hover:text-slate-900 transition-all shadow-xl">
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        {isMenuOpen && (
          <div className="absolute top-14 right-0 w-64 bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4">
            <button onClick={() => { setIsAboutVisible(true); setIsMenuOpen(false); }} className="w-full px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 flex items-center gap-3"><Info size={18}/> About Project</button>
            <button onClick={() => { setIsConfigOpen(true); setIsMenuOpen(false); }} className="w-full px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 flex items-center gap-3"><Server size={18}/> Data Seeding</button>
            <button onClick={handleExportArchive} className="w-full px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 flex items-center gap-3"><Download size={18}/> Export Archive</button>
            <button onClick={() => importFileRef.current?.click()} className="w-full px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 flex items-center gap-3"><Upload size={18}/> Import Archive</button>
            <button onClick={handleClearArchive} className="w-full px-6 py-4 text-left text-sm text-red-500 hover:bg-red-500 hover:text-white flex items-center gap-3"><Trash2 size={18}/> Purge Cache</button>
            <button onClick={() => { reset(); setIsMenuOpen(false); }} className="w-full px-6 py-4 text-left text-sm text-slate-300 hover:bg-slate-800 border-t border-white/5 flex items-center gap-3"><Globe size={18}/> Exit Session</button>
          </div>
        )}
      </div>

      {viewMode === ViewMode.HOME ? (
        <div className="min-h-screen flex flex-col items-center py-12 px-6 relative overflow-auto pb-32">
          <div className="fixed inset-0 z-0 bg-slate-900 opacity-95">
            <img src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=1920" className="w-full h-full object-cover opacity-10" alt="bg" />
          </div>
          <div className="relative z-10 max-w-5xl w-full text-center">
            <header className="mb-16">
              <h1 className="text-6xl md:text-8xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 mb-6 py-2">The Historian</h1>
              <p className="text-xl text-slate-300 max-w-2xl mx-auto font-light">Identifying landmarks or conducting deep research to manifest immersive historical panoramas.</p>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
              <section className="bg-slate-800/40 p-10 rounded-3xl border border-white/5 hover:bg-slate-800/60 transition-all cursor-pointer relative overflow-hidden group">
                <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-20" />
                <div className="flex flex-col items-center gap-6">
                  <Camera size={56} className="text-amber-500 group-hover:scale-110 transition-transform" />
                  <h3 className="text-2xl font-serif text-amber-100">Identify & Explore</h3>
                  <p className="text-slate-400 text-sm">Upload a photo to travel through its history.</p>
                </div>
              </section>
              <HistorianAgent papers={researchPapers} onRefresh={async () => { const p = await storageService.getAllResearchPapers(); setResearchPapers(p.sort((a,b) => b.timestamp - a.timestamp)); }} onLaunchJourney={handleLaunchJourneyFromPaper} />
            </div>
            {savedLandmarks.filter(l => !PRESETS.find(p => p.id === l.id)).length > 0 && (
              <div className="text-left mb-20">
                <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest mb-8 border-l-4 border-amber-500 pl-4">Discoveries</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {savedLandmarks.filter(l => !PRESETS.find(p => p.id === l.id)).map(landmark => (
                    <div key={landmark.id} className="relative h-80 rounded-2xl overflow-hidden group border border-white/5">
                      <img src={landmark.originalImage ? `data:image/jpeg;base64,${landmark.originalImage}` : landmark.timeline[0]?.imageUrl || SKY_BLUE_CANVAS} className="w-full h-full object-cover brightness-75 group-hover:brightness-90 transition-all" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black flex flex-col justify-end p-8">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400 transition-colors">{landmark.name}</h3>
                        <p className="text-slate-400 text-xs tracking-widest uppercase">{landmark.location}</p>
                      </div>
                      <button onClick={() => { setLandmarkData(landmark); setViewMode(ViewMode.EXPERIENCE); setLoadingState({ status: 'ready', progress: 100 }); }} className="absolute inset-0 z-10" />
                      <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={(e) => handleGenerateStickers(landmark.name, e)} className="p-2 bg-amber-500 rounded-full text-slate-950"><Printer size={16}/></button>
                        <button onClick={async (e) => { e.stopPropagation(); await storageService.deleteLandmark(landmark.id); loadInitialData(); }} className="p-2 bg-red-600 rounded-full text-white"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-left mb-20">
              <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest mb-8 border-l-4 border-amber-500 pl-4">Curated</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {PRESETS.map(preset => {
                  const status = presetStatus[preset.id] || 'idle';
                  return (
                    <div key={preset.id} className="relative h-80 rounded-2xl overflow-hidden group border border-white/5">
                      <img src={preset.image} className="w-full h-full object-cover brightness-75 group-hover:brightness-90 transition-all" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black flex flex-col justify-end p-8">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400">{preset.name}</h3>
                        <div className="flex justify-between items-center text-xs text-slate-400 uppercase tracking-widest">
                          <span>{preset.location}</span>
                          {status === 'loading' ? <Loader2 size={12} className="animate-spin text-amber-500" /> : status === 'ready' && <CheckCircle2 size={12} className="text-green-500" />}
                        </div>
                      </div>
                      <button onClick={() => startExperience(undefined, false, preset)} className="absolute inset-0 z-10" disabled={status === 'loading'} />
                      <button onClick={(e) => handleGenerateStickers(preset.name, e)} className="absolute top-4 right-4 z-20 p-2 bg-amber-500 rounded-full text-slate-950 opacity-0 group-hover:opacity-100 transition-all"><Printer size={16}/></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-50 bg-black text-slate-100 flex flex-col">
          {loadingState.status !== 'ready' && loadingState.status !== 'error' ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-950">
              <Loader2 size={80} className="animate-spin text-amber-500 mb-8" />
              <h2 className="text-3xl font-serif text-amber-100 animate-pulse">{loadingState.message || 'Connecting...'}</h2>
            </div>
          ) : loadingState.status === 'error' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <h2 className="text-4xl font-serif text-red-500 mb-6">Archival Failure</h2>
              <p className="mb-12 text-slate-400 max-w-md">{loadingState.message}</p>
              <button onClick={reset} className="px-12 py-4 bg-slate-800 rounded-full font-bold uppercase tracking-widest hover:bg-amber-500 transition-all">Return to Origin</button>
            </div>
          ) : landmarkData && (
            <>
              <div className="absolute top-0 left-0 w-full z-[60] p-8 flex justify-between items-start bg-gradient-to-b from-black to-transparent pointer-events-none">
                <div className="pointer-events-auto">
                  <button onClick={reset} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 uppercase tracking-widest text-xs font-bold transition-all"><ArrowLeft size={18}/> Back</button>
                  <h1 className="text-5xl font-serif text-white mb-1">{landmarkData.name}</h1>
                  <p className="text-amber-400 flex items-center gap-2 text-xs uppercase tracking-widest"><MapPin size={14}/> {landmarkData.location}</p>
                </div>
                <div className="pointer-events-auto flex items-center gap-3">
                  {landmarkData.isCustom && <button onClick={handleSaveToCollection} className={`p-4 rounded-full border transition-all ${savedLandmarks.some(l => l.id === landmarkData.id) ? 'bg-green-600/20 border-green-500/50 text-green-400' : 'bg-amber-500 border-amber-500 text-slate-950 hover:bg-amber-400'}`}>{isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}</button>}
                  <button onClick={handleRegenerate} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-amber-500 hover:bg-amber-500 hover:text-slate-900 transition-all"><RefreshCw size={20} /></button>
                  {landmarkData.audioNarrative && <AudioPlayer audioBase64={landmarkData.audioNarrative} />}
                  <button onClick={() => setIsInfoVisible(true)} className="px-6 py-4 bg-transparent border border-white/20 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2"><BookOpen size={18}/> Details</button>
                </div>
              </div>
              <div ref={containerRef} className="flex-1 relative bg-black overflow-hidden select-none" style={{ perspective: isPanoramicMode ? 'none' : '1200px' }} onWheel={(e) => { if(!isPanoramicMode) setTransform(prev => ({ ...prev, scale: Math.max(0.5, Math.min(5, prev.scale - e.deltaY * 0.001)) })) }} onMouseMove={(e) => { if(!isPanoramicMode && !isDragging) { const rect = containerRef.current!.getBoundingClientRect(); setTilt({ x: ((e.clientY - (rect.top + rect.height/2)) / (rect.height/2)) * -4, y: ((e.clientX - (rect.left + rect.width/2)) / (rect.width/2)) * 4 }); } if(isDragging) { setTransform(prev => ({ ...prev, x: prev.x + (e.clientX - lastMousePos.current.x), y: prev.y + (e.clientY - lastMousePos.current.y) })); lastMousePos.current = { x: e.clientX, y: e.clientY }; } }} onMouseDown={(e) => { if(transform.scale > 1) setIsDragging(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; }} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => { setIsDragging(false); setTilt({x:0, y:0}); }}>
                <div className="absolute inset-0 transition-all duration-700 ease-out" style={{ transform: isPanoramicMode ? 'none' : `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotateX(${transform.rx + tilt.x}deg) rotateY(${transform.ry + tilt.y}deg)`, transformOrigin: 'center center', transformStyle: 'preserve-3d' }}>
                  {landmarkData.timeline.map((event, idx) => (
                    <TimelineImage key={`${landmarkData.id}-${idx}`} index={idx} event={event} landmarkName={landmarkData.name} referenceImage={landmarkData.originalImage} currentProgress={currentProgress} isPanoramicMode={isPanoramicMode} onGenerated={(imageUrl, hotspots) => handleLazyImageGenerated(idx, imageUrl, hotspots)} />
                  ))}
                </div>
                {isInfoVisible && (
                  <div className="absolute top-0 right-0 h-full w-full md:w-[480px] bg-slate-950/90 backdrop-blur-xl border-l border-white/10 z-[110] p-12 overflow-y-auto animate-in slide-in-from-right duration-500 pointer-events-auto">
                    <button onClick={() => setIsInfoVisible(false)} className="absolute top-8 right-8 p-2 text-slate-400 hover:text-white"><X size={24}/></button>
                    <div className="mb-12"><span className="text-8xl font-serif text-amber-500/80">{landmarkData.timeline[currentEventIndex]?.year}</span></div>
                    <h3 className="text-4xl font-serif text-white mb-8">{landmarkData.timeline[currentEventIndex]?.title}</h3>
                    <p className="text-slate-300 text-lg font-light leading-relaxed mb-12">{landmarkData.timeline[currentEventIndex]?.description}</p>
                    {landmarkData.sources && (
                      <div className="pt-8 border-t border-white/5">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-4">Historical Sources</h4>
                        <div className="space-y-2">{landmarkData.sources.map((s, i) => <a key={i} href={s.url} target="_blank" className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-xs hover:bg-white/10 transition-all"><span>{s.title}</span><ExternalLink size={12}/></a>)}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="absolute right-8 bottom-48 z-[60] flex flex-col gap-3 pointer-events-auto">
                <button onClick={() => { setIsPanoramicMode(!isPanoramicMode); if(!isPanoramicMode) setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 }); }} className={`p-4 rounded-full border transition-all ${isPanoramicMode ? 'bg-amber-500 text-slate-950 scale-110' : 'bg-slate-900/80 text-white'}`}><Globe size={24}/></button>
                {!isPanoramicMode && <button onClick={() => setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 })} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-white"><Maximize size={24}/></button>}
              </div>
              <UserNotesManager landmarkName={landmarkData.name} yearContext={landmarkData.timeline[currentEventIndex]?.year || 0} notes={landmarkData.userNotes || []} onSaveNote={async (n) => { const updated = { ...landmarkData, userNotes: [...(landmarkData.userNotes || []), n] }; setLandmarkData(updated); await storageService.saveLandmark(updated); }} onDeleteNote={async (id) => { const updated = { ...landmarkData, userNotes: (landmarkData.userNotes || []).filter(n => n.id !== id) }; setLandmarkData(updated); await storageService.saveLandmark(updated); }} />
              <TimelineSlider events={landmarkData.timeline} currentProgress={currentProgress} onChange={setCurrentProgress} />
            </>
          )}
        </div>
      )}

      {isAboutVisible && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="max-w-2xl w-full bg-slate-900 border border-amber-500/20 rounded-[40px] p-12 md:p-20 shadow-2xl relative animate-in zoom-in-95">
            <button onClick={() => setIsAboutVisible(false)} className="absolute top-8 right-8 p-2 text-slate-500 hover:text-white"><X size={32}/></button>
            <h2 className="text-6xl font-serif text-amber-100 mb-8 text-center">The Historian</h2>
            <div className="space-y-6 text-slate-300 text-lg font-light leading-relaxed">
              <p><span className="text-amber-500 font-bold">Immersive Reconstruction:</span> Blending panoramic views with chronological storytelling to manifest the veil of time.</p>
              <p><span className="text-amber-500 font-bold">Research Intelligence:</span> Upload or query a topic to generate custom dossiers and immersive timelines via the Historian AI.</p>
              <p><span className="text-amber-500 font-bold">Automatic Seeding:</span> New archives are populated from the Google Cloud Storage bucket if the local store is empty.</p>
            </div>
          </div>
        </div>
      )}

      {isConfigOpen && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 flex items-center justify-center p-6 backdrop-blur-xl">
          <div className="max-w-md w-full bg-slate-900 border border-amber-500/20 rounded-[40px] p-10 shadow-2xl animate-in zoom-in-95">
            <h2 className="text-3xl font-serif text-amber-100 mb-6 text-center">Archive Configuration</h2>
            <p className="text-slate-400 text-sm mb-8 text-center font-light">Configure external data seeding for the initial archive state.</p>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-amber-500 font-bold ml-1">Bucket URL</label>
                <input value={storageConfig.url} onChange={(e) => setStorageConfig({ ...storageConfig, url: e.target.value })} placeholder="https://storage.googleapis.com/..." className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-500 outline-none transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-amber-500 font-bold ml-1">Access Key (Optional)</label>
                <input type="password" value={storageConfig.accessKey || ''} onChange={(e) => setStorageConfig({ ...storageConfig, accessKey: e.target.value })} placeholder="OAuth or Service Token" className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-amber-500 outline-none transition-all" />
              </div>
              <div className="pt-4 flex gap-4">
                <button onClick={handleSaveConfig} className="flex-1 py-4 bg-amber-500 text-slate-950 font-bold rounded-2xl hover:bg-amber-400 transition-all uppercase tracking-widest text-xs">Save Archive Config</button>
                <button onClick={() => setIsConfigOpen(false)} className="px-8 py-4 bg-slate-800 text-slate-300 font-bold rounded-2xl hover:bg-slate-700 transition-all uppercase tracking-widest text-xs">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(isGeneratingStickers || stickerSheetUrl) && (
        <div className="fixed inset-0 z-[400] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-12">
          <div className="max-w-4xl w-full bg-slate-900 border border-white/10 rounded-[40px] overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 shadow-2xl">
            <div className="flex-1 bg-black p-8 flex items-center justify-center min-h-[400px]">
              {isGeneratingStickers ? <div className="flex flex-col items-center gap-6 text-amber-500"><Loader2 size={64} className="animate-spin" /><p className="font-serif uppercase tracking-widest">Manifesting Stickers...</p></div> : <img src={stickerSheetUrl!} className="max-w-full h-auto rounded-2xl" />}
            </div>
            <div className="w-full md:w-80 p-10 flex flex-col justify-between bg-slate-900/50">
              <div className="space-y-6">
                <h3 className="text-3xl font-serif text-white">{stickerTargetName}</h3>
                <p className="text-slate-400 text-sm font-light leading-relaxed">Exclusive archival artifacts generated for your discovery.</p>
              </div>
              <div className="space-y-4 pt-8 border-t border-white/5">
                <button onClick={handlePrintStickers} disabled={isGeneratingStickers} className="w-full py-4 bg-amber-500 rounded-2xl text-slate-950 font-bold flex items-center justify-center gap-3 uppercase tracking-widest text-xs hover:bg-amber-400 transition-all disabled:opacity-50"><Printer size={18}/> Print Sheet</button>
                <button onClick={() => setStickerSheetUrl(null)} className="w-full py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-slate-700 transition-all">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
