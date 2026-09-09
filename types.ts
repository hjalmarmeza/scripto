export enum AppStatus {
  IDLE = 'IDLE',
  CAMERA = 'CAMERA',
  PROCESSING = 'PROCESSING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
}

export type ToolType = 'text' | 'checkbox-x' | 'checkbox-check' | 'whiteout' | 'signature' | 'image';

export interface OverlayElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  content: string; // Text content or Base64 Image URL
  width?: number; 
  height?: number; 
  fontSize?: number;
  fontWeight?: string; // 'normal' | 'bold'
  fontStyle?: string; // 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right';
  opacity?: number; // 0 to 1
  shape?: 'rectangle' | 'circle'; 
}

export interface PageData {
  id: string; // Unique ID for reordering
  src: string;
  width: number;
  height: number;
}

export interface OverlayState {
  id: string;
  data: any;
}