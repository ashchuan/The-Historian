
export interface SceneHotspot {
  id: string;
  name: string;
  description: string;
  x: number; // 0-1 (normalized) or longitude for 360
  y: number; // 0-1 (normalized) or latitude for 360
}

export interface UserNote {
  id: string;
  type: 'text' | 'audio';
  content: string; // Text content or base64 audio
  timestamp: number;
  yearContext: number;
}

export interface ResearchPaper {
  id: string;
  topic: string;
  title: string;
  content: string;
  images: string[]; // Base64 image data
  sources: { title: string; url: string }[];
  timestamp: number;
}

export interface TimelineEvent {
  year: number;
  title: string;
  description: string;
  visualPrompt: string;
  imageUrl?: string;
  isGenerated: boolean;
  isPanoramic?: boolean;
  hotspots?: SceneHotspot[];
}

export interface LandmarkData {
  id: string;
  name: string;
  location: string;
  originalImage?: string;
  timeline: TimelineEvent[];
  audioNarrative?: string;
  isCustom: boolean;
  userNotes?: UserNote[];
  sources?: { title: string; url: string }[];
  fullReport?: ResearchPaper;
}

export interface StorageConfig {
  url: string;
  accessKey?: string;
}

export interface LoadingState {
  status: 'idle' | 'identifying' | 'planning' | 'visualizing' | 'narrating' | 'ready' | 'error';
  message?: string;
  progress?: number;
}

export enum ViewMode {
  HOME = 'HOME',
  EXPERIENCE = 'EXPERIENCE'
}
