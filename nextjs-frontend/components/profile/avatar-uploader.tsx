'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Upload, RotateCw, RotateCcw, ZoomIn, ZoomOut, X, Check, Image as ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { DoubleBezel } from '@/components/ui/double-bezel';

export interface AvatarUploaderProps {
  currentAvatar: string;
  onAvatarChange: (newAvatarUrl: string) => void;
  disabled?: boolean;
  className?: string;
}

import { PRESET_AVATARS } from '@/types/auth';
export { PRESET_AVATARS };


export function AvatarUploader({
  currentAvatar,
  onAvatarChange,
  disabled = false,
  className,
}: AvatarUploaderProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Cropper Canvas States
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [isDragOverDropzone, setIsDragOverDropzone] = useState(false);

  const isImageUrl = (val: string) => /^(https?:\/\/|\/|data:image\/)/i.test(val?.trim() || '');

  // Reset cropper state
  const resetCropper = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, []);

  // Open modal
  const handleOpenModal = () => {
    if (disabled) return;
    setUploadError(null);
    resetCropper();
    if (isImageUrl(currentAvatar)) {
      setImageSrc(currentAvatar);
    } else {
      setImageSrc(null);
      setImgElement(null);
    }
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetCropper();
    setImageSrc(null);
    setImgElement(null);
    setUploadError(null);
  };

  // Load image element
  useEffect(() => {
    if (!imageSrc) {
      setImgElement(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgElement(img);
      resetCropper();
    };
    img.onerror = () => {
      setUploadError('Failed to load image. Please select a valid picture file.');
    };
    img.src = imageSrc;
  }, [imageSrc, resetCropper]);

  // Render canvas loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const cropRadius = (w / 2) * 0.84;

    ctx.clearRect(0, 0, w, h);

    // Calculate base scale to fully cover crop circle
    const isRotated = rotation === 90 || rotation === 270;
    const imgW = isRotated ? imgElement.height : imgElement.width;
    const imgH = isRotated ? imgElement.width : imgElement.height;
    const minSide = cropRadius * 2;
    const baseScale = Math.max(minSide / imgW, minSide / imgH);

    // 1. Draw transformed image
    ctx.save();
    ctx.translate(cx + offset.x, cy + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    const finalScale = baseScale * zoom;
    ctx.scale(finalScale, finalScale);
    ctx.drawImage(imgElement, -imgElement.width / 2, -imgElement.height / 2);
    ctx.restore();

    // 2. Circular framing mask (dark outer overlay)
    ctx.save();
    ctx.fillStyle = 'rgba(7, 7, 11, 0.76)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, cropRadius, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();

    // 3. Circular border outline
    ctx.save();
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, cropRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Rule-of-thirds grid lines when dragging
    if (isDragging) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Horizontal thirds
      ctx.moveTo(cx - cropRadius, cy - cropRadius / 3);
      ctx.lineTo(cx + cropRadius, cy - cropRadius / 3);
      ctx.moveTo(cx - cropRadius, cy + cropRadius / 3);
      ctx.lineTo(cx + cropRadius, cy + cropRadius / 3);
      // Vertical thirds
      ctx.moveTo(cx - cropRadius / 3, cy - cropRadius);
      ctx.lineTo(cx - cropRadius / 3, cy + cropRadius);
      ctx.moveTo(cx + cropRadius / 3, cy - cropRadius);
      ctx.lineTo(cx + cropRadius / 3, cy + cropRadius);
      ctx.stroke();
    }
    ctx.restore();
  }, [imgElement, zoom, rotation, offset, isDragging]);

  // Handle local file reading
  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Only image files (PNG, JPG, WebP, GIF) are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image size exceeds 10MB limit.');
      return;
    }
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Pointer & Touch Handlers
  const handlePointerDown = (clientX: number, clientY: number) => {
    if (!imgElement) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX - offset.x,
      y: clientY - offset.y,
    };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setOffset({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y,
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (!imgElement) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((prev) => Math.max(1, Math.min(4, Number((prev + delta).toFixed(2)))));
  };

  // Crop & Export to Server
  const handleSaveCrop = async () => {
    if (!imgElement || !canvasRef.current) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const targetSize = 400;
      const offscreen = document.createElement('canvas');
      offscreen.width = targetSize;
      offscreen.height = targetSize;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) throw new Error('Could not access canvas rendering context');

      const canvasW = canvasRef.current.width;
      const cropRadius = (canvasW / 2) * 0.84;
      const scaleToTarget = targetSize / (cropRadius * 2);

      const isRotated = rotation === 90 || rotation === 270;
      const imgW = isRotated ? imgElement.height : imgElement.width;
      const imgH = isRotated ? imgElement.width : imgElement.height;
      const minSide = cropRadius * 2;
      const baseScale = Math.max(minSide / imgW, minSide / imgH);

      offCtx.save();
      offCtx.translate(targetSize / 2, targetSize / 2);
      offCtx.scale(scaleToTarget, scaleToTarget);
      offCtx.translate(offset.x, offset.y);
      offCtx.rotate((rotation * Math.PI) / 180);
      const finalScale = baseScale * zoom;
      offCtx.scale(finalScale, finalScale);
      offCtx.drawImage(imgElement, -imgElement.width / 2, -imgElement.height / 2);
      offCtx.restore();

      const dataUrl = offscreen.toDataURL('image/jpeg', 0.92);

      // Call API upload endpoint
      let finalAvatarUrl = dataUrl;
      try {
        const uploadRes = await api.uploadAvatar(dataUrl);
        if (uploadRes && uploadRes.url) {
          finalAvatarUrl = uploadRes.url;
        }
      } catch (err: unknown) {
        console.warn('[AvatarUploader] Backend storage upload fallback to dataUrl:', err);
        finalAvatarUrl = dataUrl;
      }

      onAvatarChange(finalAvatarUrl);
      handleCloseModal();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to crop and save avatar');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Current Avatar Preview & Trigger Row */}
      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenModal}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenModal();
            }
          }}
          className={cn(
            'group relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-accent/40 bg-core p-1 shadow-card transition-all duration-280 cursor-pointer overflow-hidden',
            'hover:border-accent hover:shadow-accent-glow focus:outline-none focus:ring-2 focus:ring-accent',
            disabled && 'pointer-events-none opacity-60'
          )}
          title="Click to crop or upload portrait image"
        >
          <div className="relative flex h-full w-full items-center justify-center rounded-full bg-shell overflow-hidden">
            {isImageUrl(currentAvatar) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentAvatar}
                alt="Profile Avatar"
                className="h-full w-full object-cover transition-transform duration-280 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="select-none text-4xl">{currentAvatar || '👤'}</span>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
              <span className="text-[10px] font-semibold text-white/90">Change</span>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <button
              type="button"
              onClick={handleOpenModal}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg border border-border-hairline bg-core px-3.5 py-2 text-xs font-semibold text-text-primary shadow-sm hover:border-accent/60 hover:bg-white/5 active:scale-98 transition-all"
            >
              <Upload className="h-3.5 w-3.5 text-accent" />
              <span>Upload &amp; Crop Portrait</span>
            </button>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Click avatar to upload custom photo, or pick a preset persona glyph below.
          </p>
        </div>
      </div>

      {/* Preset Emoji Avatar Pills */}
      <div className="space-y-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          Quick Preset Avatars
        </span>
        <div className="flex flex-wrap gap-2 pt-1">
          {PRESET_AVATARS.map((emoji) => {
            const isSelected = currentAvatar === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onAvatarChange(emoji)}
                disabled={disabled}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border text-xl transition-all duration-200 cursor-pointer',
                  isSelected
                    ? 'border-accent bg-accent/20 scale-105 shadow-accent-glow'
                    : 'border-border-hairline bg-core hover:border-border-subtle hover:bg-white/5 hover:scale-105'
                )}
                title={`Select ${emoji} avatar`}
              >
                <span>{emoji}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Cropper Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 transition-opacity animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg">
            <DoubleBezel coreClassName="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border-hairline pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
                    <Camera className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-text-primary">Adjust Avatar Framing</h3>
                    <p className="text-xs text-text-muted">Drag to position, wheel or slider to zoom</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="icon-btn h-8 w-8 text-text-muted hover:text-text-primary"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Error notice */}
              {uploadError && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {uploadError}
                </div>
              )}

              {/* Dropzone (shown when no image loaded) */}
              {!imageSrc ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverDropzone(true);
                  }}
                  onDragLeave={() => setIsDragOverDropzone(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverDropzone(false);
                    if (e.dataTransfer.files?.[0]) {
                      processFile(e.dataTransfer.files[0]);
                    }
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all',
                    isDragOverDropzone
                      ? 'border-accent bg-accent/10'
                      : 'border-border-subtle bg-shell hover:border-accent/60 hover:bg-white/5'
                  )}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-text-primary">Click or drag image file here</p>
                    <p className="text-xs text-text-muted">Supports PNG, JPG, WebP, or GIF (up to 10MB)</p>
                  </div>
                </div>
              ) : (
                /* Interactive Canvas Stage */
                <div className="space-y-4">
                  <div
                    onWheel={handleWheel}
                    className="relative flex items-center justify-center rounded-2xl border border-border-hairline bg-black/60 p-2 overflow-hidden select-none"
                  >
                    <canvas
                      ref={canvasRef}
                      width={360}
                      height={360}
                      onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
                      onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
                      onMouseUp={handlePointerUp}
                      onMouseLeave={handlePointerUp}
                      onTouchStart={(e) => {
                        if (e.touches[0]) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
                      }}
                      onTouchMove={(e) => {
                        if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
                      }}
                      onTouchEnd={handlePointerUp}
                      className="max-h-[360px] max-w-full cursor-grab active:cursor-grabbing rounded-xl touch-none"
                    />
                    <div className="pointer-events-none absolute bottom-3 rounded-full bg-black/70 px-3 py-1 font-mono text-[10px] text-text-muted backdrop-blur-xs">
                      Drag image to reposition
                    </div>
                  </div>

                  {/* Zoom and Transform Controls */}
                  <div className="space-y-3 rounded-xl border border-border-hairline bg-core/80 p-3">
                    <div className="flex items-center gap-3">
                      <ZoomOut className="h-4 w-4 text-text-muted shrink-0" />
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="0.05"
                        value={zoom}
                        onChange={(e) => setZoom(parseFloat(e.target.value))}
                        className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-accent"
                        aria-label="Zoom slider"
                      />
                      <ZoomIn className="h-4 w-4 text-text-muted shrink-0" />
                      <span className="font-mono text-xs text-text-muted min-w-[42px] text-right">
                        {Math.round(zoom * 100)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-semibold text-accent hover:underline"
                      >
                        Choose different image
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRotation((prev) => (prev + 90) % 360)}
                          className="icon-btn h-8 px-2.5 text-xs gap-1.5"
                          title="Rotate 90 degrees clockwise"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span>Rotate</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetCropper}
                          className="icon-btn h-8 px-2.5 text-xs gap-1.5"
                          title="Reset position & zoom"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reset</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/gif"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    processFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-border-hairline pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isUploading}
                  className="rounded-lg border border-border-hairline px-4 py-2 text-xs font-semibold text-text-secondary hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCrop}
                  disabled={!imgElement || isUploading}
                  className="btn-island py-2 px-4 text-xs disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span>{isUploading ? 'Uploading Portrait...' : 'Save & Crop Avatar'}</span>
                  <span className="btn-island-icon h-5 w-5 text-xs">
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              </div>
            </DoubleBezel>
          </div>
        </div>
      )}
    </div>
  );
}
