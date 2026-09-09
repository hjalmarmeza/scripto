import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import FileUploader from './components/FileUploader';
import TranscriptionEditor from './components/TranscriptionEditor';
import { AppStatus } from './types';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Camera refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
      stopCamera();
    };
  }, [imageSrc]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      setStatus(AppStatus.CAMERA);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setErrorMessage("No se pudieron acceder a los permisos de cámara.");
      setStatus(AppStatus.ERROR);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && streamRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "captura_camara.jpg", { type: "image/jpeg" });
            stopCamera();
            processFile(file);
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const processFile = useCallback(async (file: File) => {
    try {
      setErrorMessage(null);
      setStatus(AppStatus.PROCESSING);
      
      setFileName(file.name);
      setMimeType(file.type);
      
      const objectUrl = URL.createObjectURL(file);
      setImageSrc(objectUrl);
      
      // Short mock processing delay for UX
      setTimeout(() => {
        setStatus(AppStatus.COMPLETE);
      }, 500);

    } catch (error) {
      console.error(error);
      setErrorMessage("Error inesperado procesando el archivo.");
      setStatus(AppStatus.ERROR);
    }
  }, []);

  const handleReset = () => {
    stopCamera();
    setStatus(AppStatus.IDLE);
    if (imageSrc && imageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(imageSrc);
    }
    setImageSrc(null);
    setFileName("");
    setMimeType("");
    setErrorMessage(null);
  };

  return (
    <div className="flex flex-col h-screen relative overflow-hidden font-sans text-slate-800">
      
      {/* Dynamic Background Blobs */}
      <div className="absolute inset-0 overflow-hidden -z-10 pointer-events-none">
         <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-300/30 mix-blend-multiply filter blur-[80px] opacity-70 animate-blob"></div>
         <div className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-300/30 mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-2000"></div>
         <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] rounded-full bg-blue-300/30 mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-4000"></div>
      </div>

      {status !== AppStatus.COMPLETE && status !== AppStatus.CAMERA && <Header />}

      <main className={`flex-1 flex flex-col relative ${status === AppStatus.COMPLETE ? 'h-full overflow-hidden' : 'overflow-auto'}`}>
        <div className={`mx-auto w-full h-full flex flex-col ${status === AppStatus.COMPLETE ? 'max-w-none' : 'max-w-5xl p-6'}`}>
          
          {status === AppStatus.IDLE && (
            <div className="flex-1 flex flex-col justify-center items-center animate-fade-in">
              
              <div className="text-center mb-12 space-y-4">
                <h2 className="text-5xl font-serif font-bold text-indigo-950 tracking-tight drop-shadow-sm">
                  Digitaliza <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">al Instante</span>
                </h2>
                <p className="text-slate-600 text-lg max-w-lg mx-auto leading-relaxed font-medium">
                  Escanea, edita y firma en segundos.
                </p>
              </div>
              
              <div className="w-full px-4 mb-12">
                <FileUploader 
                  onFileSelect={processFile} 
                  onCameraSelect={startCamera}
                  disabled={false} 
                />
              </div>
            </div>
          )}

          {status === AppStatus.CAMERA && (
            <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col">
                <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden rounded-b-[3rem]">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover opacity-90"
                    />
                    <div className="absolute inset-0 pointer-events-none border-[40px] border-slate-900/60 backdrop-blur-sm flex items-center justify-center">
                        <div className="w-full h-full border-2 border-indigo-400/50 relative rounded-3xl shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-400 rounded-tl-2xl"></div>
                            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-400 rounded-tr-2xl"></div>
                            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-400 rounded-bl-2xl"></div>
                            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-400 rounded-br-2xl"></div>
                        </div>
                    </div>
                </div>
                
                <div className="h-32 bg-slate-900 flex items-center justify-between px-10 shrink-0">
                    <button 
                        onClick={handleReset}
                        className="text-indigo-200 hover:text-white font-medium text-sm px-4 py-2 rounded-full hover:bg-white/10 transition-all"
                    >
                        Cancelar
                    </button>

                    <button 
                        onClick={capturePhoto}
                        className="w-20 h-20 rounded-full border-4 border-indigo-500/30 flex items-center justify-center bg-indigo-600/20 hover:bg-indigo-600/40 transition-all active:scale-95 shadow-[0_0_40px_rgba(99,102,241,0.4)]"
                    >
                        <div className="w-14 h-14 bg-white rounded-full shadow-lg"></div>
                    </button>

                    <div className="w-16"></div>
                </div>
            </div>
          )}

          {status === AppStatus.PROCESSING && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 min-h-[400px]">
               <div className="relative">
                 <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                 <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-10 h-10 bg-indigo-50 rounded-full animate-pulse"></div>
                 </div>
               </div>
               <div className="text-center space-y-2">
                 <span className="text-lg text-indigo-900 font-bold block">Procesando Documento</span>
                 <span className="text-sm text-indigo-500/80 font-medium">Preparando editor...</span>
               </div>
            </div>
          )}

          {status === AppStatus.COMPLETE && (
            <div className="flex flex-col h-full w-full">
              <div className="h-16 bg-white/40 backdrop-blur-xl border-b border-white/50 flex items-center justify-between px-6 shrink-0 z-30 shadow-sm">
                  <div className="flex items-center gap-3">
                     <button onClick={handleReset} className="w-10 h-10 flex items-center justify-center bg-white/50 hover:bg-white rounded-full text-indigo-900 shadow-sm transition-all border border-white/60" title="Volver al inicio">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                        </svg>
                     </button>
                     <div className="flex flex-col">
                        <span className="font-bold text-indigo-950 truncate max-w-[200px] text-sm leading-none" title={fileName}>{fileName}</span>
                        <span className="text-[11px] text-indigo-500 font-medium leading-none mt-1 uppercase tracking-wider">Modo Edición</span>
                     </div>
                  </div>
                  <div></div>
              </div>

              <div className="flex-1 h-0 relative w-full bg-indigo-50/30">
                {imageSrc && (
                  <TranscriptionEditor 
                    originalImage={imageSrc} 
                    mimeType={mimeType}
                    fileName={fileName}
                  />
                )}
              </div>
            </div>
          )}
          
          {status === AppStatus.ERROR && (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6 min-h-[400px]">
                <div className="p-6 bg-red-50/80 backdrop-blur rounded-[2rem] text-red-500 shadow-lg shadow-red-100/50">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-indigo-900 font-bold text-lg">{errorMessage}</p>
                  <button 
                    onClick={handleReset}
                    className="mt-6 px-8 py-3 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50"
                  >
                    Intentar de nuevo
                  </button>
                </div>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;