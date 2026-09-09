import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="h-24 flex items-center px-8 sticky top-0 z-50">
      {/* Glass Panel */}
      <div className="absolute inset-x-4 top-4 bottom-0 bg-white/60 backdrop-blur-md border border-white/50 rounded-2xl shadow-lg shadow-indigo-500/5"></div>
      
      <div className="relative w-full flex items-center gap-4 px-6">
        {/* Logo Container */}
        <div className="flex items-center gap-3 cursor-default select-none group">
            
            {/* Icon: Stylized Pen Nib (Vectorized from image) */}
            <div className="relative w-9 h-9 flex items-center justify-center drop-shadow-sm transition-transform group-hover:scale-105 duration-300">
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    {/* Nib Body (Dark Blue) */}
                    <path d="M16 2.5C16 2.5 7.5 13 7.5 17.5C7.5 20 9.5 22 10 22H22C22.5 22 24.5 20 24.5 17.5C24.5 13 16 2.5 16 2.5Z" fill="#0f172a"/> 
                    {/* Center Split */}
                    <path d="M16 2.5V22" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    {/* Breather Hole */}
                    <circle cx="16" cy="12.5" r="1.5" fill="white"/>
                    {/* Base (Cyan/Light Blue) */}
                    <rect x="11.5" y="24" width="9" height="3.5" rx="1" fill="#06b6d4"/>
                </svg>
            </div>

            {/* Text: Scripto */}
            <div className="flex flex-col justify-center">
                <h1 className="text-2xl font-sans font-bold text-slate-900 tracking-tight leading-none flex items-center">
                    Scripto
                    {/* Optional: Styled dot for 'i' simulation if we wanted strictly custom text, 
                        but the font matches well. We add a cyan dot at the end for branding flair */}
                    <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full ml-0.5 mt-3 animate-pulse"></span>
                </h1>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 ml-0.5">
                    Digitalización
                </p>
            </div>
        </div>
      </div>
    </header>
  );
};

export default Header;