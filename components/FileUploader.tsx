import React, { useCallback, useState, useRef } from 'react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  onCameraSelect: () => void;
  disabled: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, onCameraSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect, disabled]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const toggleMenu = () => {
    if (!disabled) setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div 
      className={`relative w-full max-w-2xl mx-auto transition-all duration-700 ${disabled ? 'opacity-50 grayscale pointer-events-none' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 
          Glass Container - Novel Shape 
          STATE LOGIC FOR BACKGROUND:
          - Idle: Deep Gradient (Same as Menu Open)
          - Menu Open: Deep Gradient
          - Dragging: Active Light Blue
      */}
      <div 
        className={`
          relative overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${isDragging 
            ? 'border-indigo-400 bg-indigo-50/90 rounded-[3rem] scale-105 shadow-[0_0_50px_rgba(99,102,241,0.3)] h-[340px] backdrop-blur-xl' 
            : isMenuOpen 
              ? 'h-[380px] border-white/10 bg-gradient-to-br from-indigo-950 via-purple-950 to-indigo-950 rounded-[3rem] shadow-2xl shadow-indigo-950/80' 
              : 'h-[260px] border-white/10 bg-gradient-to-br from-indigo-950 via-purple-950 to-indigo-950 rounded-[2.5rem] shadow-2xl shadow-indigo-950/40 hover:shadow-indigo-950/60 hover:scale-[1.02] cursor-pointer'
          }
          border
        `}
        onClick={!isMenuOpen && !isDragging ? toggleMenu : undefined}
      >
        
        {/* Decorative Abstract Shapes (Visible in dark modes) */}
        {!isDragging && (
           <>
             <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl"></div>
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-400 opacity-10 rounded-full translate-y-1/2 -translate-x-1/4 blur-2xl"></div>
           </>
        )}

        {/* STATE 1: IDLE / CALL TO ACTION (Dark Theme) */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-500 delay-75 ${isMenuOpen || isDragging ? 'opacity-0 scale-90 pointer-events-none blur-sm translate-y-10' : 'opacity-100 scale-100 translate-y-0'}`}>
            {/* Icon Container - Glowing */}
            <div className="w-20 h-20 relative mb-6 group">
               <div className="absolute inset-0 bg-white rounded-3xl opacity-20 blur-md group-hover:opacity-30 transition-opacity duration-500 animate-pulse"></div>
               <div className="absolute inset-0 bg-white/10 border border-white/20 rounded-3xl flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-500 ease-out">
                    <svg className="w-8 h-8 text-white drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
               </div>
            </div>
            
            <h3 className="text-3xl font-serif font-bold text-white mb-2 tracking-tight drop-shadow-sm">Nuevo Documento</h3>
            <p className="text-indigo-100/80 font-medium text-lg">Toca para digitalizar</p>
            <p className="text-indigo-200/50 font-medium text-sm mt-2">O arrastra archivos directamente</p>
        </div>

        {/* STATE 2: SUBMENU / SELECTION (Deep Theme) */}
        <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-500 ${isMenuOpen && !isDragging ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
            
            <h3 className="text-2xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-100 to-purple-200 mb-8 drop-shadow-md">
              Selecciona el origen
            </h3>
            
            <div className="flex items-center justify-center gap-4 w-full px-2">
                {/* Option A: Gallery - LIGHTER BACKGROUND FOR CONTRAST */}
                <button 
                    onClick={(e) => { e.stopPropagation(); triggerFileSelect(); }}
                    className="flex-1 group relative h-40 rounded-[2rem] transition-all duration-300 hover:-translate-y-1"
                >
                    {/* Glass Card Background - Increased opacity and gradient for separation */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-white/5 border border-white/25 rounded-[2rem] shadow-lg backdrop-blur-md group-hover:from-white/30 group-hover:to-white/10 group-hover:border-white/50 transition-all"></div>
                    
                    <div className="relative z-10 flex flex-col items-center justify-center h-full gap-4">
                        {/* Glowing Icon Container */}
                        <div className="w-14 h-14 relative">
                           <div className="absolute inset-0 bg-indigo-500 rounded-2xl opacity-0 blur-md group-hover:opacity-40 transition-opacity duration-500"></div>
                           <div className="absolute inset-0 bg-white/10 border border-white/30 rounded-2xl flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 shadow-inner">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                           </div>
                        </div>
                        <span className="font-bold text-sm text-white tracking-wide group-hover:text-white transition-colors">Galería</span>
                    </div>
                </button>

                {/* Option B: Camera - LIGHTER BACKGROUND FOR CONTRAST */}
                <button 
                    onClick={(e) => { e.stopPropagation(); onCameraSelect(); }}
                    className="flex-1 group relative h-40 rounded-[2rem] transition-all duration-300 hover:-translate-y-1"
                >
                    {/* Glass Card Background - Increased opacity and gradient for separation */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-white/5 border border-white/25 rounded-[2rem] shadow-lg backdrop-blur-md group-hover:from-white/30 group-hover:to-white/10 group-hover:border-white/50 transition-all"></div>
                    
                    <div className="relative z-10 flex flex-col items-center justify-center h-full gap-4">
                         {/* Glowing Icon Container */}
                        <div className="w-14 h-14 relative">
                           <div className="absolute inset-0 bg-purple-500 rounded-2xl opacity-0 blur-md group-hover:opacity-40 transition-opacity duration-500"></div>
                           <div className="absolute inset-0 bg-white/10 border border-white/30 rounded-2xl flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 shadow-inner">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                                </svg>
                           </div>
                        </div>
                        <span className="font-bold text-sm text-white tracking-wide group-hover:text-white transition-colors">Cámara</span>
                    </div>
                </button>
            </div>

            <button 
                onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); }}
                className="mt-8 text-xs font-bold text-white/50 hover:text-white px-6 py-2 rounded-full hover:bg-white/10 transition-colors uppercase tracking-widest"
            >
                Cancelar
            </button>
        </div>

        {/* STATE 3: DRAGGING FEEDBACK */}
        <div className={`absolute inset-0 bg-indigo-50/90 backdrop-blur-md flex flex-col items-center justify-center transition-opacity duration-300 ${isDragging ? 'opacity-100 z-50' : 'opacity-0 pointer-events-none'}`}>
             <div className="bg-white p-5 rounded-full shadow-2xl animate-bounce mb-4 text-indigo-600">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
             </div>
             <span className="text-indigo-900 font-bold text-xl">Suelta el archivo aquí</span>
        </div>

        {/* Hidden Input */}
        <input 
            ref={fileInputRef}
            type="file" 
            className="hidden" 
            accept="image/*,application/pdf,.pdf" 
            onChange={handleInputChange} 
            disabled={disabled}
        />
      </div>
    </div>
  );
};

export default FileUploader;