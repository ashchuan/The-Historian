
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, MapPin, Loader2, ArrowLeft, Info, X, ZoomIn, ZoomOut, Maximize, RefreshCw, Globe, Save, Trash2, BookOpen, StickyNote, Mic, Download, FileText, CheckCircle2, ShieldCheck, ExternalLink, Settings, Link as LinkIcon, Sparkles, Printer, Image as ImageIcon, Menu, Upload, FileJson } from 'lucide-react';
import { LandmarkData, LoadingState, ViewMode, SceneHotspot, UserNote, ResearchPaper } from './types';
import * as geminiService from './services/geminiService';
import * as storageService from './services/storageService';
import { generatePDF } from './services/pdfService';
import TimelineSlider from './components/TimelineSlider';
import AudioPlayer from './components/AudioPlayer';
import TimelineImage from './components/TimelineImage';
import UserNotesManager from './components/UserNotesManager';
import HistorianAgent from './components/HistorianAgent';

// Plain Sky Blue Canvas Data URI for stable placeholders
const SKY_BLUE_CANVAS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='100%25' height='100%25' fill='%2387CEEB'/%3E%3C/svg%3E";

const PRESETS = [
  { id: 'eiffel', name: 'Eiffel Tower', location: 'Paris, France', image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?auto=format&fit=crop&q=80&w=800' },
  { id: 'sagrada', name: 'Sagrada Família', location: 'Barcelona, Spain', image: '/images/sagrada.png' },
  { id: 'colosseum', name: 'Colosseum', location: 'Rome, Italy', image: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&q=80&w=800' },
  { id: 'stpauls', name: "St Paul's Cathedral", location: 'London, UK', image: '/images/stpaul.png' },
  { id: 'tajmahal', name: 'Taj Mahal', location: 'Agra, India', image: '/images/tajmahal.png' },
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

  // Sticker State
  const [stickerSheetUrl, setStickerSheetUrl] = useState<string | null>(null);
  const [isGeneratingStickers, setIsGeneratingStickers] = useState(false);
  const [stickerTargetName, setStickerTargetName] = useState<string | null>(null);

  // Pre-generation status tracking
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
    document.body.style.overflow = (viewMode === ViewMode.EXPERIENCE || stickerSheetUrl || isAboutVisible) ? 'hidden' : 'auto';
    if (viewMode === ViewMode.HOME && isSetupComplete) {
      loadInitialData();
    }
  }, [viewMode, isSetupComplete, stickerSheetUrl, isAboutVisible]);

  const loadInitialData = async () => {
    let all = await storageService.getAllLandmarks();

    // Automatic Archive Seeding Logic
    if (all.length === 0) {
      try {
        console.group("🕰️ The Historian: Archive Seeding");
        console.log("Checking storage... Archive is empty.");
        console.log("Fetching local manifest: data.json");
        const response = await fetch('./data.json');
        if (response.ok) {
          const seedData = await response.json();
          console.log("Manifest loaded. Ingesting records...");

          if (seedData.landmarks) {
            for (const l of seedData.landmarks) {
              await storageService.saveLandmark(l);
              console.log(`✅ Seeded Landmark: ${l.name}`);
            }
          }
          if (seedData.papers) {
            for (const p of seedData.papers) {
              await storageService.saveResearchPaper(p);
              console.log(`✅ Seeded Research: ${p.title}`);
            }
          }
          console.log("Temporal Archive Seeded successfully.");
          // Refresh list after seeding
          all = await storageService.getAllLandmarks();
        } else {
          console.warn("data.json not found or inaccessible. Skipping seed.");
        }
        console.groupEnd();
      } catch (err) {
        console.error("Archive injection failed:", err);
        console.groupEnd();
      }
    }

    setSavedLandmarks(all);

    const allPapers = await storageService.getAllResearchPapers();
    setResearchPapers(allPapers.sort((a, b) => b.timestamp - a.timestamp));

    // Re-evaluate statuses based on the potentially newly seeded data
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

    if (isSetupComplete) {
      triggerParallelSync(status);
    }
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
        id: preset.id,
        name: preset.name,
        location: preset.location,
        timeline: timelineEvents,
        audioNarrative,
        isCustom: false,
        userNotes: [],
        sources
      };

      await storageService.saveLandmark(newLandmark);
      setPregeneratedLandmarks(prev => ({ ...prev, [preset.id]: newLandmark }));
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'ready' }));
    } catch (error: any) {
      setPresetStatus(prev => ({ ...prev, [preset.id]: 'idle' }));
    }
  };

  const handleClearArchive = async () => {
    if (window.confirm("CRITICAL: This will permanently purge your local archive to free up storage space. All custom discoveries will be lost. Proceed?")) {
      try {
        await storageService.clearAllData();
        alert("Archive Purged. Reloading temporal engine...");
        window.location.reload();
      } catch (err) {
        alert("Failed to purge archive.");
      }
    }
  };

  const handleExportArchive = async () => {
    try {
      const landmarks = await storageService.getAllLandmarks();
      const papers = await storageService.getAllResearchPapers();
      const archiveData = {
        version: "1.0",
        timestamp: Date.now(),
        landmarks,
        papers
      };

      const blob = new Blob([JSON.stringify(archiveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TheHistorian_Archive_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIsMenuOpen(false);
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to Manifest Export Blob. Check console for details.");
    }
  };

  const handleImportArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.landmarks && !json.papers) {
          throw new Error("Malformed Archive: No historical data found.");
        }

        if (json.landmarks) {
          for (const l of json.landmarks) await storageService.saveLandmark(l);
        }
        if (json.papers) {
          for (const p of json.papers) await storageService.saveResearchPaper(p);
        }

        alert("Discovery Archive Successfully Integrated. Temporal stream updated.");
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

  const handleGenerateStickers = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsGeneratingStickers(true);
    setStickerTargetName(name);
    try {
      const base64 = await geminiService.generateStickerSheet(name);
      setStickerSheetUrl(`data:image/png;base64,${base64}`);
    } catch (error: any) {
      console.error("Sticker generation failed", error);
      if (error?.message?.includes("Requested entity was not found")) {
        handleOpenKeySelection();
      } else {
        alert("Failed to manifest stickers. Please ensure your API key is correctly configured.");
      }
    } finally {
      setIsGeneratingStickers(false);
    }
  };

  const handlePrintStickers = () => {
    if (!stickerSheetUrl) return;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Sticker Sheet - ${stickerTargetName}</title>
            <style>
              body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: white; }
              img { max-width: 100%; height: auto; display: block; }
              @media print {
                body { background: none; }
                img { width: 100%; height: auto; }
              }
            </style>
          </head>
          <body>
            <img src="${stickerSheetUrl}" onload="window.print();window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    }
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
    const id = presetData?.id || 'unknown';

    if (viewMode !== ViewMode.EXPERIENCE) {
      setPresetStatus(prev => ({ ...prev, [id]: 'loading' }));
    }

    if (!ignoreCache && pregeneratedLandmarks[id]) {
      setLandmarkData(pregeneratedLandmarks[id]);
      setLoadingState({ status: 'ready', progress: 100 });
      setViewMode(ViewMode.EXPERIENCE);
      return;
    }

    setViewMode(ViewMode.EXPERIENCE);
    setLoadingState({ status: 'planning', message: 'Initializing temporal anchor...', progress: 5 });

    try {
      if (!ignoreCache) {
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
      const { timeline: timelineEvents, sources } = await geminiService.generateTimelinePlan(name, location);

      const newLandmark: LandmarkData = {
        id, name, location, originalImage: base64Image, timeline: timelineEvents, isCustom, userNotes: [], sources
      };
      setLandmarkData(newLandmark);

      setLoadingState({ status: 'visualizing', message: 'Visualizing history & narration...', progress: 60 });

      const [firstImageBase64, audioNarrative] = await Promise.all([
        geminiService.generateHistoricalImage(timelineEvents[0], name, base64Image),
        geminiService.generateNarration(name, timelineEvents)
      ]);

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
      setPregeneratedLandmarks(prev => ({ ...prev, [id]: updatedLandmark }));
      setPresetStatus(prev => ({ ...prev, [id]: 'ready' }));
      setLoadingState({ status: 'ready', progress: 100 });
    } catch (error: any) {
      console.error(error);
      const msg = error?.message || "";
      if (msg.includes("Requested entity was not found") || msg.includes("Quota Exhausted")) {
        setIsSetupComplete(false);
        setViewMode(ViewMode.HOME);
      }
      setPresetStatus(prev => ({ ...prev, [id]: 'idle' }));
      setLoadingState({ status: 'error', message: error.message || 'Temporal communication failed.' });
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
        userNotes: [],
        sources: paper.sources,
        fullReport: paper
      };
      setLandmarkData(newLandmark);

      setLoadingState({ status: 'visualizing', message: 'Generating visualizations...', progress: 60 });

      const referenceImg = paper.images.length > 0 ? paper.images[0].split(',')[1] : undefined;
      const [firstImageBase64, audioNarrative] = await Promise.all([
        geminiService.generateHistoricalImage(timelineEvents[0], paper.title, referenceImg),
        geminiService.generateNarration(paper.title, timelineEvents)
      ]);

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
      setLoadingState({ status: 'error', message: error.message || 'Journey transformation failed.' });
    }
  };

  const loadResearchPapers = async () => {
    const all = await storageService.getAllResearchPapers();
    setResearchPapers(all.sort((a, b) => b.timestamp - a.timestamp));
  };

  const handleLazyImageGenerated = async (index: number, imageUrl: string, hotspots?: SceneHotspot[]) => {
    setLandmarkData(prev => {
      if (!prev) return null;
      const newTimeline = [...prev.timeline];
      newTimeline[index] = { ...newTimeline[index], imageUrl, isGenerated: true, hotspots: hotspots || newTimeline[index].hotspots };
      const updated = { ...prev, timeline: newTimeline };
      storageService.saveLandmark(updated);
      return updated;
    });
  };

  const handleSaveToCollection = async () => {
    if (!landmarkData) return;
    setIsSaving(true);
    await storageService.saveLandmark(landmarkData);
    const all = await storageService.getAllLandmarks();
    setSavedLandmarks(all);
    setIsSaving(false);
  };

  const handleDeleteSaved = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to remove this landmark from your collection?");
    if (confirmed) {
      try {
        await storageService.deleteLandmark(id);
        setSavedLandmarks(prev => prev.filter(l => l.id !== id));
        setPregeneratedLandmarks(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch (err) {
        console.error("Failed to delete landmark:", err);
      }
    }
  };

  const handleRefreshPreset = async (preset: typeof PRESETS[0], e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Refresh the historical data for ${preset.name}? This will regenerate the timeline and narration.`)) {
      await storageService.deleteLandmark(preset.id);
      setPregeneratedLandmarks(prev => {
        const next = { ...prev };
        delete next[preset.id];
        return next;
      });
      startExperience(undefined, false, preset, true);
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
    const updated = { ...landmarkData, userNotes: [...(landmarkData.userNotes || []), note] };
    setLandmarkData(updated);
    await storageService.saveLandmark(updated);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!landmarkData) return;
    const updated = { ...landmarkData, userNotes: (landmarkData.userNotes || []).filter(n => n.id !== noteId) };
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
    setIsMenuOpen(false);
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
        x: ((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * -4,
        y: ((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * 4
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

  const renderSetup = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80&w=1920" className="w-full h-full object-cover opacity-20 blur-xl scale-110" alt="setup" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/80 to-slate-950" />
      </div>
      <div className="relative z-10 max-w-xl w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-1000">
        <div className="mx-auto w-24 h-24 bg-amber-500/20 rounded-full flex items-center justify-center border border-amber-500/50 shadow-[0_0_50px_rgba(251,191,36,0.2)]">
          <ShieldCheck size={48} className="text-amber-500" />
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-serif text-amber-100 py-2">Initialize Engine</h1>
          <p className="text-slate-400 text-lg font-light leading-relaxed">The Historian requires a paid API key for high-bandwidth archival access.</p>
        </div>
        <div className="p-6 bg-slate-900/60 rounded-3xl border border-white/5 space-y-4">
          <div className="flex items-start gap-4 text-left">
            <div className="mt-1 p-2 bg-amber-500/10 rounded-lg"><Info size={20} className="text-amber-500" /></div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-200">Billing Required</p>
              <p className="text-xs text-slate-500">To fix "RESOURCE_EXHAUSTED", select a key from a paid GCP project. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-amber-500 underline">Read docs</a></p>
            </div>
          </div>
        </div>
        <button onClick={handleOpenKeySelection} className="w-full py-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-[0.2em] text-sm rounded-2xl transition-all shadow-2xl flex items-center justify-center gap-3">
          <Settings size={20} className="animate-spin-slow" /> Configure API Credentials
        </button>
      </div>
    </div>
  );

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
            <p className="text-xl md:text-2xl text-slate-300 mb-4 font-light max-w-2xl mx-auto">Step through the veil of time. Identify landmarks or conduct deep research to manifest immersive historical panoramas.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20 animate-in fade-in slide-in-from-top-4 duration-700">
            <section className="bg-slate-800/40 backdrop-blur-xl p-10 rounded-3xl border border-white/5 hover:bg-slate-800/60 transition-all cursor-pointer group relative overflow-hidden shadow-2xl h-full flex flex-col justify-center">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" />
              <div className="flex flex-col items-center gap-6 text-slate-300 group-hover:text-amber-400 transition-colors">
                <div className="p-6 bg-slate-700/50 rounded-full group-hover:bg-slate-600/50 transition-all group-hover:scale-110 shadow-inner"><Camera size={56} className="text-amber-500" /></div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2 font-serif">Identify & Explore</h3>
                  <p className="text-slate-400 font-light text-sm">Upload a photo to travel through its specific history</p>
                </div>
              </div>
            </section>
            <HistorianAgent papers={researchPapers} onRefresh={loadResearchPapers} onLaunchJourney={paper => handleLaunchJourneyFromPaper(paper)} />
          </div>

          {researchDiscoveryLandmarks.length > 0 && (
            <div className="text-left mb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest opacity-80 mb-8 border-l-4 border-amber-500 pl-4">Your Discoveries</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {researchDiscoveryLandmarks.map(landmark => (
                  <div key={landmark.id} className="group relative h-80 rounded-2xl overflow-hidden shadow-2xl border border-white/5 transition-all hover:scale-[1.02]">
                    <div className="absolute inset-0 w-full h-full">
                      <img
                        src={landmark.originalImage ? `data:image/jpeg;base64,${landmark.originalImage}` : (landmark.timeline[landmark.timeline.length - 1]?.imageUrl || SKY_BLUE_CANVAS)}
                        alt={landmark.name}
                        className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:brightness-90 transition-all"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8 transition-all group-hover:from-amber-950/80">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400 mb-2">{landmark.name}</h3>
                        <div className="flex items-center gap-2 text-slate-300 text-sm tracking-widest uppercase"><MapPin size={16} className="text-amber-500" />{landmark.location}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setLandmarkData(landmark);
                        setViewMode(ViewMode.EXPERIENCE);
                        setLoadingState({ status: 'ready', progress: 100 });
                      }}
                      className="absolute inset-0 z-10 w-full h-full cursor-pointer text-left bg-transparent border-none appearance-none"
                    />

                    <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => handleGenerateStickers(landmark.name, e)}
                        className="p-3 bg-amber-500 backdrop-blur-md rounded-full text-slate-900 shadow-lg active:scale-95 hover:bg-amber-400"
                        title="Print Stickers"
                      >
                        <Printer size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSaved(landmark.id, e)}
                        className="p-3 bg-red-600/90 hover:bg-red-500 text-white rounded-full shadow-2xl active:scale-95"
                        title="Remove from Collection"
                      >
                        <Trash2 size={18} />
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
                      className="absolute inset-0 w-full h-full text-left z-10"
                      disabled={status === 'loading'}
                    >
                      <img src={preset.image} alt={preset.name} className="absolute inset-0 w-full h-full object-cover brightness-75 group-hover:brightness-90" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-8 transition-all group-hover:from-amber-950/80">
                        <h3 className="text-2xl font-serif text-white group-hover:text-amber-400 mb-2">{preset.name}</h3>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-300 text-sm tracking-widest uppercase"><MapPin size={16} className="text-amber-500" />{preset.location}</div>
                          <div className="flex items-center gap-2">
                            {status === 'loading' ? (
                              <div className="flex items-center gap-1.5 text-amber-400 text-[10px] font-bold uppercase tracking-widest animate-pulse bg-black/60 px-2 py-1 rounded-md"><Loader2 size={12} className="animate-spin" /> Loading</div>
                            ) : status === 'ready' ? (
                              <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold uppercase tracking-widest bg-black/60 px-2 py-1 rounded-md shadow-lg border border-green-500/30"><CheckCircle2 size={12} /> Ready</div>
                            ) : (
                              <div className="flex items-center gap-1 text-amber-200 text-[10px] font-bold uppercase tracking-widest bg-black/40 px-2 py-1 rounded-md border border-white/5 opacity-80"><Globe size={12} /> On Demand</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={(e) => handleGenerateStickers(preset.name, e)}
                        className="p-3 bg-amber-500 backdrop-blur-md rounded-full text-slate-900 shadow-lg active:scale-95 hover:bg-amber-400"
                        title="Print Stickers"
                      >
                        <Printer size={16} />
                      </button>
                      <button
                        onClick={(e) => handleRefreshPreset(preset, e)}
                        className="p-3 bg-slate-900/60 hover:bg-amber-500 backdrop-blur-md rounded-full text-white/70 hover:text-slate-950 shadow-lg active:scale-95 transition-all"
                        title="Regenerate Journey"
                        disabled={status === 'loading'}
                      >
                        <RefreshCw size={16} className={status === 'loading' ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
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
          <p className="mb-8 opacity-80 font-light max-w-lg">{loadingState.message}</p>
          <button onClick={reset} className="px-10 py-4 bg-slate-800 hover:bg-amber-500 rounded-full font-bold uppercase text-xs tracking-widest transition-all">Return to Origin</button>
        </div>
      );
    }
    if (!landmarkData) return null;
    const currentEvent = landmarkData.timeline[currentEventIndex];
    const isSavedInCollection = savedLandmarks.some(l => l.id === landmarkData.id);

    return (
      <div className="fixed inset-0 z-50 bg-black text-slate-100 flex flex-col">
        <div className="absolute top-0 left-0 w-full z-[60] p-8 flex justify-between items-start bg-gradient-to-b from-black via-black/60 to-transparent pointer-events-none">
          <div className="pointer-events-auto">
            <button onClick={reset} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 group uppercase tracking-widest text-xs font-bold">
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> Back
            </button>
            <h1 className="text-4xl md:text-5xl font-serif text-white mb-1">{landmarkData.name}</h1>
            <p className="text-amber-400 font-light flex items-center gap-2 tracking-widest uppercase text-xs"><MapPin size={14} /> {landmarkData.location}</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-3">
            {landmarkData.isCustom && (
              <button onClick={handleSaveToCollection} disabled={isSaving || isSavedInCollection} className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all shadow-xl border ${isSavedInCollection ? 'bg-green-600/20 border-green-500/50 text-green-400' : 'bg-amber-500 border-amber-500 text-slate-950 hover:bg-amber-400'}`}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : isSavedInCollection ? <Globe size={18} /> : <Save size={18} />}
                <span className="uppercase tracking-widest text-xs">{isSavedInCollection ? 'Saved' : 'Save Collection'}</span>
              </button>
            )}
            <button onClick={handleRegenerate} className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-900/80 border border-white/10 text-amber-500 hover:bg-amber-500 hover:text-slate-900 transition-all"><RefreshCw size={20} /></button>
            {landmarkData.audioNarrative && <AudioPlayer audioBase64={landmarkData.audioNarrative} />}

            {landmarkData.fullReport && (
              <button
                onClick={() => generatePDF(landmarkData.fullReport!)}
                className="px-6 py-3 rounded-full font-bold transition-all border bg-slate-900/80 text-amber-500 border-amber-500/30 hover:bg-amber-500 hover:text-slate-900 flex items-center gap-2 shadow-xl"
              >
                <Download size={18} />
                <span className="uppercase tracking-widest text-xs">Download Dossier</span>
              </button>
            )}

            <button onClick={() => setIsInfoVisible(true)} className="px-6 py-3 rounded-full font-bold transition-all border bg-transparent text-white border-white/20 hover:bg-white/10 flex items-center gap-2"><BookOpen size={18} /> <span className="uppercase tracking-widest text-xs">View Details</span></button>
          </div>
        </div>

        <div className="absolute right-8 bottom-48 z-[60] flex flex-col gap-3 pointer-events-auto">
          <button onClick={() => { setIsPanoramicMode(!isPanoramicMode); if (!isPanoramicMode) setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 }); }} className={`p-4 rounded-full border border-white/10 transition-all ${isPanoramicMode ? 'bg-amber-500 text-slate-950 scale-110' : 'bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-900'}`}><Globe size={24} /></button>
          {!isPanoramicMode && (
            <>
              <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale + 0.5, 5) }))} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-white hover:bg-amber-500 hover:text-slate-900"><ZoomIn size={24} /></button>
              <button onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale - 0.5, 0.5) }))} className="p-4 bg-slate-900/80 rounded-full border border-white/10 text-white hover:bg-amber-500 hover:text-slate-900"><ZoomOut size={24} /></button>
              <button onClick={() => setTransform({ scale: 1, x: 0, y: 0, rx: 0, ry: 0, rz: 0 })} className="p-4 bg-amber-500 rounded-full text-slate-950 hover:scale-110"><Maximize size={24} /></button>
            </>
          )}
        </div>

        <UserNotesManager landmarkName={landmarkData.name} yearContext={currentEvent?.year || 0} notes={landmarkData.userNotes || []} onSaveNote={handleSaveNote} onDeleteNote={handleDeleteNote} />

        <div ref={containerRef} className="flex-1 relative bg-black overflow-hidden select-none" style={{ perspective: isPanoramicMode ? 'none' : '1200px' }} onWheel={handleWheel} onMouseDown={(e) => { if ((transform.scale > 1) && !isPanoramicMode) setIsDragging(true); lastMousePos.current = { x: e.clientX, y: e.clientY }; }} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => { setIsDragging(false); setTilt({ x: 0, y: 0 }); }}>
          <div className="absolute inset-0 w-full h-full transition-all duration-700 ease-out" style={{ transform: isPanoramicMode ? 'none' : `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotateX(${transform.rx + tilt.x}deg) rotateY(${transform.ry + tilt.y}deg)`, transformOrigin: 'center center', transformStyle: 'preserve-3d' }}>
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
              <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm animate-in fade-in pointer-events-auto" onClick={() => setIsInfoVisible(false)} />
              <div className="absolute top-0 right-0 h-full w-full md:w-[480px] bg-slate-950/90 border-l border-white/10 z-[110] shadow-2xl animate-in slide-in-from-right duration-500 ease-out pointer-events-auto flex flex-col">
                <div className="p-8 flex justify-between items-center border-b border-white/5">
                  <div className="flex items-center gap-2 text-amber-500"><BookOpen size={20} /><span className="text-xs font-bold uppercase tracking-[0.2em]">Temporal Dossier</span></div>
                  <button onClick={() => setIsInfoVisible(false)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 md:p-12 scrollbar-hide">
                  <div className="mb-12"><span className="text-8xl font-serif text-amber-500/80 drop-shadow-glow">{currentEvent.year}</span><div className="h-1 w-24 bg-amber-500 mt-4 rounded-full"></div></div>
                  <h3 className="text-4xl font-serif text-white mb-8 leading-tight">{currentEvent.title}</h3>
                  <div className="space-y-6 text-slate-300 text-lg font-light mb-12">{currentEvent.description.split('\n').map((para, i) => <p key={i}>{para}</p>)}</div>

                  {currentEvent.hotspots && currentEvent.hotspots.length > 0 && (
                    <div className="mt-12 pt-8 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500 mb-6 flex items-center gap-2"><MapPin size={14} /> Local Reconnaissance</h4>
                      <div className="space-y-6">
                        {currentEvent.hotspots.map((hotspot) => (
                          <div key={hotspot.id} className="group/hotspot">
                            <h5 className="text-white font-serif text-lg mb-1 group-hover/hotspot:text-amber-400 transition-colors">{hotspot.name}</h5>
                            <p className="text-sm text-slate-400 font-light leading-relaxed">{hotspot.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {landmarkData.sources && landmarkData.sources.length > 0 && (
                    <div className="mt-16 pt-8 border-t border-white/5">
                      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500 mb-4 flex items-center gap-2"><LinkIcon size={14} /> Historical Sources</h4>
                      <div className="space-y-2">{landmarkData.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all group/link"><span className="text-xs text-slate-300 truncate max-w-[80%]">{source.title}</span><ExternalLink size={12} className="text-slate-500 group-hover/link:text-amber-500" /></a>)}</div>
                    </div>
                  )}
                </div>
                <div className="p-8 border-t border-white/5 bg-slate-900/50">
                  <button onClick={() => setIsInfoVisible(false)} className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg active:scale-[0.98]">Return to Observation</button>
                </div>
              </div>
            </>
          )}
        </div>
        <TimelineSlider events={landmarkData.timeline} currentProgress={currentProgress} onChange={setCurrentProgress} />
      </div>
    );
  };

  if (!isSetupComplete) return renderSetup();
  return (
    <>
      {/* Hidden Import Archival File Input */}
      <input
        type="file"
        ref={importFileRef}
        onChange={handleImportArchive}
        accept=".json"
        className="hidden"
      />

      {/* Global Top-Right Menu Button */}
      <div className="fixed top-6 right-6 z-[200] flex flex-col items-end gap-3">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`p-3 bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl text-amber-500 hover:bg-amber-500 hover:text-slate-900 transition-all shadow-xl active:scale-95 flex items-center justify-center`}
          aria-label="Open Menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {isMenuOpen && (
          <div className="w-64 bg-slate-950/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-top-4 duration-300 pointer-events-auto">
            <div className="p-3 border-b border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 px-3">Archive Management</span>
            </div>

            <button
              onClick={() => { setIsAboutVisible(true); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 transition-all group"
            >
              <Info size={18} className="text-amber-500 group-hover:text-slate-950 transition-colors" />
              <div className="flex flex-col">
                <span className="font-bold">About Project</span>
                <span className="text-[10px] opacity-70">The Historian Vision</span>
              </div>
            </button>

            <button
              onClick={handleExportArchive}
              className="w-full flex items-center gap-3 px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 transition-all group"
            >
              <Download size={18} className="text-amber-500 group-hover:text-slate-950 transition-colors" />
              <div className="flex flex-col">
                <span className="font-bold">Export Archive</span>
                <span className="text-[10px] opacity-70">Backup your discoveries</span>
              </div>
            </button>

            <button
              onClick={() => { importFileRef.current?.click(); }}
              className="w-full flex items-center gap-3 px-6 py-4 text-left text-sm text-slate-300 hover:bg-amber-500 hover:text-slate-950 transition-all group"
            >
              <Upload size={18} className="text-amber-500 group-hover:text-slate-950 transition-colors" />
              <div className="flex flex-col">
                <span className="font-bold">Import Archive</span>
                <span className="text-[10px] opacity-70">Restore JSON backup</span>
              </div>
            </button>

            <button
              onClick={handleClearArchive}
              className="w-full flex items-center gap-3 px-6 py-4 text-left text-sm text-slate-300 hover:bg-red-500 hover:text-white transition-all group border-t border-white/5"
            >
              <Trash2 size={18} className="text-red-500 group-hover:text-white transition-colors" />
              <div className="flex flex-col">
                <span className="font-bold">Purge Cache</span>
                <span className="text-[10px] opacity-70 text-red-400 group-hover:text-white">Free up storage</span>
              </div>
            </button>

            <button
              onClick={() => { reset(); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-6 py-4 text-left text-sm text-slate-300 hover:bg-slate-800 transition-all group border-t border-white/5"
            >
              <Globe size={18} className="text-slate-500 group-hover:text-amber-400" />
              <div className="flex flex-col">
                <span className="font-bold">Dashboard</span>
                <span className="text-[10px] opacity-70">Exit session</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {viewMode === ViewMode.HOME ? renderHome() : renderExperience()}

      {/* Global Sticker Modal */}
      {(isGeneratingStickers || stickerSheetUrl) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 md:p-12">
          <div className="relative max-w-4xl w-full bg-slate-900 border border-white/10 rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-500">
            {/* Visual Section */}
            <div className="flex-1 bg-black p-8 flex items-center justify-center relative min-h-[400px]">
              {isGeneratingStickers ? (
                <div className="flex flex-col items-center gap-6 text-amber-500 animate-pulse">
                  <Loader2 size={64} className="animate-spin" />
                  <p className="font-serif uppercase tracking-widest text-lg">Manifesting Fun Stickers...</p>
                </div>
              ) : (
                <img src={stickerSheetUrl!} alt="Stickers" className="max-w-full max-h-full rounded-2xl shadow-[0_0_50px_rgba(251,191,36,0.2)]" />
              )}
            </div>

            {/* Controls Section */}
            <div className="w-full md:w-80 p-10 flex flex-col justify-between bg-slate-900/50">
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-amber-500 text-[10px] font-bold uppercase tracking-widest">
                      <ImageIcon size={14} /> Fun Artifacts
                    </div>
                    <h3 className="text-3xl font-serif text-white">{stickerTargetName}</h3>
                  </div>
                  {!isGeneratingStickers && (
                    <button onClick={() => setStickerSheetUrl(null)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                      <X size={24} />
                    </button>
                  )}
                </div>
                <p className="text-slate-400 text-sm font-light leading-relaxed">
                  We've manifest a unique sheet of 6 fun stickers for this landmark. Perfect for digital scrapbooks or physical printing.
                </p>
              </div>

              <div className="space-y-4 pt-8 border-t border-white/5">
                <button
                  disabled={isGeneratingStickers}
                  onClick={handlePrintStickers}
                  className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-widest text-xs rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  <Printer size={18} />
                  Send to Printer
                </button>
                <button
                  onClick={() => setStickerSheetUrl(null)}
                  className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-widest text-xs rounded-2xl transition-all"
                >
                  Close Archive
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* About the Project Modal */}
      {isAboutVisible && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 md:p-12 overflow-y-auto">
          <div className="relative max-w-4xl w-full bg-slate-900/50 border border-amber-500/20 rounded-[40px] p-10 md:p-20 shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-500 text-slate-200">
            <button
              onClick={() => setIsAboutVisible(false)}
              className="absolute top-8 right-8 p-3 bg-slate-800/80 hover:bg-amber-500 rounded-full text-slate-400 hover:text-slate-950 transition-all active:scale-95 shadow-lg border border-white/5"
            >
              <X size={24} />
            </button>

            <div className="space-y-12 max-w-2xl mx-auto">
              <header className="text-center space-y-4">
                <div className="inline-block px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[10px] font-bold uppercase tracking-[0.4em] mb-4">
                  Project Dossier
                </div>
                <h2 className="text-5xl md:text-6xl font-serif text-amber-100">The Historian</h2>
                <div className="h-1 w-24 bg-amber-500 mx-auto rounded-full"></div>
              </header>

              <div className="space-y-8 leading-relaxed font-light">
                <p className="text-xl">
                  <span className="font-bold text-amber-200">The Historian</span> redefines history education through immersive technology. The app allows anyone to learn, experience and enjoy history of landmarks by blending panoramic views with chronological storytelling.
                </p>

                <p className="text-lg opacity-80">
                  The idea is to appeal to an audience of all ages using data already available online, and by augmenting the data using Generative Artificial Intelligence multi-modal capabilities, we aim to provide the following:
                </p>

                <ul className="space-y-8 text-lg">
                  <li className="flex gap-6 group">
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all">
                      <Globe size={24} />
                    </div>
                    <div className="space-y-2">
                      <span className="font-bold text-amber-100 block font-serif tracking-wider uppercase text-sm">Immersive Exploration</span>
                      <p className="opacity-70 text-sm">Navigate through various historical eras using AI-driven audio and visual reconstructions.</p>
                    </div>
                  </li>
                  <li className="flex gap-6 group">
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all">
                      <ShieldCheck size={24} />
                    </div>
                    <div className="space-y-2">
                      <span className="font-bold text-amber-100 block font-serif tracking-wider uppercase text-sm">User-Centric Research</span>
                      <p className="opacity-70 text-sm">Upload a photo or use the Scholar-Historian agent to research and generate a custom immersive timeline and a downloadable research dossier in PDF format.</p>
                    </div>
                  </li>
                  <li className="flex gap-6 group">
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all">
                      <Sparkles size={24} />
                    </div>
                    <div className="space-y-2">
                      <span className="font-bold text-amber-100 block font-serif tracking-wider uppercase text-sm">Creative Engagement</span>
                      <p className="opacity-70 text-sm">Users can leave audio or text timeline comments and for younger learners, the app rewards exploration with unique, stylized stickers available for digital use or printing.</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="pt-12 border-t border-white/5 text-center">
                <button
                  onClick={() => setIsAboutVisible(false)}
                  className="px-12 py-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold uppercase tracking-[0.3em] text-[10px] rounded-2xl transition-all shadow-xl active:scale-[0.98]"
                >
                  Return to Origin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
