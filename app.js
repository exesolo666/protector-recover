(() => {
  const fileInput = document.getElementById("fileInput");
  const brushSizeInput = document.getElementById("brushSize");
  const intensityInput = document.getElementById("intensity");
  const brushSizeValue = document.getElementById("brushSizeValue");
  const intensityValue = document.getElementById("intensityValue");
  const clearMaskBtn = document.getElementById("clearMask");
  const resetBtn = document.getElementById("resetAll");
  const toggleOriginalBtn = document.getElementById("toggleOriginal");
  const downloadBtn = document.getElementById("downloadResult");
  const placeholder = document.getElementById("placeholder");
  const statusText = document.getElementById("statusText");
  const presetColorsContainer = document.getElementById("presetColors");
  const currentColorLabel = document.getElementById("currentColorLabel");

  const renderCanvas = document.getElementById("renderCanvas");
  const maskCanvas = document.getElementById("maskCanvas");
  const renderCtx = renderCanvas.getContext("2d", { willReadFrequently: true });
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

  let originalImageData = null;
  let canvasWidth = 0;
  let canvasHeight = 0;

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

  // Текущий цвет (по умолчанию — алюмохром)
  let currentColor = "#d7d7d7";

  // Флаг режима "показать исходное"
  let showingOriginal = false;

  function updateStatus(text) {
    statusText.textContent = text;
  }

  function setBrushSizeLabel() {
    brushSizeValue.textContent = `${brushSizeInput.value} px`;
  }

  function setIntensityLabel() {
    intensityValue.textContent = `${intensityInput.value}%`;
  }

  setBrushSizeLabel();
  setIntensityLabel();
  updateStatus(
    "1) Загрузите фото. 2) Выберите цвет. 3) Нарисуйте маску по диску."
  );

  // ---------- ПРЕСЕТЫ ЦВЕТОВ ----------

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

      // При изменении цвета — показываем сразу результат
      if (!showingOriginal) {
        applyColor();
      }
    });
  }

  // ---------- ЗАГРУЗКА ИЗОБРАЖЕНИЯ ----------

  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        placeholder.classList.add("hidden");
        showingOriginal = false;
        if (toggleOriginalBtn) {
          toggleOriginalBtn.textContent = "Показать исходное";
        }
        fitImageToCanvas(img);
        updateStatus(
          "Нарисуйте маску по области диска. Цвет можно менять в один клик."
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  function fitImageToCanvas(img) {
    const wrapper = document.querySelector(".canvas-wrapper");
    let maxWidth = wrapper ? wrapper.clientWidth : img.width;

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;

    canvasWidth = Math.round(img.width * scale);
    canvasHeight = Math.round(img.height * scale);

    renderCanvas.width = canvasWidth;
    renderCanvas.height = canvasHeight;
    maskCanvas.width = canvasWidth;
    maskCanvas.height = canvasHeight;

    renderCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    renderCtx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

    originalImageData = renderCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  }

  // ---------- РИСОВАНИЕ МАСКИ ----------

  function getCanvasCoords(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function startDrawing(event) {
    if (!originalImageData) {
      updateStatus("Сначала загрузите фото, затем рисуйте маску по диску.");
      return;
    }

    isDrawing = true;
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.strokeStyle = "rgba(255, 255, 255, 1)";
    maskCtx.lineWidth = Number(brushSizeInput.value);

    const { x, y } = getCanvasCoords(event, maskCanvas);
    lastX = x;
    lastY = y;

    maskCtx.beginPath();
    maskCtx.moveTo(lastX, lastY);

    event.preventDefault();
  }

  function draw(event) {
    if (!isDrawing) return;

    const { x, y } = getCanvasCoords(event, maskCanvas);
    maskCtx.lineTo(x, y);
    maskCtx.stroke();

    lastX = x;
    lastY = y;

    // Во время рисования показываем раскрашенный вариант
    if (!showingOriginal) {
      applyColor();
    }

    event.preventDefault();
  }

  function stopDrawing(event) {
    if (!isDrawing) return;
    isDrawing = false;
    if (!showingOriginal) {
      applyColor();
    }
    event.preventDefault();
  }

  maskCanvas.addEventListener("pointerdown", startDrawing);
  maskCanvas.addEventListener("pointermove", draw);
  window.addEventListener("pointerup", stopDrawing);
  window.addEventListener("pointercancel", stopDrawing);

  // ---------- ЦВЕТ/ИНТЕНСИВНОСТЬ ----------

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

  // Главная логика раскраски
  function applyColor() {
    if (!originalImageData || !canvasWidth || !canvasHeight) return;
    if (showingOriginal) {
      // Если пользователь смотрит "до", не трогаем картинку
      return;
    }

    const { r, g, b } = hexToRgb(currentColor || "#d7d7d7");
    const intensity = Number(intensityInput.value) / 100;

    const src = originalImageData.data;
    const maskImg = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const maskData = maskImg.data;

    const output = renderCtx.createImageData(canvasWidth, canvasHeight);
    const dst = output.data;

    for (let i = 0; i < src.length; i += 4) {
      const maskAlpha = maskData[i + 3]; // 0–255

      if (maskAlpha > 0) {
        const alpha = intensity * (maskAlpha / 255);

        const or = src[i];
        const og = src[i + 1];
        const ob = src[i + 2];
        const oa = src[i + 3];

        dst[i]     = or * (1 - alpha) + r * alpha;
        dst[i + 1] = og * (1 - alpha) + g * alpha;
        dst[i + 2] = ob * (1 - alpha) + b * alpha;
        dst[i + 3] = oa;
      } else {
        dst[i]     = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = src[i + 3];
      }
    }

    renderCtx.putImageData(output, 0, 0);
  }

  brushSizeInput.addEventListener("input", () => {
    setBrushSizeLabel();
  });

  intensityInput.addEventListener("input", () => {
    setIntensityLabel();
    if (!showingOriginal) {
      applyColor();
    }
  });

  // ---------- КНОПКИ УПРАВЛЕНИЯ ----------

  clearMaskBtn.addEventListener("click", () => {
    if (!originalImageData) return;
    maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    if (showingOriginal) {
      renderCtx.putImageData(originalImageData, 0, 0);
    } else {
      renderCtx.putImageData(originalImageData, 0, 0);
      applyColor();
    }
    updateStatus("Маска очищена. Нарисуйте заново по диску.");
  });

  resetBtn.addEventListener("click", () => {
    fileInput.value = "";
    originalImageData = null;

    renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    placeholder.classList.remove("hidden");
    showingOriginal = false;
    if (toggleOriginalBtn) {
      toggleOriginalBtn.textContent = "Показать исходное";
    }
    updateStatus("Загрузите фото, чтобы начать.");
  });

  // До / После
  if (toggleOriginalBtn) {
    toggleOriginalBtn.addEventListener("click", () => {
      if (!originalImageData) return;

      showingOriginal = !showingOriginal;

      if (showingOriginal) {
        renderCtx.putImageData(originalImageData, 0, 0);
        toggleOriginalBtn.textContent = "Показать с окраской";
        updateStatus("Режим: исходное фото (до).");
      } else {
        applyColor();
        toggleOriginalBtn.textContent = "Показать исходное";
        updateStatus("Режим: с окраской (после).");
      }
    });
  }

  // Скачать результат
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (!originalImageData) return;

      const link = document.createElement("a");
      link.href = renderCanvas.toDataURL("image/png");
      link.download = "wheel-color.png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      updateStatus("Результат сохранён как PNG-файл.");
    });
  }
})();
