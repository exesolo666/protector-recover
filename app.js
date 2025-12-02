window.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const intensityInput = document.getElementById("intensity");
  const intensityValue = document.getElementById("intensityValue");
  const rerunAIBtn = document.getElementById("rerunAI");
  const resetBtn = document.getElementById("resetAll");
  const toggleOriginalBtn = document.getElementById("toggleOriginal");
  const downloadBtn = document.getElementById("downloadResult");
  const placeholder = document.getElementById("placeholder");
  const statusText = document.getElementById("statusText");
  const presetColorsContainer = document.getElementById("presetColors");
  const currentColorLabel = document.getElementById("currentColorLabel");

  const previewCanvas = document.getElementById("previewCanvas");
  const ctx = previewCanvas
    ? previewCanvas.getContext("2d", { willReadFrequently: true })
    : null;

  if (!previewCanvas || !ctx) {
    console.error("Canvas not found or context not available");
    if (statusText) {
      statusText.textContent = "Ошибка инициализации канваса.";
    }
    return;
  }

  let canvasSize = 512;
  let originalImageData = null;
  let recoloredImageData = null;
  let wheelMask = null;
  let currentColor = "#d7d7d7";
  let showingOriginal = false;

  function updateStatus(text) {
    if (statusText) statusText.textContent = text;
  }

  function setIntensityLabel() {
    if (intensityValue) {
      intensityValue.textContent = `${intensityInput.value}%`;
    }
  }

  function initCanvasSize() {
    const wrapper = document.querySelector(".canvas-wrapper");
    let size = 600;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width && rect.width > 0) {
        size = Math.max(320, Math.min(rect.width, 900));
      }
    }
    previewCanvas.width = size;
    previewCanvas.height = size;
    canvasSize = size;
  }

  setIntensityLabel();
  initCanvasSize();
  updateStatus(
    "1) Загрузите фото. 2) Подождите, пока ИИ найдёт диск. 3) Меняйте цвета."
  );

  // При ресайзе: только пока ещё нет загруженного изображения
  window.addEventListener("resize", () => {
    if (!originalImageData) {
      initCanvasSize();
    }
  });

  // --------- ВЫБОР ЦВЕТА (ПРЕСЕТЫ) ---------
  if (presetColorsContainer) {
    presetColorsContainer.addEventListener("click", (event) => {
      const btn = event.target.closest(".swatch");
      if (!btn) return;

      const color = btn.dataset.color;
      const name = btn.dataset.name || color;
      if (!color) return;

      currentColor = color;

      presetColorsContainer.querySelectorAll(".swatch").forEach((el) => {
        el.classList.remove("active");
      });
      btn.classList.add("active");

      if (currentColorLabel) {
        currentColorLabel.textContent = `Текущий цвет: ${name}`;
      }

      // Обновляем окраску, если уже есть маска
      applyColor();
    });
  }

  // --------- ЗАГРУЗКА ИЗОБРАЖЕНИЯ ---------
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          if (placeholder) placeholder.classList.add("hidden");
          showingOriginal = false;
          if (toggleOriginalBtn) {
            toggleOriginalBtn.textContent = "Показать исходное";
          }
          drawImageToSquareCanvas(img);
          updateStatus("Изображение загружено. ИИ ищет диск...");
          runAIWheelDetection();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Обрезка до квадрата и рисование
  function drawImageToSquareCanvas(img) {
    initCanvasSize();

    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;

    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, canvasSize, canvasSize);

    originalImageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
    recoloredImageData = null;
    wheelMask = null;
  }

  // --------- МАШИННОЕ ОБУЧЕНИЕ: ПОИСК ДИСКА (k-means) ---------
  function createWheelMaskAI(imageData, width, height) {
    if (!imageData || width <= 0 || height <= 0) return null;

    const data = imageData.data;
    const totalPixels = width * height;

    const gray = new Float32Array(totalPixels);
    const radius = new Float32Array(totalPixels);

    const cx = width / 2;
    const cy = height / 2;

    let index = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i4 = index * 4;
        const r = data[i4];
        const g = data[i4 + 1];
        const b = data[i4 + 2];

        // Яркость 0..1
        const gy = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        gray[index] = gy;

        const dx = (x - cx) / width;
        const dy = (y - cy) / height;
        const rad = Math.sqrt(dx * dx + dy * dy);
        radius[index] = rad;

        index++;
      }
    }

    const K = 3;
    const centGray = new Float32Array(K);
    const centRad = new Float32Array(K);

    let minG = 1;
    let maxG = 0;
    for (let i = 0; i < totalPixels; i++) {
      const gVal = gray[i];
      if (gVal < minG) minG = gVal;
      if (gVal > maxG) maxG = gVal;
    }

    centGray[0] = minG;
    centGray[1] = (minG + maxG) / 2;
    centGray[2] = maxG;

    centRad[0] = 0.3;
    centRad[1] = 0.5;
    centRad[2] = 0.7;

    const labels = new Uint8Array(totalPixels);
    const sumG = new Float32Array(K);
    const sumR = new Float32Array(K);
    const count = new Uint32Array(K);

    const iterations = 4;

    for (let it = 0; it < iterations; it++) {
      // E-шаг
      for (let i = 0; i < totalPixels; i++) {
        let bestK = 0;
        let bestDist = Infinity;

        const gVal = gray[i];
        const rVal = radius[i];

        for (let k = 0; k < K; k++) {
          const dg = gVal - centGray[k];
          const dr = rVal - centRad[k];
          const dist = dg * dg + dr * dr;
          if (dist < bestDist) {
            bestDist = dist;
            bestK = k;
          }
        }
        labels[i] = bestK;
      }

      // M-шаг
      sumG.fill(0);
      sumR.fill(0);
      count.fill(0);

      for (let i = 0; i < totalPixels; i++) {
        const k = labels[i];
        sumG[k] += gray[i];
        sumR[k] += radius[i];
        count[k]++;
      }

      for (let k = 0; k < K; k++) {
        if (count[k] > 0) {
          centGray[k] = sumG[k] / count[k];
          centRad[k] = sumR[k] / count[k];
        }
      }
    }

    // Выбираем кластер "похожий" на диск
    let chosenCluster = 0;
    let bestScore = -Infinity;

    for (let k = 0; k < K; k++) {
      const gMean = centGray[k];
      const rMean = centRad[k];
      const cnt = count[k] || 1;

      const grayTarget = 0.6;
      const radTarget = 0.5;

      let score = 0;
      score -= Math.abs(gMean - grayTarget) * 2.0;
      score -= Math.abs(rMean - radTarget) * 3.0;
      score += (cnt / totalPixels) * 1.5;

      if (score > bestScore) {
        bestScore = score;
        chosenCluster = k;
      }
    }

    const mask = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      mask[i] = labels[i] === chosenCluster ? 255 : 0;
    }

    return mask;
  }

  function runAIWheelDetection() {
    if (!originalImageData || !canvasSize) {
      updateStatus("Сначала загрузите фото.");
      return;
    }

    updateStatus("ИИ анализирует изображение и ищет диск...");

    setTimeout(() => {
      try {
        wheelMask = createWheelMaskAI(originalImageData, canvasSize, canvasSize);
        if (wheelMask) {
          updateStatus(
            "Область диска найдена автоматически. Меняйте цвета и интенсивность."
          );
          applyColor();
        } else {
          updateStatus("Не удалось найти диск. Попробуйте другое фото.");
        }
      } catch (err) {
        console.error(err);
        updateStatus("Ошибка при работе ИИ. Попробуйте другое фото.");
      }
    }, 10);
  }

  // --------- НАЛОЖЕНИЕ ЦВЕТА ---------
  function hexToRgb(hex) {
    let value = hex.replace("#", "");
    if (value.length === 3) {
      value = value
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const num = parseInt(value, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function applyColor() {
    if (!originalImageData || !wheelMask) {
      if (originalImageData && !showingOriginal) {
        ctx.putImageData(originalImageData, 0, 0);
      }
      return;
    }

    const { r, g, b } = hexToRgb(currentColor || "#d7d7d7");
    const intensity = Number(intensityInput.value) / 100;

    const src = originalImageData.data;
    const totalPixels = canvasSize * canvasSize;
    const dst = new Uint8ClampedArray(src.length);

    for (let i = 0; i < totalPixels; i++) {
      const maskVal = wheelMask[i] / 255;
      const alpha = maskVal * intensity;

      const idx = i * 4;
      const or = src[idx];
      const og = src[idx + 1];
      const ob = src[idx + 2];
      const oa = src[idx + 3];

      if (alpha > 0) {
        dst[idx]     = or * (1 - alpha) + r * alpha;
        dst[idx + 1] = og * (1 - alpha) + g * alpha;
        dst[idx + 2] = ob * (1 - alpha) + b * alpha;
        dst[idx + 3] = oa;
      } else {
        dst[idx]     = or;
        dst[idx + 1] = og;
        dst[idx + 2] = ob;
        dst[idx + 3] = oa;
      }
    }

    const out = ctx.createImageData(canvasSize, canvasSize);
    out.data.set(dst);
    recoloredImageData = out;

    if (!showingOriginal) {
      ctx.putImageData(recoloredImageData, 0, 0);
    }
  }

  intensityInput.addEventListener("input", () => {
    setIntensityLabel();
    applyColor();
  });

  // --------- КНОПКИ ---------
  if (rerunAIBtn) {
    rerunAIBtn.addEventListener("click", () => {
      if (!originalImageData) return;
      runAIWheelDetection();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (fileInput) fileInput.value = "";
      originalImageData = null;
      recoloredImageData = null;
      wheelMask = null;

      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      if (placeholder) placeholder.classList.remove("hidden");
      showingOriginal = false;
      if (toggleOriginalBtn) {
        toggleOriginalBtn.textContent = "Показать исходное";
      }
      updateStatus("Загрузите фото, чтобы начать.");
    });
  }

  if (toggleOriginalBtn) {
    toggleOriginalBtn.addEventListener("click", () => {
      if (!originalImageData) return;

      showingOriginal = !showingOriginal;

      if (showingOriginal) {
        ctx.putImageData(originalImageData, 0, 0);
        toggleOriginalBtn.textContent = "Показать с окраской";
        updateStatus("Режим: исходное фото (до).");
      } else {
        if (!recoloredImageData && wheelMask) {
          applyColor();
        }
        if (recoloredImageData) {
          ctx.putImageData(recoloredImageData, 0, 0);
        } else {
          ctx.putImageData(originalImageData, 0, 0);
        }
        toggleOriginalBtn.textContent = "Показать исходное";
        updateStatus("Режим: с окраской (после).");
      }
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (!originalImageData) return;

      const link = document.createElement("a");
      link.href = previewCanvas.toDataURL("image/png");
      link.download = "wheel-color.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      updateStatus("Результат сохранён как PNG-файл.");
    });
  }
});
