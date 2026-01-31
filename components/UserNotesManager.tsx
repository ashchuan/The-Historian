
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Send, Square, Trash2, StickyNote, Play, Pause, AlertCircle, Loader2, X } from 'lucide-react';
import { UserNote } from '../types';
import * as geminiService from '../services/geminiService';

interface UserNotesManagerProps {
  landmarkName: string;
  yearContext: number;
  notes: UserNote[];
  onSaveNote: (note: UserNote) => void;
  onDeleteNote: (id: string) => void;
}

const UserNotesManager: React.FC<UserNotesManagerProps> = ({ 
  landmarkName, 
  yearContext, 
  notes, 
  onSaveNote, 
  onDeleteNote 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Audio Playback state for notes
  const [playingId, setPlayingId] = useState<string | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      if (currentSourceRef.current) currentSourceRef.current.stop();
    };
  }, []);

  const handleToggleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
            const base64 = (reader.result as string).split(',')[1];
            validateAndSave(base64, true);
          };
          stream.getTracks().forEach(track => track.stop());
        };
        
        recorder.start();
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } catch (err) {
        setError("Microphone access denied or not available.");
      }
    }
  };

  const validateAndSave = async (content: string, isAudio: boolean) => {
    setIsValidating(true);
    setError(null);
    try {
      const result = await geminiService.validateRelevance(landmarkName, yearContext, content, isAudio);
      if (result.relevant) {
        const newNote: UserNote = {
          id: `note-${Date.now()}`,
          type: isAudio ? 'audio' : 'text',
          content,
          timestamp: Date.now(),
          yearContext
        };
        onSaveNote(newNote);
        if (!isAudio) setText('');
      } else {
        setError(result.feedback || "This entry doesn't seem relevant to the current landmark.");
      }
    } catch (err) {
      setError("System failed to validate content. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const playAudioNote = async (id: string, base64: string) => {
    if (playingId === id) {
      currentSourceRef.current?.stop();
      setPlayingId(null);
      return;
    }

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      // Use standard audio decoder for recorded WebM/Opus files
      const buffer = await geminiService.decodeStandardAudio(base64, audioContextRef.current);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setPlayingId(null);
      
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch(e) {}
      }
      currentSourceRef.current = source;
      source.start();
      setPlayingId(id);
    } catch (e) {
      console.error(e);
      setError("Could not play audio clip.");
    }
  };

  return (
    <div className="fixed bottom-32 right-8 z-[70] flex flex-col items-end pointer-events-none">
      {/* List Panel */}
      {isOpen && (
        <div className="w-80 max-h-[400px] bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-3xl mb-4 pointer-events-auto flex flex-col shadow-2xl animate-in slide-in-from-bottom-4">
          <div className="p-4 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-2 text-amber-500">
              <StickyNote size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">Historical Log</span>
            </div>
            <button onClick={() => setIsOpen(false)}><X size={16} className="text-slate-400 hover:text-white" /></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
            {notes.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm italic">No entries in the log yet.</div>
            ) : (
              notes.map(note => (
                <div key={note.id} className="p-3 bg-white/5 border border-white/5 rounded-xl group relative">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest">{note.yearContext} AD</span>
                    <button onClick={() => onDeleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {note.type === 'text' ? (
                    <p className="text-xs text-slate-300 leading-relaxed">{note.content}</p>
                  ) : (
                    <button 
                      onClick={() => playAudioNote(note.id, note.content)}
                      className="flex items-center gap-2 text-xs text-white hover:text-amber-400 transition-colors w-full py-1"
                    >
                      {playingId === note.id ? <Pause size={14} className="animate-pulse" /> : <Play size={14} />}
                      Audio Dispatch
                    </button>
                  )}
                  <div className="mt-2 text-[9px] text-slate-500">{new Date(note.timestamp).toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 bg-black/40 border-t border-white/5 rounded-b-3xl space-y-3">
             {error && (
               <div className="p-2 bg-red-900/20 border border-red-500/30 rounded-lg flex items-start gap-2 text-red-400 text-[10px] animate-in shake duration-300">
                 <AlertCircle size={14} className="shrink-0" />
                 <span>{error}</span>
               </div>
             )}
            
            <div className="flex gap-2">
              <input 
                value={text} 
                onChange={e => setText(e.target.value)}
                placeholder="Transcribe thought..."
                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-all"
                onKeyDown={e => e.key === 'Enter' && text && validateAndSave(text, false)}
              />
              <button 
                disabled={!text || isValidating}
                onClick={() => validateAndSave(text, false)}
                className="p-2 bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-all"
              >
                {isValidating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            
            <button 
              onClick={handleToggleRecord}
              disabled={isValidating}
              className={`w-full py-2 flex items-center justify-center gap-2 rounded-lg text-xs font-bold transition-all ${isRecording ? 'bg-red-600 animate-pulse text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
            >
              {isRecording ? <Square size={14} fill="white" /> : <Mic size={14} />}
              {isRecording ? 'Capturing Audio...' : 'Record Audio Memo'}
            </button>
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-4 rounded-full border border-white/10 transition-all shadow-2xl pointer-events-auto group ${isOpen ? 'bg-amber-500 text-slate-950' : 'bg-slate-900/80 backdrop-blur-xl text-white hover:bg-amber-500 hover:text-slate-900'}`}
      >
        <StickyNote size={24} className="group-hover:scale-110 transition-transform" />
        {notes.length > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900">
            {notes.length}
          </div>
        )}
      </button>
    </div>
  );
};

export default UserNotesManager;
