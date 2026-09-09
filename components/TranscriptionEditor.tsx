import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ToolType, OverlayElement, PageData } from '../types';
import { performOCR } from '../services/deepinfraService';

interface TranscriptionEditorProps {
  originalImage: string;
  mimeType: string;
  fileName: string;
}

// --- CONFIGURATION ---
const MAX_IMAGE_DIMENSION = 1920; // Limits width/height to Full HD (plenty for docs)
const COMPRESSION_QUALITY = 0.75; // JPEG quality (0 to 1)

// Helper to remove white/light background from signature images
const removeWhiteBackground = (imageSrc: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(imageSrc); return; }
      
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Iterate through pixels
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Simple threshold logic: if pixel is very light (paper white), make it transparent
        if (r > 180 && g > 180 && b > 180) {
          data[i + 3] = 0; // Alpha 0
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
};

// Helper to compress/resize images for performance
const optimizeImage = (img: HTMLImageElement | HTMLCanvasElement): string => {
    let width = img.width;
    let height = img.height;

    // Calculate aspect ratio and new dimensions if too large
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = width / height;
        if (width > height) {
            width = MAX_IMAGE_DIMENSION;
            height = width / ratio;
        } else {
            height = MAX_IMAGE_DIMENSION;
            width = height * ratio;
        }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        ctx.fillStyle = '#FFFFFF'; // Ensure white background for transparent PNGs converted to JPEG
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
    }
    
    return canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
};

const TranscriptionEditor: React.FC<TranscriptionEditorProps> = ({ 
    originalImage, 
    mimeType, 
    fileName, 
}) => {
  // --- STATE ---
  // Zoom & Layout
  const [zoom, setZoom] = useState(1.0);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportAction, setExportAction] = useState<'download' | 'share' | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(true); // New state for initial processing

  // Pages
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Tools
  const [activeTool, setActiveTool] = useState<ToolType>('text');
  const [elements, setElements] = useState<OverlayElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // History (Undo/Redo)
  const [history, setHistory] = useState<OverlayElement[][]>([[]]);
  const [historyStep, setHistoryStep] = useState(0);

  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Signature Modal
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [showSigHint, setShowSigHint] = useState(false);
  
  // Signature Refs (Multi-stroke support + Performance)
  const sigPointsRef = useRef<{x: number, y: number}[]>([]); 
  const sigStrokesRef = useRef<{x: number, y: number}[][]>([]); 
  const lastSigPointRef = useRef<{x: number, y: number} | null>(null);
  const sigCurveEndRef = useRef<{x: number, y: number} | null>(null);

  // OCR Modal
  const [ocrResult, setOcrResult] = useState<string | null>(null);

  // Refs
  const elementsRef = useRef(elements);
  elementsRef.current = elements; 
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save key based on filename
  const storageKey = `scripto_autosave_${fileName}`;

  // --- HELPERS ---
  const measureTextWidth = (text: string, fontSize: number, fontWeight: string, fontStyle: string) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = `${fontStyle} ${fontWeight} ${fontSize}px "Tinos", serif`;
      const metrics = context.measureText(text || ' ');
      return Math.ceil(metrics.width);
    }
    return (text.length || 1) * (fontSize * 0.7);
  };

  // --- INITIALIZATION ---

  // 1. Load & Optimize PDF or Image
  useEffect(() => {
    setIsOptimizing(true);
    const processInput = async () => {
        try {
            if (mimeType === 'application/pdf' && originalImage) {
                const pdfjsLib = (window as any).pdfjsLib;
                if (!pdfjsLib) return;
                
                const loadingTask = pdfjsLib.getDocument(originalImage);
                const doc = await loadingTask.promise;
                
                const loadedPages: PageData[] = [];
                let maxW = 0;
                let totalH = 0;

                for (let i = 1; i <= doc.numPages; i++) {
                    const page = await doc.getPage(i);
                    
                    // Calculate scale to fit MAX_IMAGE_DIMENSION
                    const originalViewport = page.getViewport({ scale: 1.0 });
                    let scale = 2.0; // Default high quality
                    
                    if (originalViewport.width * 2 > MAX_IMAGE_DIMENSION) {
                        scale = MAX_IMAGE_DIMENSION / originalViewport.width;
                    }
                    
                    const viewport = page.getViewport({ scale }); 
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    await page.render({ canvasContext: context!, viewport }).promise;
                    
                    // Compress immediately
                    const src = canvas.toDataURL('image/jpeg', COMPRESSION_QUALITY);
                    
                    loadedPages.push({
                        id: `page-${i}-${Date.now()}`,
                        src,
                        width: viewport.width,
                        height: viewport.height
                    });

                    maxW = Math.max(maxW, viewport.width);
                    totalH += viewport.height;
                }

                setPages(loadedPages);
                setImgSize({ w: maxW, h: totalH });
                setIsImageLoaded(true);
            } else {
                // For standard images, load, compress, and set
                const img = new Image();
                img.src = originalImage;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });

                const compressedSrc = optimizeImage(img);
                
                // Get new dimensions from the compressed string/image logic
                // We need to create a temp image to get dimensions of compressed result if it was resized
                const finalImg = new Image();
                finalImg.src = compressedSrc;
                await new Promise(r => finalImg.onload = r);

                setPages([{ 
                    id: 'page-1', 
                    src: compressedSrc, 
                    width: finalImg.width, 
                    height: finalImg.height 
                }]);
                
                setImgSize({ w: finalImg.width, h: finalImg.height });
                setIsImageLoaded(true); 
            }
        } catch (e) {
            console.error("Error processing input:", e);
            alert("Error cargando el documento. Intenta de nuevo.");
        } finally {
            setIsOptimizing(false);
        }
    };

    processInput();
  }, [originalImage, mimeType]);

  // 2. Recover Auto-saved Annotations
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setElements(parsed);
          setHistory([parsed]);
          setHistoryStep(0);
        }
      } catch (e) {
        console.error("Failed to load autosave", e);
      }
    }
  }, [storageKey]);

  // 3. Auto-Fit Zoom
  useEffect(() => {
    if (isImageLoaded && containerRef.current && imgSize.w > 0) {
      const containerW = containerRef.current.clientWidth;
      const targetZoom = (containerW - 80) / imgSize.w; // Increased padding for better fit
      setZoom(Math.min(Math.max(targetZoom, 0.1), 1.0));
    }
  }, [isImageLoaded, imgSize.w]);

  // 4. Page Observer (Scroll Tracking)
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
                const index = Number(entry.target.getAttribute('data-page-index'));
                if (!isNaN(index)) {
                    setCurrentPage(index + 1);
                }
            }
        });
    }, { 
        threshold: [0.1, 0.5], 
        rootMargin: "-10% 0px -10% 0px" 
    });

    // Clear previous observations
    observer.disconnect();

    // Add new observations
    pageRefs.current.forEach(ref => {
        if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [pages, zoom]);

  const scrollToPage = (pageNumber: number) => {
    const index = pageNumber - 1;
    const ref = pageRefs.current[index];
    if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setCurrentPage(pageNumber);
    }
  };

  // --- HISTORY & SAVING ---
  const saveToHistory = useCallback((newElements: OverlayElement[]) => {
    const currentHistoryState = history[historyStep];
    if (JSON.stringify(currentHistoryState) === JSON.stringify(newElements)) return;

    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
    
    // Auto-save to LS
    localStorage.setItem(storageKey, JSON.stringify(newElements));
  }, [history, historyStep, storageKey]);

  const undo = useCallback(() => {
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      setElements(history[newStep]);
      setSelectedId(null);
    }
  }, [history, historyStep]);

  const redo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      setElements(history[newStep]);
      setSelectedId(null);
    }
  }, [history, historyStep]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault();
        redo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === 'INPUT') return;
        removeElement(selectedId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedId]); 

  // --- PAGE MANIPULATION ---
  const movePage = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === pages.length - 1) return;

    const newPages = [...pages];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [newPages[index], newPages[swapIndex]] = [newPages[swapIndex], newPages[index]];
    setPages(newPages);
  };

  const deletePage = (index: number) => {
    if (pages.length <= 1) {
        alert("No puedes eliminar la única página.");
        return;
    }
    if (window.confirm("¿Eliminar esta página permanentemente?")) {
        const newPages = pages.filter((_, i) => i !== index);
        setPages(newPages);
    }
  };

  const rotatePage = async (index: number) => {
     const page = pages[index];
     const img = new Image();
     img.src = page.src;
     await new Promise(r => img.onload = r);
     
     const canvas = document.createElement('canvas');
     canvas.width = img.height;
     canvas.height = img.width;
     
     const ctx = canvas.getContext('2d');
     if(ctx) {
         ctx.translate(canvas.width / 2, canvas.height / 2);
         ctx.rotate(90 * Math.PI / 180);
         ctx.drawImage(img, -img.width / 2, -img.height / 2);
     }
     
     // Re-optimize on rotate (ensures it stays light)
     const newSrc = optimizeImage(canvas);
     
     const newPages = [...pages];
     newPages[index] = {
         ...page,
         src: newSrc,
         width: page.height,
         height: page.width
     };
     setPages(newPages);
  };

  // --- CANVAS INTERACTION ---
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (isDragging || isResizing || !contentRef.current) return;

    const target = e.target as HTMLElement;
    const clickedElement = target.closest('.overlay-element');
    
    if (clickedElement) {
        const elId = clickedElement.getAttribute('data-id');
        if (elId) {
            setSelectedId(elId);
            return;
        }
    }

    // Calculate position relative to contentRef to support drawing across pages
    const contentRect = contentRef.current.getBoundingClientRect();
    const globalX = (e.clientX - contentRect.left) / zoom;
    const globalY = (e.clientY - contentRect.top) / zoom;

    const newId = Date.now().toString();
    let newEl: OverlayElement | null = null;

    if (activeTool === 'whiteout') {
        newEl = {
            id: newId,
            type: 'whiteout',
            x: globalX - 20, 
            y: globalY - 7, 
            width: 40, 
            height: 15, 
            content: '',
            shape: 'rectangle',
            opacity: 1
        };
    } else if (activeTool === 'signature') {
        if (savedSignature) {
            newEl = {
                id: newId,
                type: 'signature',
                x: globalX,
                y: globalY - 25,
                content: savedSignature,
                width: 150,
                height: 75,
                opacity: 1
            };
        } else {
            setIsSignatureModalOpen(true);
            // Reset hint state when opening modal fresh
            setShowSigHint(false);
            return;
        }
    } else if (['text', 'checkbox-x', 'checkbox-check'].includes(activeTool)) {
        let content = '';
        if (activeTool === 'checkbox-x') content = '✕';
        if (activeTool === 'checkbox-check') content = '✓';
        
        newEl = {
            id: newId,
            type: activeTool,
            x: globalX,
            y: globalY - 10, 
            content,
            fontSize: 18,
            fontWeight: 'normal',
            fontStyle: 'normal',
            opacity: 1,
            textAlign: 'left'
        };
    }

    if (newEl) {
        const newElements = [...elements, newEl];
        setElements(newElements);
        saveToHistory(newElements); 
        setSelectedId(newId);
    }
  };

  // --- IMAGE UPLOAD (Overlays) ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                const img = new Image();
                img.onload = () => {
                    // Optimization not strictly necessary for small overlays, but good practice
                    const newId = Date.now().toString();
                    const newEl: OverlayElement = {
                        id: newId,
                        type: 'image',
                        x: 50,
                        y: 50 + (window.scrollY / zoom),
                        content: ev.target!.result as string,
                        width: 150,
                        height: 150 * (img.height / img.width),
                        opacity: 1
                    };
                    const newElements = [...elements, newEl];
                    setElements(newElements);
                    saveToHistory(newElements);
                    setSelectedId(newId);
                    setActiveTool('image');
                };
                img.src = ev.target.result as string;
            }
        };
        reader.readAsDataURL(file);
    }
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- ELEMENT MANIPULATION ---
  const updateElement = (id: string, updates: Partial<OverlayElement>, save: boolean = false) => {
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    setElements(newElements);
    if (save) {
        saveToHistory(newElements);
    }
  };

  const removeElement = (id: string) => {
    const newElements = elements.filter(el => el.id !== id);
    setElements(newElements);
    saveToHistory(newElements); 
    if (selectedId === id) setSelectedId(null);
  };

  // DRAG
  const handleDragStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if ((e.target as HTMLElement).classList.contains('resize-handle')) return;

    const el = elements.find(e => e.id === id);
    if (!el) return;

    setSelectedId(id);

    const startX = e.clientX;
    const startY = e.clientY;
    const originalX = el.x;
    const originalY = el.y;

    const moveHandler = (ev: MouseEvent) => {
      setIsDragging(true);
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      setElements(prev => prev.map(item => item.id === id ? { ...item, x: originalX + dx, y: originalY + dy } : item));
    };

    const upHandler = () => {
      setTimeout(() => setIsDragging(false), 0);
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
      saveToHistory(elementsRef.current);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  // RESIZE
  const handleResizeStart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setSelectedId(id);

    const el = elements.find(e => e.id === id);
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const originalW = el.width || 40;
    const originalH = el.height || 15;

    const moveHandler = (ev: MouseEvent) => {
        const dx = (ev.clientX - startX) / zoom;
        const dy = (ev.clientY - startY) / zoom;
        const aspect = originalW / originalH;
        
        let newW = Math.max(10, originalW + dx);
        let newH = Math.max(10, originalH + dy);

        if (el.type === 'image' || el.type === 'signature') {
             newH = newW / aspect;
        }

        setElements(prev => prev.map(item => item.id === id ? { 
            ...item, 
            width: newW, 
            height: newH
        } : item));
    };

    const upHandler = () => {
        setIsResizing(false);
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
        saveToHistory(elementsRef.current);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  // --- SIGNATURE MODAL LOGIC ---
  const getSigCoords = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
     const rect = canvas.getBoundingClientRect();
     const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
     const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
     return {
         x: clientX - rect.left,
         y: clientY - rect.top
     };
  };

  const startSig = (e: React.MouseEvent | React.TouchEvent) => {
     const canvas = sigCanvasRef.current;
     if(!canvas) return;
     
     // Trigger hint when drawing starts
     if (!showSigHint) setShowSigHint(true);

     setIsDrawingSig(true);
     const coords = getSigCoords(e, canvas);
     
     lastSigPointRef.current = coords;
     sigCurveEndRef.current = coords; 
     sigPointsRef.current = [coords];
     
     const ctx = canvas.getContext('2d');
     if(ctx) {
         // Set styles once at start
         ctx.lineWidth = 3;
         ctx.lineJoin = 'round';
         ctx.lineCap = 'round';
         ctx.strokeStyle = '#000';
         ctx.fillStyle = '#000';
         
         // Draw initial dot
         ctx.beginPath();
         ctx.arc(coords.x, coords.y, 1.5, 0, Math.PI * 2); 
         ctx.fill();
     }
  };

  const drawSig = (e: React.MouseEvent | React.TouchEvent) => {
     if(!isDrawingSig || !lastSigPointRef.current || !sigCurveEndRef.current) return;
     const canvas = sigCanvasRef.current;
     if(!canvas) return;
     const ctx = canvas.getContext('2d');
     if(!ctx) return;

     const current = getSigCoords(e, canvas);
     const last = lastSigPointRef.current;
     const curveEnd = sigCurveEndRef.current;

     sigPointsRef.current.push(current);

     // Midpoint smoothing algorithm
     const mid = {
        x: (last.x + current.x) / 2,
        y: (last.y + current.y) / 2
     };

     ctx.beginPath();
     ctx.moveTo(curveEnd.x, curveEnd.y);
     ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
     ctx.stroke();

     // Update refs
     lastSigPointRef.current = current;
     sigCurveEndRef.current = mid;
  };

  const stopSig = () => {
     setIsDrawingSig(false);
     // Finish the stroke
     if (lastSigPointRef.current && sigCurveEndRef.current && sigCanvasRef.current) {
         const ctx = sigCanvasRef.current.getContext('2d');
         if(ctx) {
             ctx.beginPath();
             ctx.moveTo(sigCurveEndRef.current.x, sigCurveEndRef.current.y);
             ctx.lineTo(lastSigPointRef.current.x, lastSigPointRef.current.y);
             ctx.stroke();
         }
     }
     if (sigPointsRef.current.length > 0) {
        sigStrokesRef.current.push([...sigPointsRef.current]);
     }
     sigPointsRef.current = []; 
     lastSigPointRef.current = null;
     sigCurveEndRef.current = null;
  };

  const saveSignature = () => {
     if(sigCanvasRef.current) {
        const data = sigCanvasRef.current.toDataURL('image/png');
        setSavedSignature(data);
        setIsSignatureModalOpen(false);
        setActiveTool('signature');
        setShowSigHint(false);
     }
  };

  const clearSignature = () => {
     const canvas = sigCanvasRef.current;
     if(canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
     }
     sigStrokesRef.current = [];
     sigPointsRef.current = [];
     setShowSigHint(false);
  };
  
  const handleSigFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = async (ev) => {
              if(ev.target?.result) {
                  const processed = await removeWhiteBackground(ev.target.result as string);
                  
                  const canvas = sigCanvasRef.current;
                  if(canvas) {
                      const ctx = canvas.getContext('2d');
                      const img = new Image();
                      img.onload = () => {
                          sigStrokesRef.current = [];
                          sigPointsRef.current = [];
                          ctx?.clearRect(0,0, canvas.width, canvas.height);
                          const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.8;
                          const w = img.width * scale;
                          const h = img.height * scale;
                          const x = (canvas.width - w) / 2;
                          const y = (canvas.height - h) / 2;
                          ctx?.drawImage(img, x, y, w, h);
                      };
                      img.src = processed;
                  }
                  setShowSigHint(false);
              }
          };
          reader.readAsDataURL(file);
      }
      if(sigFileInputRef.current) sigFileInputRef.current.value = '';
  };

  // --- OCR LOGIC ---
  const handleOCR = async () => {
    if(pages.length === 0) return;
    setIsProcessingOCR(true);
    const text = await performOCR(pages[0].src.split(',')[1], 'image/jpeg');
    setOcrResult(text);
    setIsProcessingOCR(false);
  };

  const copyOCRText = () => {
    if (!ocrResult) return;
    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) {
        navigator.clipboard.writeText(selection);
    } else {
        navigator.clipboard.writeText(ocrResult);
    }
  };

  // --- PDF EXPORT (DOWNLOAD OR SHARE) ---
  const handleExport = async (action: 'download' | 'share') => {
    const jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    if (!jsPDF) {
      alert("La librería PDF no está lista. Por favor recarga la página.");
      return;
    }
    
    setIsExporting(true);
    setExportAction(action);
    setSelectedId(null);

    // Give UI time to render "Exporting" state
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Calculate global metrics for overlay mapping
      const GAP = 96; // Matches gap-24 (6rem)
      const maxW = Math.max(...pages.map(p => p.width));
      
      const pageBoundaries: { start: number, end: number, w: number, h: number, offsetX: number }[] = [];
      let runningY = 0;
      
      for(const p of pages) {
          // Calculate centered offset for this page (because UI centers pages smaller than maxW)
          const offsetX = (maxW - p.width) / 2;
          
          pageBoundaries.push({
              start: runningY,
              end: runningY + p.height,
              w: p.width,
              h: p.height,
              offsetX
          });
          runningY += p.height + GAP;
      }

      // Convert pixels to points for jsPDF (1px = 0.75pt) to avoid px_scaling bugs
      const pxToPt = 0.75;

      // Initialize PDF with the dimensions of the FIRST page
      const firstPage = pages[0];
      const pdf = new jsPDF({
          orientation: firstPage.width > firstPage.height ? 'l' : 'p',
          unit: 'pt',
          format: [firstPage.width * pxToPt, firstPage.height * pxToPt]
      });

      // Process Pages
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const bounds = pageBoundaries[i];

        // Add new page for subsequent iterations (i > 0)
        if (i > 0) {
            pdf.addPage(
                [page.width * pxToPt, page.height * pxToPt],
                page.width > page.height ? 'l' : 'p'
            );
        }

        // Create canvas matching exact page dimensions
        const canvas = document.createElement('canvas');
        canvas.width = page.width;
        canvas.height = page.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        // 1. Fill White Background (handling transparency)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Draw Page Image 1:1
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = page.src;
        await new Promise((resolve) => {
            if (img.complete) resolve(true);
            img.onload = () => resolve(true);
            img.onerror = () => resolve(true);
        });

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // 3. Draw Overlays
        const pageElements = elements.filter(el => {
            const elMidY = el.y + ((el.height || 20) / 2);
            return elMidY >= bounds.start && elMidY < bounds.end;
        });

        for (const el of pageElements) {
            const localX = el.x - bounds.offsetX;
            const localY = el.y - bounds.start;

            // Safety clipping
            if (localX < -100 || localX > page.width + 100 || localY < -100 || localY > page.height + 100) continue;

            if (el.type === 'text' || el.type.startsWith('checkbox')) {
                ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || 'normal'} ${el.fontSize}px "Tinos", serif`;
                ctx.fillStyle = "black";
                ctx.textBaseline = "top";
                ctx.fillText(el.content, localX, localY);
            } 
            else if (el.type === 'whiteout') {
                ctx.fillStyle = `rgba(255,255,255,${el.opacity || 1})`;
                if (el.shape === 'circle') {
                    ctx.beginPath();
                    ctx.ellipse(localX + el.width!/2, localY + el.height!/2, el.width!/2, el.height!/2, 0, 0, 2 * Math.PI);
                    ctx.fill();
                } else {
                    ctx.fillRect(localX, localY, el.width || 0, el.height || 0);
                }
            }
            else if (el.type === 'image' || el.type === 'signature') {
                const overlayImg = new Image();
                overlayImg.crossOrigin = "anonymous";
                overlayImg.src = el.content;
                await new Promise((resolve) => {
                    if (overlayImg.complete) resolve(true);
                    overlayImg.onload = () => resolve(true);
                    overlayImg.onerror = () => resolve(true);
                });
                ctx.drawImage(overlayImg, localX, localY, el.width || 0, el.height || 0);
            }
        }

        // 4. Add to PDF
        const pageData = canvas.toDataURL('image/jpeg', 0.95); // High quality
        pdf.addImage(pageData, 'JPEG', 0, 0, page.width * pxToPt, page.height * pxToPt);
      }

      // 5. Final Output Action
      const outputName = `Scripto_${fileName.replace(/\.[^/.]+$/, "")}_Editado.pdf`;

      if (action === 'download') {
          pdf.save(outputName);
      } else if (action === 'share') {
          const blob = pdf.output('blob');
          const file = new File([blob], outputName, { type: 'application/pdf' });
          
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                  files: [file],
                  title: outputName,
                  text: 'Aquí tienes el documento editado con Scripto.'
              });
          } else {
              // Fallback if sharing isn't supported
              pdf.save(outputName);
              alert("Tu dispositivo no soporta compartir archivos directamente. Se ha descargado el archivo.");
          }
      }

    } catch (err) {
      console.error("PDF Export Error:", err);
      alert("Ocurrió un error al exportar el PDF.");
    } finally {
      setIsExporting(false);
      setExportAction(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full relative group/app overflow-hidden bg-slate-800">
      
      {/* HIDDEN INPUT FOR IMAGES */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept="image/png,image/jpeg" 
        className="hidden" 
        onChange={handleImageUpload}
      />

      {/* OCR RESULT MODAL */}
      {ocrResult && (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[80vh]">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-lg">Texto Detectado (OCR)</h3>
                    <button onClick={() => setOcrResult(null)} className="text-slate-500 hover:text-slate-800">✕</button>
                </div>
                <div className="p-4 overflow-y-auto bg-slate-50 font-mono text-sm whitespace-pre-wrap select-text">
                    {ocrResult}
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                    <button 
                        onClick={copyOCRText} 
                        className="text-indigo-600 font-bold text-sm hover:bg-indigo-50 px-4 py-2 rounded"
                    >
                        Copiar Selección
                    </button>
                    <button onClick={() => setOcrResult(null)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Cerrar</button>
                </div>
            </div>
        </div>
      )}

      {/* SIGNATURE MODAL */}
      {isSignatureModalOpen && (
        <div className="fixed inset-0 z-[200] bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 text-center bg-slate-50/50">
                    <h3 className="font-serif font-bold text-xl text-slate-800">Tu Firma</h3>
                    <p className="text-xs text-slate-500 mt-1">Dibuja o sube una imagen (el fondo se borrará automáticamente)</p>
                </div>
                
                <div className="p-6 flex flex-col items-center justify-center bg-white relative">
                    <div className="relative">
                        <canvas 
                            ref={sigCanvasRef}
                            width={340}
                            height={180}
                            style={{ touchAction: 'none' }}
                            className="border-2 border-dashed border-indigo-100 rounded-xl cursor-crosshair bg-slate-50 shadow-inner block"
                            onMouseDown={startSig}
                            onMouseMove={drawSig}
                            onMouseUp={stopSig}
                            onMouseLeave={stopSig}
                            onTouchStart={startSig}
                            onTouchMove={drawSig}
                            onTouchEnd={stopSig}
                        />
                        <div className="absolute bottom-3 right-3">
                           <input 
                              ref={sigFileInputRef}
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={handleSigFileUpload}
                           />
                           <button 
                              onClick={() => sigFileInputRef.current?.click()}
                              className="bg-white/90 backdrop-blur border border-indigo-100 shadow-md rounded-full p-2 text-indigo-600 hover:text-indigo-800 hover:scale-110 transition-all"
                              title="Subir imagen de firma"
                           >
                              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                           </button>
                        </div>
                    </div>

                    {showSigHint && (
                       <div className="w-full mt-4 p-2 bg-amber-50 text-amber-700 rounded-lg text-xs text-center border border-amber-100 animate-fade-in flex items-center justify-center gap-2">
                          <span>💡 Si el trazo no es preciso, te sugerimos cargar una imagen de tu firma.</span>
                       </div>
                    )}
                </div>

                <div className="p-6 pt-0 flex gap-3">
                    <button 
                        onClick={clearSignature}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                        Borrar
                    </button>
                    <button 
                        onClick={() => setIsSignatureModalOpen(false)}
                        className="flex-1 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={saveSignature}
                        className="flex-1 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {(isExporting || isProcessingOCR || isOptimizing) && (
        <div className="absolute inset-0 z-[60] bg-indigo-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
             <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
             <p className="font-bold text-lg animate-pulse">
                {isExporting 
                    ? (exportAction === 'share' ? 'Preparando para compartir...' : 'Generando PDF...') 
                    : isProcessingOCR ? 'Analizando texto con IA...' : 'Optimizando documento...'}
             </p>
             <p className="text-xs text-indigo-200 mt-2 font-mono">
                {isOptimizing ? 'Comprimiendo imágenes para mejorar rendimiento' : ''}
             </p>
        </div>
      )}

      {/* --- TOOLBAR --- */}
      <div className="
          flex items-center justify-start gap-4
          fixed bottom-0 left-0 right-0 z-[100]
          w-full bg-white/95 backdrop-blur-xl border-t border-indigo-100
          px-4 py-3 pb-8 md:p-2 md:pb-2
          overflow-x-auto
          
          md:absolute md:top-6 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:right-auto
          md:w-max md:max-w-[95vw] md:h-auto
          md:bg-white/80 md:backdrop-blur-xl
          md:justify-center md:gap-3
          md:rounded-2xl md:border md:border-white/50 md:shadow-2xl
          
          transition-all duration-300
          shrink-0
      ">
          
          {/* Page Navigation (Redesigned for Visibility & Direct Access) */}
          {pages.length > 0 && (
            <div className="flex items-center gap-4 pr-4 border-r border-indigo-200 mr-2 shrink-0">
               <div className="flex items-center gap-2">
                   <div className="flex flex-col">
                       <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">PÁGINA</span>
                       <div className="flex items-baseline gap-1">
                           <span className="text-xl font-black text-indigo-900 leading-none">{currentPage}</span>
                           <span className="text-xs font-bold text-indigo-400 leading-none">/ {pages.length}</span>
                       </div>
                   </div>
                   
                   {/* Direct Select Dropdown */}
                    <div className="relative group">
                        <select 
                            value={currentPage} 
                            onChange={(e) => scrollToPage(Number(e.target.value))}
                            className="appearance-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs py-1.5 pl-3 pr-6 rounded-lg transition-colors cursor-pointer focus:ring-2 focus:ring-indigo-200 outline-none border border-transparent hover:border-indigo-200"
                            title="Ir a página específica"
                        >
                            {pages.map((_, i) => (
                                <option key={i} value={i + 1}>Ir a Pág. {i + 1}</option>
                            ))}
                        </select>
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500">
                            <svg width="8" height="8" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
                        </div>
                    </div>
               </div>
            </div>
          )}

          {/* History */}
          <div className="flex gap-1 pr-2 border-r border-indigo-100 shrink-0">
            <button onClick={undo} disabled={historyStep === 0} title="Deshacer" className={`p-2 rounded-lg transition-all ${historyStep === 0 ? 'text-slate-300' : 'text-slate-600 hover:bg-indigo-50'}`}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
            </button>
            <button onClick={redo} disabled={historyStep === history.length - 1} title="Rehacer" className={`p-2 rounded-lg transition-all ${historyStep === history.length - 1 ? 'text-slate-300' : 'text-slate-600 hover:bg-indigo-50'}`}>
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></svg>
            </button>
          </div>

          {/* Main Tools */}
          <button onClick={() => setActiveTool('text')} title="Texto" className={`p-2 px-3 rounded-lg transition-all flex flex-col items-center gap-0.5 shrink-0 ${activeTool === 'text' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
            <span className="font-serif font-bold text-xl leading-none">T</span>
            <span className="text-[10px] font-bold uppercase">Texto</span>
          </button>
          
          <button onClick={() => setActiveTool('whiteout')} title="Corrector" className={`p-2 px-3 rounded-lg transition-all flex flex-col items-center gap-0.5 shrink-0 ${activeTool === 'whiteout' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
             <div className="w-5 h-5 border-2 border-current bg-current rounded-[4px] opacity-50"></div>
             <span className="text-[10px] font-bold uppercase">Borrar</span>
          </button>

          <button onClick={() => {
              if(savedSignature) setActiveTool('signature');
              else setIsSignatureModalOpen(true);
          }} title="Firma" className={`p-2 px-3 rounded-lg transition-all flex flex-col items-center gap-0.5 shrink-0 ${activeTool === 'signature' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
             <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
             <span className="text-[10px] font-bold uppercase">Firma</span>
          </button>

          <div className="flex gap-1 shrink-0">
             <button onClick={() => setActiveTool('checkbox-x')} title="X" className={`p-2 w-10 rounded-lg transition-all flex items-center justify-center ${activeTool === 'checkbox-x' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                <span className="font-sans font-bold text-lg leading-none">✕</span>
             </button>
             <button onClick={() => setActiveTool('checkbox-check')} title="Check" className={`p-2 w-10 rounded-lg transition-all flex items-center justify-center ${activeTool === 'checkbox-check' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
                <span className="font-sans font-bold text-lg leading-none">✓</span>
             </button>
          </div>

          <div className="w-px h-8 bg-indigo-100 mx-1 shrink-0"></div>

          <button onClick={() => fileInputRef.current?.click()} title="Insertar Imagen" className={`p-2 rounded-lg transition-all text-slate-600 hover:bg-slate-100 hover:text-indigo-600 shrink-0`}>
             <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
          </button>
          
          <button onClick={handleOCR} title="Extraer Texto (IA)" className="p-2 rounded-lg transition-all text-slate-600 hover:bg-slate-100 hover:text-indigo-600 shrink-0">
             <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
          </button>

          {/* EXPORT GROUP */}
          <div className="ml-2 flex items-center bg-indigo-50 rounded-xl p-0.5 border border-indigo-100 shadow-sm shrink-0">
              <button 
                  onClick={() => handleExport('share')} 
                  disabled={isExporting}
                  className="p-2.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Compartir PDF"
              >
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" /></svg>
              </button>
              <div className="w-px h-6 bg-indigo-200 mx-0.5"></div>
              <button 
                  onClick={() => handleExport('download')} 
                  disabled={isExporting} 
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-md shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                 <span>Guardar</span>
              </button>
          </div>
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-24 md:bottom-8 right-4 md:right-8 z-40 flex flex-col gap-3">
           <button onClick={() => setZoom(z => Math.min(z + 0.1, 2.5))} className="p-3 bg-white/70 backdrop-blur shadow-lg rounded-full hover:bg-white text-indigo-600 border border-white/50 transition-all hover:scale-105">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
           </button>
           <div className="bg-white/50 backdrop-blur px-2 py-1 rounded-lg text-xs font-bold text-white text-center shadow-sm border border-white/30 select-none">
             {Math.round(zoom * 100)}%
           </div>
           <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.1))} className="p-3 bg-white/70 backdrop-blur shadow-lg rounded-full hover:bg-white text-indigo-600 border border-white/50 transition-all hover:scale-105">
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" /></svg>
           </button>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative overflow-auto md:pt-32 pb-32 md:pb-10 scroll-smooth bg-slate-800/50" ref={containerRef}>
         <div className="min-w-full min-h-full flex items-start justify-center p-4 md:p-12 cursor-default">
            
            <div 
                style={{ 
                    width: imgSize.w ? imgSize.w * zoom : '100%', 
                    height: 'auto',
                    position: 'relative',
                    transition: 'width 0.1s ease-out'
                }}
            >
                <div 
                    ref={contentRef}
                    className={`absolute top-0 left-0 origin-top-left transition-transform duration-100 ease-out select-none flex flex-col items-center gap-24 pb-24`} // Massive gap for clear separation
                    style={{ 
                        transform: `scale(${zoom})`,
                        width: imgSize.w || 'auto',
                        height: 'auto' 
                    }}
                    onClick={handleCanvasClick}
                >
                    {pages.length > 0 ? (
                        pages.map((page, index) => (
                            <div key={page.id} className="flex flex-col gap-4 no-print-break" style={{ width: page.width }}>
                                {/* PAGE HEADER - Floating above the page */}
                                <div className="no-print flex items-center justify-between bg-white/95 backdrop-blur px-4 py-2.5 rounded-xl border border-indigo-50 shadow-lg shadow-black/5 transform translate-y-2">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded text-xs">
                                            #{index + 1}
                                        </div>
                                        <span className="font-bold text-slate-700 text-sm">Página {index + 1}</span>
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => {e.stopPropagation(); rotatePage(index)}} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Rotar">
                                            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </button>
                                        
                                        <div className="h-4 w-px bg-slate-200 mx-1"></div>

                                        {index > 0 && (
                                            <button onClick={(e) => {e.stopPropagation(); movePage(index, 'up')}} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Subir">
                                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                                            </button>
                                        )}
                                        {index < pages.length - 1 && (
                                            <button onClick={(e) => {e.stopPropagation(); movePage(index, 'down')}} className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Bajar">
                                                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                            </button>
                                        )}

                                        {pages.length > 1 && (
                                            <button 
                                                onClick={(e) => {e.stopPropagation(); deletePage(index)}} 
                                                className="flex items-center gap-1.5 ml-2 px-3 py-1.5 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 hover:scale-105 transition-all border border-red-400/50"
                                                title="Eliminar hoja"
                                            >
                                                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                <span className="font-bold text-xs tracking-wide uppercase">Eliminar</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ACTUAL PAGE - Deep shadow for "Paper on Desk" effect */}
                                <div 
                                    ref={el => { pageRefs.current[index] = el; }}
                                    data-page-index={index}
                                    className="relative group/page pdf-page bg-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10"
                                    style={{
                                        width: page.width,
                                        height: page.height,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <img 
                                        src={page.src} 
                                        className="block pointer-events-none select-none w-full h-full" 
                                        alt={`Page ${index + 1}`}
                                        draggable={false}
                                    />
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-center w-[210mm] h-[297mm] text-zinc-300"></div>
                    )}

                    {/* --- ELEMENTS OVERLAY --- */}
                    {elements.map(el => (
                        <div
                            key={el.id}
                            data-id={el.id}
                            data-type={el.type}
                            onMouseDown={(e) => handleDragStart(e, el.id)}
                            className={`absolute flex items-center overlay-element group ${(el.type === 'whiteout' && activeTool !== 'whiteout') ? 'cursor-text' : 'cursor-move'}`}
                            style={{ 
                                left: el.x, 
                                top: el.y,
                                width: ['whiteout', 'image', 'signature'].includes(el.type) ? el.width : 'auto',
                                height: ['whiteout', 'image', 'signature'].includes(el.type) ? el.height : 'auto',
                                backgroundColor: el.type === 'whiteout' ? `rgba(255,255,255,${el.opacity || 1})` : 'transparent',
                                justifyContent: el.type === 'whiteout' ? 'center' : 'center',
                                borderRadius: (el.type === 'whiteout' && el.shape === 'circle') ? '50%' : '0px',
                                zIndex: el.type === 'whiteout' ? 10 : 20,
                                opacity: el.type === 'whiteout' ? 1 : (el.opacity || 1)
                            }}
                        >
                            {/* HANDLES FOR SELECTED ELEMENT */}
                            {selectedId === el.id && (
                                <>
                                    {/* Resize Handle for Image/Sig/Whiteout */}
                                    {['whiteout', 'image', 'signature'].includes(el.type) && (
                                        <div 
                                            className="absolute bottom-0 right-0 w-4 h-4 bg-indigo-500 cursor-nwse-resize rounded-full shadow-sm resize-handle z-50 hover:scale-125 transition-transform no-print"
                                            onMouseDown={(e) => handleResizeStart(e, el.id)}
                                        ></div>
                                    )}

                                    {/* Floating Toolbar */}
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1 bg-white shadow-xl rounded-lg border border-zinc-100 px-1.5 py-1 z-50 no-print items-center whitespace-nowrap">
                                        
                                        <button onMouseDown={(e) => {e.stopPropagation(); removeElement(el.id)}} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors">
                                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg>
                                        </button>
                                        
                                        <div className="w-px h-3 bg-zinc-200 mx-1"></div>

                                        {/* Style Tools for Text */}
                                        {el.type === 'text' && (
                                            <>
                                                <button onMouseDown={(e) => {e.stopPropagation(); updateElement(el.id, { fontSize: (el.fontSize||16) - 2 }, true)}} className="text-zinc-600 text-xs px-1.5 hover:bg-zinc-50 font-bold rounded py-0.5">A-</button>
                                                <button onMouseDown={(e) => {e.stopPropagation(); updateElement(el.id, { fontSize: (el.fontSize||16) + 2 }, true)}} className="text-zinc-600 text-xs px-1.5 hover:bg-zinc-50 font-bold rounded py-0.5">A+</button>
                                                <div className="w-px h-3 bg-zinc-200 mx-1"></div>
                                                <button onMouseDown={(e) => {e.stopPropagation(); updateElement(el.id, { fontWeight: el.fontWeight === 'bold' ? 'normal' : 'bold' }, true)}} className={`text-zinc-600 text-xs px-1.5 hover:bg-zinc-50 font-serif font-bold rounded py-0.5 ${el.fontWeight === 'bold' ? 'bg-zinc-100' : ''}`}>B</button>
                                                <button onMouseDown={(e) => {e.stopPropagation(); updateElement(el.id, { fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' }, true)}} className={`text-zinc-600 text-xs px-1.5 hover:bg-zinc-50 font-serif italic rounded py-0.5 ${el.fontStyle === 'italic' ? 'bg-zinc-100' : ''}`}>I</button>
                                                <div className="w-px h-3 bg-zinc-200 mx-1"></div>
                                            </>
                                        )}

                                        {/* Opacity Toggle for all */}
                                        <button onMouseDown={(e) => {e.stopPropagation(); updateElement(el.id, { opacity: (el.opacity || 1) === 1 ? 0.7 : 1 }, true)}} className="text-zinc-600 text-xs px-1.5 hover:bg-zinc-50 rounded py-0.5 flex items-center gap-1" title="Transparencia">
                                            <div className={`w-3 h-3 rounded-full border border-zinc-400 ${(el.opacity||1) < 1 ? 'bg-zinc-200' : 'bg-zinc-800'}`}></div>
                                        </button>
                                        
                                        {/* Shape Toggle for Whiteout */}
                                        {el.type === 'whiteout' && (
                                            <button 
                                                onMouseDown={(e) => {
                                                    e.stopPropagation(); 
                                                    updateElement(el.id, { shape: el.shape === 'circle' ? 'rectangle' : 'circle' }, true)
                                                }} 
                                                className="text-zinc-600 hover:bg-zinc-50 p-1 rounded transition-colors"
                                            >
                                                {el.shape === 'circle' ? '⬜' : '⚪'}
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* CONTENT RENDER */}
                            {el.type === 'text' ? (
                                <input
                                    type="text"
                                    value={el.content}
                                    autoFocus={el.content === ''}
                                    onChange={(e) => updateElement(el.id, { content: e.target.value })}
                                    onBlur={() => saveToHistory(elements)}
                                    onKeyDown={(e) => { if(e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    className={`bg-transparent border-0 focus:ring-0 p-0 m-0 font-serif text-zinc-900 leading-none outline-none h-auto ${selectedId === el.id ? 'bg-indigo-50/30 ring-1 ring-indigo-300 rounded' : ''}`}
                                    style={{ 
                                        fontSize: `${el.fontSize}px`,
                                        fontWeight: el.fontWeight,
                                        fontStyle: el.fontStyle,
                                        width: `${Math.ceil(measureTextWidth(el.content, el.fontSize || 18, el.fontWeight||'normal', el.fontStyle||'normal') * 1.2) + 60}px`, 
                                        minWidth: '10px'
                                    }}
                                    placeholder="Escribir"
                                />
                            ) : (el.type === 'image' || el.type === 'signature') ? (
                                <div className={`w-full h-full ${selectedId === el.id ? 'ring-1 ring-indigo-400' : ''}`}>
                                    <img 
                                        src={el.content} 
                                        alt="Inserted" 
                                        className="w-full h-full object-contain pointer-events-none" 
                                        draggable={false}
                                    />
                                </div>
                            ) : (el.type.startsWith('checkbox')) ? (
                                <div className={`text-2xl font-bold leading-none ${selectedId === el.id ? 'text-indigo-600' : 'text-zinc-900'}`}>
                                    {el.content}
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default TranscriptionEditor;