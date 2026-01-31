
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Book, Download, Trash2, AlertTriangle, FileText, Play, Pause, Check, RotateCcw, Link as LinkIcon, Image as ImageIcon, Timer, Globe } from 'lucide-react';
import * as geminiService from '../services/geminiService';
import * as storageService from '../services/storageService';
import { generatePDF } from '../services/pdfService';
import { ResearchPaper } from '../types';

interface HistorianAgentProps {
  papers: ResearchPaper[];
  onRefresh: () => Promise<void>;
  onLaunchJourney?: (paper: ResearchPaper) => void;
}

const HistorianAgent: React.FC<HistorianAgentProps> = ({ papers, onRefresh, onLaunchJourney }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  
  const [pendingAudio, setPendingAudio] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [isReviewPlaying, setIsReviewPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleToggleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        setError(null);
        setPendingAudio(null);
        setPendingUrl(null);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          setPendingUrl(url);

          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            setPendingAudio(base64);
          };
          stream.getTracks().forEach(track => track.stop());
        };
        
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        setError("Microphone access is required for the Historian Agent.");
      }
    }
  };

  const toggleReviewPlayback = () => {
    if (!reviewAudioRef.current) {
      reviewAudioRef.current = new Audio(pendingUrl!);
      reviewAudioRef.current.onended = () => setIsReviewPlaying(false);
    }
    
    if (isReviewPlaying) {
      reviewAudioRef.current.pause();
      setIsReviewPlaying(false);
    } else {
      reviewAudioRef.current.play();
      setIsReviewPlaying(true);
    }
  };

  const discardPending = () => {
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause();
      reviewAudioRef.current = null;
    }
    setPendingAudio(null);
    setPendingUrl(null);
    setIsReviewPlaying(false);
    setIsProcessing(false);
    setProcessingProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const confirmAndProcess = async () => {
    if (!pendingAudio) return;
    
    setIsProcessing(true);
    setProcessingProgress(5);
    setProcessingMessage('Consulting Global Archives...');
    setEstimatedSeconds(35); 
    setError(null);

    timerRef.current = window.setInterval(() => {
      setEstimatedSeconds(prev => Math.max(0, prev - 1));
    }, 1000);

    try {
      // Step 1: Deep Research with Grounding
      const result = await geminiService.conductHistoricalResearch(pendingAudio);
      
      setProcessingProgress(60);
      setProcessingMessage('Synthesizing Findings...');
      setEstimatedSeconds(15);

      if (result.approved && result.title && result.report) {
        let images: string[] = [];
        if (result.imagePrompts && result.imagePrompts.length > 0) {
          const count = Math.min(result.imagePrompts.length, 2);
          setProcessingMessage('Illustrating Historical Eras...');
          
          const imageTasks = result.imagePrompts.slice(0, count).map(async (prompt) => {
            try {
              const base64 = await geminiService.generateResearchImage(prompt);
              return `data:image/png;base64,${base64}`;
            } catch (e) {
              console.warn("Image generation failed", e);
              return null;
            }
          });

          const results = await Promise.all(imageTasks);
          images = results.filter((img): img is string => img !== null);
          setProcessingProgress(90);
        }

        setProcessingMessage('Archiving Dossier...');
        setEstimatedSeconds(2);

        const newPaper: ResearchPaper = {
          id: `paper-${Date.now()}`,
          topic: result.topic || result.title,
          title: result.title,
          content: result.report,
          images,
          sources: result.sources || [],
          timestamp: Date.now()
        };
        
        await storageService.saveResearchPaper(newPaper);
        await onRefresh();
        
        setProcessingProgress(100);
        setProcessingMessage('Discovery Complete.');
        
        // Finalize and Launch
        setTimeout(() => {
          onLaunchJourney?.(newPaper);
          discardPending();
        }, 500);
      } else {
        setError(result.reason || "Research request could not be fulfilled.");
        setIsProcessing(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch (err: any) {
      console.error("Research failed:", err);
      setError(`Archival communication error: ${err.message || 'System busy'}.`);
      setIsProcessing(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const deletePaper = async (id: string) => {
    await storageService.deleteResearchPaper(id);
    await onRefresh();
  };

  return (
    <div className="w-full flex flex-col gap-8">
      {/* Research Tile */}
      <section className="bg-slate-900/60 backdrop-blur-xl p-10 rounded-3xl border border-amber-500/20 group relative overflow-hidden shadow-2xl transition-all hover:border-amber-500/40">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Book size={120} />
        </div>

        <div className="flex flex-col items-center gap-6 text-slate-300 relative z-10">
          <div className={`p-6 bg-slate-800/80 rounded-full transition-all shadow-inner ${isRecording ? 'animate-pulse bg-red-900/40 shadow-red-500/20' : 'group-hover:scale-110 shadow-amber-500/10'}`}>
            <Book size={56} className={isRecording ? 'text-red-500' : 'text-amber-500'} />
          </div>
          
          <div className="text-center max-w-sm w-full">
            <h3 className="text-2xl font-bold mb-2 font-serif text-amber-100">Scholar-Historian Agent</h3>
            <p className="text-slate-400 font-light text-sm mb-6 leading-relaxed">
              Speak a historical topic. Our agent will verify its merit, research deeply, and deliver a formal dossier.
            </p>
            
            {pendingUrl ? (
              <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-2">
                {!isProcessing && (
                  <div className="bg-slate-800/50 p-4 rounded-2xl border border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={toggleReviewPlayback}
                        className="p-3 bg-amber-500 rounded-full text-slate-950 hover:bg-amber-400 transition-all"
                      >
                        {isReviewPlaying ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <span className="text-xs font-bold uppercase tracking-widest text-amber-500">Review Request</span>
                    </div>
                    <button onClick={discardPending} className="text-slate-500 hover:text-white transition-colors">
                      <RotateCcw size={18} />
                    </button>
                  </div>
                )}
                
                {isProcessing ? (
                  <div className="w-full space-y-4 py-4 animate-in fade-in">
                    <div className="flex justify-between items-end mb-1">
                      <div className="flex flex-col items-start">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1 animate-pulse">{processingMessage}</span>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase font-bold">
                          <Timer size={12} />
                          <span>Est. {estimatedSeconds}s remaining</span>
                        </div>
                      </div>
                      <span className="text-xl font-serif text-amber-200">{processingProgress}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(251,191,36,0.4)]"
                        style={{ width: `${processingProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button 
                      onClick={confirmAndProcess}
                      disabled={isProcessing}
                      className="flex-1 py-4 bg-green-600 hover:bg-green-500 text-white rounded-full font-bold uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
                    >
                      <Check size={16} />
                      Confirm Research
                    </button>
                    <button 
                      onClick={discardPending}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full font-bold uppercase tracking-[0.2em] text-[10px] transition-all"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button 
                onClick={handleToggleRecord}
                disabled={isProcessing}
                className={`w-full py-4 px-8 rounded-full font-bold uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-3 ${isRecording ? 'bg-red-600 text-white' : 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-xl active:scale-95'}`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Connecting Archives...
                  </>
                ) : isRecording ? (
                  <>
                    <Square size={16} fill="white" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic size={16} />
                    Begin Research
                  </>
                )}
              </button>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 text-xs text-left animate-in shake duration-300">
                <AlertTriangle size={18} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Research Library */}
      {papers.length > 0 && (
        <div className="text-left animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-serif text-amber-200 uppercase tracking-widest opacity-80 mb-8 border-l-4 border-amber-500 pl-4 flex items-center gap-3">
            <FileText size={20} /> Research Library (Temporary)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {papers.map(paper => (
              <div key={paper.id} className="p-6 bg-slate-800/40 border border-white/5 rounded-2xl flex flex-col justify-between hover:bg-slate-800/60 transition-all group shadow-lg">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="text-[10px] text-amber-500 font-bold uppercase tracking-widest bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">Archived Findings</span>
                    <button 
                      onClick={() => deletePaper(paper.id)}
                      className="text-slate-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h4 className="text-xl font-serif text-white group-hover:text-amber-400 transition-colors mb-2">{paper.title}</h4>
                  
                  <div className="flex gap-4 mb-4">
                    {paper.images.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase font-bold">
                        <ImageIcon size={12} /> {paper.images.length} Illustrations
                      </div>
                    )}
                    {paper.sources.length > 0 && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase font-bold">
                        <LinkIcon size={12} /> {paper.sources.length} Sources
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-6 font-light leading-relaxed italic opacity-80">
                    "{paper.content.substring(0, 150)}..."
                  </p>
                </div>
                
                <div className="flex flex-col gap-3 border-t border-white/5 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">{new Date(paper.timestamp).toLocaleDateString()}</span>
                    <button 
                      onClick={() => generatePDF(paper)}
                      className="flex items-center gap-2 text-xs font-bold text-amber-500 hover:text-amber-400 transition-all group/btn"
                    >
                      <Download size={14} className="group-hover/btn:translate-y-0.5 transition-transform" />
                      Download PDF
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => onLaunchJourney?.(paper)}
                    className="w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:border-amber-500 active:scale-[0.98]"
                  >
                    <Globe size={12} />
                    Begin Immersive Journey
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistorianAgent;
