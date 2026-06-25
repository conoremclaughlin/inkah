export interface SubtitleCue {
  start: number; // seconds
  end: number;
  text: string;
}

export interface VideoService {
  init(): void;
  getSubs(language: string): Promise<SubtitleCue[]>;
  findVideo(): HTMLVideoElement | null;
  getAvailableLanguages(): string[];
}
