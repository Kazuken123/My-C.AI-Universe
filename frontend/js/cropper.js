import { api } from './api.js';
import { showToast } from './common.js';

/**
 * Interactive Image Cropper Modal
 * Enables pan, zoom, rotation, and custom framing for profile and character avatars.
 */
class ImageCropper {
  constructor() {
    this.overlay = null;
    this.canvas = null;
    this.ctx = null;
    this.slider = null;
    this.fileInput = null;
    this.dropzone = null;
    this.viewportWrap = null;
    this.applyBtn = null;

    this.img = null;
    this.imgLoaded = false;
    this.baseScale = 1;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0; // in degrees: 0, 90, 180, 270

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.cropShape = 'circle'; // 'circle' or 'rect'

    this.onCropCallback = null;
    this.targetSize = 400;
    this.uploader = (dataUrl) => api.uploadAvatar(dataUrl);
    this.rafId = null;

    this.#buildModal();
  }

  #scheduleRender() {
    if (this.rafId !== null) return;
    this.rafId = window.requestAnimationFrame(() => {
      this.rafId = null;
      this.#render();
    });
  }

  #buildModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'cropper-modal-overlay';
    this.overlay.id = 'cropperModalOverlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');

    this.overlay.innerHTML = `
      <div class="cropper-shell">
        <div class="cropper-core">
          <header class="cropper-header">
            <div class="cropper-title-wrap">
              <span class="cropper-title" id="cropperModalTitle">Adjust Profile Image</span>
              <span class="cropper-subtitle">Drag to frame &bull; Wheel or slider to zoom</span>
            </div>
            <button class="cropper-close-btn" id="cropperCloseBtn" type="button" aria-label="Close Cropper">
              <i class="ph-light ph-x"></i>
            </button>
          </header>

          <div class="cropper-dropzone" id="cropperDropzone">
            <i class="ph-light ph-cloud-arrow-up cropper-dropzone-icon"></i>
            <div class="cropper-dropzone-title">Upload Profile Photo</div>
            <div class="cropper-dropzone-sub">Drop an image here or click to browse from device</div>
          </div>

          <div class="cropper-viewport-wrap" id="cropperViewportWrap" style="display: none;">
            <canvas class="cropper-canvas" id="cropperCanvas" width="380" height="380"></canvas>
            <div class="cropper-stage-hint">Drag image to position</div>
          </div>

          <div class="cropper-controls" id="cropperControls" style="display: none;">
            <div class="cropper-zoom-row">
              <span class="cropper-zoom-icon"><i class="ph-light ph-magnifying-glass-minus"></i></span>
              <input type="range" class="cropper-slider" id="cropperZoomSlider" min="100" max="400" value="100" />
              <span class="cropper-zoom-icon"><i class="ph-light ph-magnifying-glass-plus"></i></span>
            </div>

            <div class="cropper-tools-row">
              <label class="cropper-file-label" for="cropperFileInput">
                <i class="ph-light ph-image"></i>
                <span>Choose Image</span>
              </label>
              <input type="file" id="cropperFileInput" class="cropper-file-input" accept="image/png, image/jpeg, image/jpg, image/webp, image/gif" />

              <div style="display: flex; gap: 6px;">
                <button type="button" class="cropper-tool-btn" id="cropperRotateBtn" title="Rotate 90 Degrees Clockwise">
                  <i class="ph-light ph-arrow-clockwise"></i>
                  <span>Rotate</span>
                </button>
                <button type="button" class="cropper-tool-btn" id="cropperResetBtn" title="Reset Frame">
                  <i class="ph-light ph-arrow-counter-clockwise"></i>
                  <span>Reset</span>
                </button>
              </div>
            </div>
          </div>

          <footer class="cropper-footer">
            <button type="button" class="cropper-btn-cancel" id="cropperCancelBtn">Cancel</button>
            <button type="button" class="cropper-btn-apply" id="cropperApplyBtn" disabled>
              <i class="ph-light ph-check"></i>
              <span>Save &amp; Crop</span>
            </button>
          </footer>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.canvas = this.overlay.querySelector('#cropperCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.slider = this.overlay.querySelector('#cropperZoomSlider');
    this.fileInput = this.overlay.querySelector('#cropperFileInput');
    this.dropzone = this.overlay.querySelector('#cropperDropzone');
    this.viewportWrap = this.overlay.querySelector('#cropperViewportWrap');
    this.controlsWrap = this.overlay.querySelector('#cropperControls');
    this.applyBtn = this.overlay.querySelector('#cropperApplyBtn');
    this.titleEl = this.overlay.querySelector('#cropperModalTitle');

    this.#bindEvents();
  }

  #bindEvents() {
    const closeBtn = this.overlay.querySelector('#cropperCloseBtn');
    const cancelBtn = this.overlay.querySelector('#cropperCancelBtn');
    const rotateBtn = this.overlay.querySelector('#cropperRotateBtn');
    const resetBtn = this.overlay.querySelector('#cropperResetBtn');

    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.close();
      }
    });

    // Dropzone triggers file picker
    this.dropzone.addEventListener('click', () => this.fileInput.click());

    // Drag and drop onto dropzone
    this.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzone.classList.add('dragover');
    });

    this.dropzone.addEventListener('dragleave', () => {
      this.dropzone.classList.remove('dragover');
    });

    this.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.[0]) {
        this.#loadFile(e.dataTransfer.files[0]);
      }
    });

    // File input change
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files?.[0]) {
        this.#loadFile(e.target.files[0]);
      }
    });

    // Zoom slider
    this.slider.addEventListener('input', () => {
      this.zoom = parseFloat(this.slider.value) / 100;
      this.#scheduleRender();
    });

    // Rotate
    rotateBtn.addEventListener('click', () => {
      this.rotation = (this.rotation + 90) % 360;
      this.#resetPosition();
      this.#scheduleRender();
    });

    // Reset
    resetBtn.addEventListener('click', () => {
      this.#resetAll();
    });

    // Canvas Mouse Interactions
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.imgLoaded) return;
      this.isDragging = true;
      this.dragStartX = e.clientX - this.offsetX;
      this.dragStartY = e.clientY - this.offsetY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.offsetX = e.clientX - this.dragStartX;
      this.offsetY = e.clientY - this.dragStartY;
      this.#scheduleRender();
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.#scheduleRender();
      }
    });

    // Canvas Touch Interactions
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.imgLoaded || e.touches.length === 0) return;
      this.isDragging = true;
      const t = e.touches[0];
      this.dragStartX = t.clientX - this.offsetX;
      this.dragStartY = t.clientY - this.offsetY;
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length === 0) return;
      const t = e.touches[0];
      this.offsetX = t.clientX - this.dragStartX;
      this.offsetY = t.clientY - this.dragStartY;
      this.#scheduleRender();
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.#scheduleRender();
      }
    });

    // Mouse wheel zoom
    this.viewportWrap.addEventListener('wheel', (e) => {
      if (!this.imgLoaded) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      let newZoom = Math.max(1, Math.min(4, this.zoom + delta));
      this.zoom = newZoom;
      this.slider.value = String(Math.round(this.zoom * 100));
      this.#scheduleRender();
    }, { passive: false });

    // Apply Crop button
    this.applyBtn.addEventListener('click', () => this.#handleApply());
  }

  #loadFile(file) {
    const MAX_INPUT_FILE_BYTES = 15 * 1024 * 1024; // 15 MB raw file guard
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
      return;
    }
    if (file.size > MAX_INPUT_FILE_BYTES) {
      showToast('Image file is too large (max 15MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      this.#loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  #loadImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.img = img;
      this.imgLoaded = true;
      this.dropzone.style.display = 'none';
      this.viewportWrap.style.display = 'block';
      this.controlsWrap.style.display = 'flex';
      this.applyBtn.disabled = false;
      this.#resetAll();
    };
    img.onerror = () => {
      showToast('Failed to load image. Please try another file.');
    };
    img.src = src;
  }

  #resetAll() {
    this.zoom = 1;
    this.rotation = 0;
    if (this.slider) this.slider.value = '100';
    this.#resetPosition();
    this.#render();
  }

  #resetPosition() {
    this.offsetX = 0;
    this.offsetY = 0;
    if (!this.img) return;

    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const isRotated = this.rotation === 90 || this.rotation === 270;
    const imgW = isRotated ? this.img.height : this.img.width;
    const imgH = isRotated ? this.img.width : this.img.height;

    // Minimum scale so the crop circle/box is fully covered
    const cropRadius = (canvasW / 2) * 0.88;
    const minSide = cropRadius * 2;
    this.baseScale = Math.max(minSide / imgW, minSide / imgH);
  }

  #render() {
    if (!this.ctx || !this.img || !this.imgLoaded) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const cropRadius = (w / 2) * 0.88;

    this.ctx.clearRect(0, 0, w, h);

    // 1. Draw transformed image
    this.ctx.save();
    this.ctx.translate(cx + this.offsetX, cy + this.offsetY);
    this.ctx.rotate((this.rotation * Math.PI) / 180);
    const currentScale = this.baseScale * this.zoom;
    this.ctx.scale(currentScale, currentScale);
    this.ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
    this.ctx.restore();

    // 2. Dark mask overlay with cut-out aperture
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(7, 7, 11, 0.72)';
    this.ctx.beginPath();
    this.ctx.rect(0, 0, w, h);

    if (this.cropShape === 'circle') {
      this.ctx.arc(cx, cy, cropRadius, 0, Math.PI * 2, true);
    } else {
      const boxSize = cropRadius * 2;
      this.ctx.rect(cx + cropRadius, cy - cropRadius, -boxSize, boxSize);
    }
    this.ctx.fill();
    this.ctx.restore();

    // 3. Framing outline & guide crosshairs
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    if (this.cropShape === 'circle') {
      this.ctx.arc(cx, cy, cropRadius, 0, Math.PI * 2);
    } else {
      this.ctx.strokeRect(cx - cropRadius, cy - cropRadius, cropRadius * 2, cropRadius * 2);
    }
    this.ctx.stroke();

    // Subtle guidelines while dragging
    if (this.isDragging) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      // Horizontal thirds
      this.ctx.moveTo(cx - cropRadius, cy - cropRadius / 3);
      this.ctx.lineTo(cx + cropRadius, cy - cropRadius / 3);
      this.ctx.moveTo(cx - cropRadius, cy + cropRadius / 3);
      this.ctx.lineTo(cx + cropRadius, cy + cropRadius / 3);
      // Vertical thirds
      this.ctx.moveTo(cx - cropRadius / 3, cy - cropRadius);
      this.ctx.lineTo(cx - cropRadius / 3, cy + cropRadius);
      this.ctx.moveTo(cx + cropRadius / 3, cy - cropRadius);
      this.ctx.lineTo(cx + cropRadius / 3, cy + cropRadius);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  #exportCroppedDataUrl() {
    const offscreen = document.createElement('canvas');
    offscreen.width = this.targetSize;
    offscreen.height = this.targetSize;
    const offCtx = offscreen.getContext('2d');

    const w = this.canvas.width;
    const cropRadius = (w / 2) * 0.88;
    const scaleToTarget = this.targetSize / (cropRadius * 2);

    offCtx.save();
    offCtx.translate(this.targetSize / 2, this.targetSize / 2);
    offCtx.scale(scaleToTarget, scaleToTarget);
    offCtx.translate(this.offsetX, this.offsetY);
    offCtx.rotate((this.rotation * Math.PI) / 180);
    const currentScale = this.baseScale * this.zoom;
    offCtx.scale(currentScale, currentScale);
    offCtx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
    offCtx.restore();

    let dataUrl = offscreen.toDataURL('image/webp', 0.85);
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
    }
    return dataUrl;
  }

  async #handleApply() {
    if (!this.img || !this.imgLoaded) return;

    this.applyBtn.disabled = true;
    this.applyBtn.innerHTML = '<i class="ph-light ph-spinner ph-spin"></i><span>Saving...</span>';

    try {
      const dataUrl = this.#exportCroppedDataUrl();

      let uploadedUrl = dataUrl;
      try {
        const res = await this.uploader(dataUrl);
        if (typeof res === 'string' && res.trim().length > 0) {
          uploadedUrl = res.trim();
        } else if (res && res.url) {
          uploadedUrl = res.url;
        }
      } catch (uploadErr) {
        console.warn('Backend avatar upload warning:', uploadErr);
        uploadedUrl = dataUrl;
      }

      if (this.onCropCallback) {
        this.onCropCallback({
          url: uploadedUrl,
          dataUrl
        });
      }

      showToast('Avatar cropped and updated!');
      this.close();
    } catch (err) {
      const errMsg = err?.message || (typeof err === 'string' ? err : 'unknown error');
      showToast('Error applying crop: ' + errMsg);
    } finally {
      this.applyBtn.disabled = false;
      this.applyBtn.innerHTML = '<i class="ph-light ph-check"></i><span>Save &amp; Crop</span>';
    }
  }

  open({ onCrop, uploader = null, initialImage = null, title = 'Adjust Profile Image', shape = 'circle' } = {}) {
    this.onCropCallback = onCrop || null;
    this.uploader = uploader || ((dataUrl) => api.uploadAvatar(dataUrl));
    this.cropShape = shape;
    if (this.titleEl) this.titleEl.textContent = title;

    if (this.fileInput) this.fileInput.value = '';

    if (initialImage && typeof initialImage === 'string' && initialImage.length > 5) {
      this.#loadImage(initialImage);
    } else {
      this.img = null;
      this.imgLoaded = false;
      this.dropzone.style.display = 'flex';
      this.viewportWrap.style.display = 'none';
      this.controlsWrap.style.display = 'none';
      this.applyBtn.disabled = true;
    }

    this.overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.isDragging = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Global Singleton
let cropperInstance = null;

/**
 * Open the interactive image cropper modal
 * @param {object} options
 * @param {(result: { url: string, dataUrl: string }) => void} options.onCrop
 * @param {string} [options.initialImage]
 * @param {string} [options.title]
 * @param {'circle' | 'rect'} [options.shape]
 */
export function openImageCropper(options) {
  if (!cropperInstance) {
    cropperInstance = new ImageCropper();
  }
  cropperInstance.open(options);
}
