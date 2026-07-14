import React, { useState, useEffect, useRef } from "react";
import { useEngineStore } from "../store/engineStore";
import { SpriteData } from "../schema/game";
import { Plus, PaintBucket, Eraser, Download, Brush, Sparkles, Upload } from "lucide-react";
import { AIGenerationModal } from "./AIGenerationModal";

// Art direction handed to the AI so generated sprites remain readable beside
// the neutral engine demo assets.
const SPRITE_ART_DIRECTION = `You are drawing a pixel-art sprite as ASCII art rows plus a palette legend.
Setting: a neutral CRPG engine feature demo. Use practical adventure-game shapes, clear silhouettes, and colors that read well on dark and light maps.
Technique rules:
- Outline every shape in near-black #1A1410 or cool dark #111827.
- Light comes from the upper-left; put shadow colors on the right and underside.
- Use a small disciplined palette (6-12 colors), with a darker shade paired to each main color.
- '.' means transparent. Keep the silhouette readable: distinct head/body/feet for characters.
- Characters should use generic explorer, guide, companion, robot, creature, or object motifs unless the prompt asks otherwise.
- Reference colors: skin #D9A47E (shadow #B5805C), fabric #D8DEE9 (shadow #94A3B8), leather #8B5E3C, steel #9CA3AF, brass #D9A648, utility green #7AA36F, signal cyan #70E8FF, safety red #BF616A, violet #8B5CF6.
Draw row by row with care — every row must be exactly the sprite width in characters.`;

export function SpriteCreator() {
  const { gamePackage, addSprite, updateSprite, selectedSpriteId, setSelectedSpriteId } = useEngineStore();

  const [activeSpriteId, setActiveSpriteId] = useState<string | null>(selectedSpriteId || gamePackage.sprite_library[0]?.id || null);
  const [activeSprite, setActiveSprite] = useState<SpriteData | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [importPreview, setImportPreview] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    setActiveSprite(gamePackage.sprite_library.find(s => s.id === activeSpriteId) || null);
  }, [gamePackage.sprite_library, activeSpriteId]);

  useEffect(() => {
    if (activeSpriteId && activeSpriteId !== selectedSpriteId) {
      setSelectedSpriteId(activeSpriteId);
    }
  }, [activeSpriteId, selectedSpriteId, setSelectedSpriteId]);

  const [currentColor, setCurrentColor] = useState<string>("#88C0D0");
  const [currentTool, setCurrentTool] = useState<"brush" | "eraser" | "fill">("brush");

  const colors = [
    "#BF616A", "#D08770", "#EBCB8B", "#A3BE8C", "#B48EAD",
    "#8FBCBB", "#88C0D0", "#81A1C1", "#5E81AC",
    "#2E3440", "#3B4252", "#434C5E", "#4C566A",
    "#D8DEE9", "#E5E9F0", "#ECEFF4", "transparent"
  ];

  const handleCreateSprite = () => {
    const id = `spr_${Date.now()}`;
    const newSprite: SpriteData = {
      id,
      display_name: "New Sprite",
      width: 16,
      height: 16,
      pixels: Array(16 * 16).fill(""),
    };
    addSprite(newSprite);
    setActiveSpriteId(id);
  };

  const handlePixelClick = (index: number) => {
    if (!activeSprite) return;
    
    const newPixels = [...activeSprite.pixels];
    let didChange = false;

    if (currentTool === "brush") {
      newPixels[index] = currentColor;
      didChange = true;
    } else if (currentTool === "eraser") {
      newPixels[index] = "";
      didChange = true;
    } else if (currentTool === "fill") {
      // Basic flood fill
      const targetColor = newPixels[index];
      if (targetColor === currentColor) return;

      const w = activeSprite.width;
      const h = activeSprite.height;
      const queue = [index];
      const visited = new Set<number>();

      while(queue.length > 0) {
        const curr = queue.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr);

        if (newPixels[curr] === targetColor) {
          newPixels[curr] = currentColor;
          didChange = true;
          
          const x = curr % w;
          const y = Math.floor(curr / w);

          if (x > 0) queue.push(curr - 1);
          if (x < w - 1) queue.push(curr + 1);
          if (y > 0) queue.push(curr - w);
          if (y < h - 1) queue.push(curr + w);
        }
      }
    }

    if (didChange) {
      updateSprite(activeSprite.id, { pixels: newPixels });
    }
  };

  // Drag painting
  const [isPainting, setIsPainting] = useState(false);
  const defaultZoom = activeSprite ? Math.max(2, Math.min(20, Math.floor(320 / activeSprite.width))) : 20;
  const [zoom, setZoom] = useState(defaultZoom);

  useEffect(() => {
    if (activeSprite) {
      setZoom(Math.max(2, Math.min(20, Math.floor(320 / activeSprite.width))));
    }
  }, [activeSpriteId]);

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const preventTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) e.preventDefault();
    };
    el.addEventListener("touchmove", preventTouch, { passive: false });
    return () => el.removeEventListener("touchmove", preventTouch);
  }, [activeSprite?.width, zoom]);

  const handleMouseEnter = (index: number) => {
    if (isPainting && currentTool !== "fill") {
      handlePixelClick(index);
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.match(/image\/(png|webp)/)) {
      alert('Please select a PNG or WEBP image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB.');
      return;
    }

    try {
      const imageUrl = URL.createObjectURL(file);
      setImportPreview(imageUrl);
      setShowImportModal(true);
      
      // Reset the file input
      event.target.value = '';
    } catch (error) {
      console.error('Error loading image:', error);
      alert('Failed to load image. Please try again.');
    }
  };

  const importImageAsSprite = async (img: HTMLImageElement, dataUrl: string): Promise<SpriteData> => {
    // Store the image at its full original resolution
    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;
    
    // Create a 48x48 pixel preview for the editor (maintains editing capability)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    const previewSize = 48;
    canvas.width = previewSize;
    canvas.height = previewSize;
    
    // Scale to fit within preview while preserving aspect ratio
    const scaleX = previewSize / originalWidth;
    const scaleY = previewSize / originalHeight;
    const scale = Math.min(scaleX, scaleY);
    
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const offsetX = (previewSize - scaledWidth) / 2;
    const offsetY = (previewSize - scaledHeight) / 2;
    
    ctx.clearRect(0, 0, previewSize, previewSize);
    ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
    
    // Get pixel data for the preview/editor
    const imageData = ctx.getImageData(0, 0, previewSize, previewSize);
    const pixels: string[] = [];
    
    // Simple palette for preview (can be edited later)
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      
      if (a < 128) {
        pixels.push('');
      } else {
        pixels.push(`#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);
      }
    }

    return {
      id: `spr_${Date.now()}`,
      display_name: `Imported Sprite ${gamePackage.sprite_library.length + 1}`,
      width: originalWidth,
      height: originalHeight,
      pixels, // 48x48 preview for editor
      data_url: dataUrl // Full resolution for game rendering
    };
  };

  const blobToDataUrl = async (blobUrl: string): Promise<string> => {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const confirmImport = async () => {
    if (!importPreview) return;

    try {
      // Convert blob URL to data URL for permanent storage
      const dataUrl = await blobToDataUrl(importPreview);
      
      const img = new Image();
      img.onload = async () => {
        try {
          const spriteData = await importImageAsSprite(img, dataUrl);
          addSprite(spriteData);
          setActiveSpriteId(spriteData.id);
          setShowImportModal(false);
          setImportPreview(null);
          URL.revokeObjectURL(importPreview);
        } catch (error) {
          console.error('Error processing image:', error);
          alert('Failed to process image. Please try again.');
        }
      };
      img.onerror = () => {
        alert('Failed to load image. Please try again.');
        setShowImportModal(false);
        setImportPreview(null);
        URL.revokeObjectURL(importPreview);
      };
      img.src = dataUrl;
    } catch (error) {
      console.error('Error converting image:', error);
      alert('Failed to convert image. Please try again.');
      setShowImportModal(false);
      setImportPreview(null);
      URL.revokeObjectURL(importPreview);
    }
  };

  const cancelImport = () => {
    if (importPreview) {
      URL.revokeObjectURL(importPreview);
    }
    setImportPreview(null);
    setShowImportModal(false);
  };

  if (!activeSprite) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="bg-neutral-800 p-6 rounded-full inline-block mb-2">
          <Brush className="w-8 h-8 text-neutral-400" />
        </div>
        <div>
          <h2 className="text-xl font-medium">No Sprite Selected</h2>
          <p className="text-neutral-400 text-sm mt-1">Create a new sprite to start pixel-pushing.</p>
        </div>
        <button 
          onClick={handleCreateSprite}
          className="bg-neutral-100 hover:bg-white text-neutral-900 font-medium px-6 py-2.5 rounded-lg flex items-center gap-2 mt-4 transition-transform active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Create First Sprite
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950 relative overflow-hidden">
      {/* Editor Header */}
      <div className="h-14 bg-neutral-900/90 backdrop-blur-sm border-b border-neutral-800 flex items-center justify-between px-4 z-10 shrink-0">
        <select
          className="bg-neutral-800 border border-neutral-700 text-sm rounded-md px-2 py-1 max-w-[150px] outline-none text-white"
          value={activeSpriteId || ""}
          onChange={(e) => setActiveSpriteId(e.target.value)}
        >
          {gamePackage.sprite_library.map(s => (
            <option key={s.id} value={s.id}>{s.display_name || s.id}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAIModal(true)} className="p-2 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md transition-colors flex items-center gap-1.5 px-3">
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Generate</span>
          </button>
          <button 
            onClick={() => document.getElementById('sprite-import-input')?.click()}
            className="p-2 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-md transition-colors flex items-center gap-1.5 px-3"
            title="Import sprite image"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">Import</span>
          </button>
          <button 
            onClick={handleCreateSprite}
            className="p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col sm:flex-row min-h-0 relative">
        {/* Editor Canvas Container */}
        <div className="flex-1 relative bg-[#111] overflow-hidden min-h-0 shrink-0 basis-1/2 sm:basis-auto flex flex-col">
          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 flex gap-2 z-20">
            <button 
              onClick={() => setZoom(z => Math.max(8, z - 8))} 
              className="p-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-md shadow-lg"
              title="Zoom Out"
            >
              <span className="font-bold text-lg leading-none">-</span>
            </button>
            <button 
              onClick={() => setZoom(z => Math.min(64, z + 8))} 
              className="p-2 bg-neutral-800 text-neutral-400 hover:text-white rounded-md shadow-lg"
              title="Zoom In"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar flex items-center justify-center p-8">
            {activeSprite.data_url ? (
              <img 
                src={activeSprite.data_url} 
                className="border border-neutral-700 bg-neutral-900 shadow-2xl"
                style={{
                  width: `${activeSprite.width * zoom}px`,
                  height: `${activeSprite.height * zoom}px`,
                  imageRendering: 'pixelated'
                }}
              />
            ) : (
              <div 
                ref={gridRef}
                className="border border-neutral-700 bg-neutral-900 shadow-2xl relative select-none shrink-0 touch-none"
                onMouseDown={() => setIsPainting(true)}
                onMouseUp={() => setIsPainting(false)}
                onMouseLeave={() => setIsPainting(false)}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    setIsPainting(true);
                    const touch = e.touches[0];
                    const el = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (el && el.getAttribute('data-index')) {
                      handlePixelClick(parseInt(el.getAttribute('data-index')!));
                    }
                  } else {
                    setIsPainting(false);
                  }
                }}
                onTouchEnd={() => setIsPainting(false)}
                onTouchMove={(e) => {
                   if (e.touches.length === 1 && isPainting) {
                     if (e.cancelable) e.preventDefault(); // prevent scroll
                     const touch = e.touches[0];
                     const el = document.elementFromPoint(touch.clientX, touch.clientY);
                     if (el && el.getAttribute('data-index')) {
                       handleMouseEnter(parseInt(el.getAttribute('data-index')!));
                     }
                   }
                }}
                style={{
                  touchAction: "none",
                  display: "grid",
                  gridTemplateColumns: `repeat(${activeSprite.width}, 1fr)`,
                  width: `${activeSprite.width * zoom}px`,
                  height: `${activeSprite.height * zoom}px`,
                  backgroundImage: 'repeating-linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%, #1a1a1a), repeating-linear-gradient(45deg, #1a1a1a 25%, transparent 25%, transparent 75%, #1a1a1a 75%, #1a1a1a)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 10px 10px'
                }}
              >
                {activeSprite.pixels.map((color, i) => (
                  <div
                    key={i}
                    data-index={i}
                    onMouseDown={() => handlePixelClick(i)}
                    onMouseEnter={() => handleMouseEnter(i)}
                    className="w-full h-full border-[0.5px] border-white/5 cursor-crosshair"
                    style={{ backgroundColor: color || "transparent" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar/Bottom for Tools */}
        <div className="w-full sm:w-80 shrink-0 border-t sm:border-t-0 sm:border-l border-neutral-800 bg-neutral-900 flex flex-col h-[40vh] sm:h-full z-10 custom-scrollbar overflow-y-auto">
          <div className="p-4 space-y-6 flex-1">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Display Name</label>
                <input 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-md py-1.5 px-3 text-sm text-neutral-200 outline-none focus:border-neutral-500 transition-colors"
                  value={activeSprite.display_name}
                  onChange={(e) => updateSprite(activeSprite.id, { display_name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Tools</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentTool("brush")} 
                  className={`p-2 flex-col gap-1 items-center rounded-lg flex-1 flex justify-center transition-colors ${currentTool === "brush" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <Brush className="w-4 h-4" />
                  <span className="text-xs font-medium">Brush</span>
                </button>
                <button 
                  onClick={() => setCurrentTool("eraser")} 
                  className={`p-2 flex-col gap-1 items-center rounded-lg flex-1 flex justify-center transition-colors ${currentTool === "eraser" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <Eraser className="w-4 h-4" />
                  <span className="text-xs font-medium">Erase</span>
                </button>
                <button 
                  onClick={() => setCurrentTool("fill")} 
                  className={`p-2 flex-col gap-1 items-center rounded-lg flex-1 flex justify-center transition-colors ${currentTool === "fill" ? "bg-neutral-100 text-neutral-900 shadow-sm" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-white"}`}
                >
                  <PaintBucket className="w-4 h-4" />
                  <span className="text-xs font-medium">Fill</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-300">Palette</h3>
              <div className="grid grid-cols-8 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {colors.map(color => (
                  <button
                    key={color}
                    onClick={() => {
                      setCurrentColor(color);
                      if (currentTool === "eraser") setCurrentTool("brush");
                    }}
                    className={`w-full aspect-square rounded-full border-2 transition-transform active:scale-90 ${currentColor === color && currentTool !== "eraser" ? "border-white scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: color === "transparent" ? "#111" : color, backgroundImage: color === "transparent" ? 'repeating-linear-gradient(45deg, #222 25%, transparent 25%, transparent 75%, #222 75%, #222), repeating-linear-gradient(45deg, #222 25%, transparent 25%, transparent 75%, #222 75%, #222)' : 'none', backgroundSize: '8px 8px', backgroundPosition: '0 0, 4px 4px' }}
                  />
                ))}
              </div>
              <button 
                onClick={() => updateSprite(activeSprite.id, { pixels: Array(activeSprite.width * activeSprite.height).fill("") })}
                className="mt-4 w-full flex justify-center items-center gap-2 py-2 text-red-400 bg-red-400/10 hover:bg-red-400/20 rounded-lg text-sm font-medium transition-colors"
                title="Clear all pixels"
              >
                <Eraser className="w-4 h-4" />
                Clear Canvas
              </button>
            </div>
          </div>
        </div>
      </div>
      {showAIModal && (
        <AIGenerationModal
          title="Generate Pixel Art Sprite"
          placeholder="e.g. A 48px demo guide in a utility jacket, or a 16px glowing access token..."
          context={SPRITE_ART_DIRECTION}
          schema={{
            type: "OBJECT",
            properties: {
               id: { type: "STRING", description: "Unique id, snake_case, prefixed spr_" },
               display_name: { type: "STRING" },
               width: { type: "NUMBER", description: "16, 32 or 48. Use 48 for characters, 16 for small props." },
               height: { type: "NUMBER", description: "Same as width." },
               palette: {
                 type: "ARRAY",
                 description: "Legend mapping single characters to colors. '.' is always transparent and must not be included.",
                 items: {
                   type: "OBJECT",
                   properties: {
                     char: { type: "STRING", description: "A single non-dot character, e.g. 'K' or 's'" },
                     color: { type: "STRING", description: "Hex color like #1A1410" }
                   },
                   required: ["char", "color"]
                 }
               },
               rows: {
                 type: "ARRAY",
                 description: "Exactly `height` strings, each exactly `width` characters. Each character is '.' (transparent) or a palette char. Draw the sprite like ASCII art.",
                 items: { type: "STRING" }
               }
            },
            required: ["id", "display_name", "width", "height", "palette", "rows"]
          }}
          onGenerate={(data) => {
            const size = (n: any) => [16, 32, 48].includes(Number(n)) ? Number(n) : 16;
            const w = size(data.width);
            const h = size(data.height);
            const palette: Record<string, string> = {};
            for (const entry of data.palette || []) {
              if (entry?.char && typeof entry.color === "string") {
                palette[entry.char[0]] = entry.color;
              }
            }
            const rows: string[] = Array.isArray(data.rows) ? data.rows : [];
            const pixels: string[] = [];
            for (let y = 0; y < h; y++) {
              const line = typeof rows[y] === "string" ? rows[y] : "";
              for (let x = 0; x < w; x++) {
                const ch = line[x] || ".";
                pixels.push(ch === "." ? "" : (palette[ch] || ""));
              }
            }
            const newSpr: SpriteData = {
              id: typeof data.id === "string" && data.id ? data.id : `spr_${Date.now()}`,
              display_name: data.display_name || "AI Sprite",
              width: w,
              height: h,
              pixels,
            };
            addSprite(newSpr);
            setActiveSpriteId(newSpr.id);
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}
      
      {/* Import Preview Modal */}
      {showImportModal && importPreview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-xl border border-neutral-700 max-w-md w-full p-6">
            <h3 className="text-lg font-medium mb-4">Import Sprite Preview</h3>
            
            <div className="mb-6">
              <p className="text-sm text-neutral-400 mb-3">
                Import at full resolution. The sprite will be stored at its original size and automatically scaled to fit 1 tile on the map.
              </p>
              
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <img 
                    src={importPreview} 
                    alt="Import preview" 
                    className="max-w-full max-h-48 border border-neutral-700 rounded"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-xs px-2 py-1 rounded">
                    Full Res
                  </div>
                </div>
              </div>
              
              <div className="text-xs text-neutral-500 space-y-1">
                <p>• Sprite stored at original resolution</p>
                <p>• Automatically scales to 1 tile on the map</p>
                <p>• Aspect ratio preserved in display</p>
                <p>• Full quality maintained for all sprite sizes</p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={confirmImport}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Import Sprite
              </button>
              <button 
                onClick={cancelImport}
                className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Hidden file input for sprite import */}
      <input
        id="sprite-import-input"
        type="file"
        accept="image/png,image/webp"
        className="hidden"
        onChange={handleFileImport}
      />
    </div>
  );
}
