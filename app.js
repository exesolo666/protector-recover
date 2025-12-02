(() => {
  const fileInput = document.getElementById("fileInput");
  const colorInput = document.getElementById("colorPicker");
  const brushSizeInput = document.getElementById("brushSize");
  const intensityInput = document.getElementById("intensity");
  const brushSizeValue = document.getElementById("brushSizeValue");
  const intensityValue = document.getElementById("intensityValue");
  const clearMaskBtn = document.getElementById("clearMask");
  const resetBtn = document.getElementById("resetAll");
  const placeholder = document.getElementById("placeholder");
  const statusText = document.getElementById("statusText");

  const renderCanvas = document.getElementById("renderCanvas");
  const maskCanvas = document.getElementById("maskCanvas");
  const renderCtx = renderCanvas.getContext("2d");
  const maskCtx = maskCanvas.getContext("2d");

  let originalImageData = null;
  let canvasWidth = 0;
  let canvasHeight = 0;

  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;

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
  updateStatus("Загрузите фото, затем выделите область диска кистью.");

  // Загрузка изображения
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        placeholder.classList.add("hidden");
        fitImageToCanvas(img);
        updateStatus("Нарисуйте маску по области диска. Затем меняйте цвет.");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Подгоняем размер холста под обёртку и изображение
  function fitImageToCanvas(img) {
    const wrapper = document.querySelector(".canvas-wrapper");
    const maxWidth = wrapper.clientWidth;
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

  // Преобразование координат указателя в координаты канваса
  function getCanvasCoords(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  // Работа с кистью (маска)
  function startDrawing(event) {
    if (!originalImageData) return;

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

    event.preventDefault();
  }

  function stopDrawing(event) {
    if (!isDrawing) return;
    isDrawing = false;
    applyColor();
    event.preventDefault();
  }

  maskCanvas.addEventListener("pointerdown", startDrawing);
  maskCanvas.addEventListener("pointermove", draw);
  window.addEventListener("pointerup", stopDrawing);
  window.addEventListener("pointercancel", stopDrawing);

  // HEX -> RGB
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

  // Применяем цвет к области диска по маске
  function applyColor() {
    if (!originalImageData) return;

    const { r, g, b } = hexToRgb(colorInput.value || "#ff0000");
    const intensity = Number(intensityInput.value) / 100;

    const src = originalImageData.data;
    const maskData = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight).data;
    const output = new ImageData(canvasWidth, canvasHeight);
    const dst = output.data;

    for (let i = 0; i < src.length; i += 4) {
      const maskAlpha = maskData[i + 3]; // 0–255

      if (maskAlpha > 0) {
        const alpha = intensity * (maskAlpha / 255);

        const or = src[i];
        const og = src[i + 1];
        const ob = src[i + 2];
        const oa = src[i + 3];

        dst[i] = or * (1 - alpha) + r * alpha;
        dst[i + 1] = og * (1 - alpha) + g * alpha;
        dst[i + 2] = ob * (1 - alpha) + b * alpha;
        dst[i + 3] = oa;
      } else {
        dst[i] = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = src[i + 3];
      }
    }

    renderCtx.putImageData(output, 0, 0);
  }

  // Обновление подписей
  brushSizeInput.addEventListener("input", () => {
    setBrushSizeLabel();
  });

  intensityInput.addEventListener("input", () => {
    setIntensityLabel();
    applyColor();
  });

  colorInput.addEventListener("input", () => {
    applyColor();
  });

  // Очистить маску
  clearMaskBtn.addEventListener("click", () => {
    if (!originalImageData) return;
    maskCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    renderCtx.putImageData(originalImageData, 0, 0);
    updateStatus("Маска очищена. Нарисуйте область диска заново.");
  });

  // Полный сброс
  resetBtn.addEventListener("click", () => {
    fileInput.value = "";
    originalImageData = null;

    renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    placeholder.classList.remove("hidden");
    updateStatus("Загрузите фото, чтобы начать.");
  });
})();
