"use client";

import {
  ImagePlus,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CARD_CROP_MIN_HEIGHT,
  CARD_CROP_MIN_WIDTH,
  cardPhotoAspect,
  cropRejection,
  type CardPhotoCrop,
} from "@/lib/employee-card";
import { clientFileSizeError } from "@/components/client-file-upload-guard";

type PhotoUploadAction = (formData: FormData) => void | Promise<void>;

type ImageSource = {
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  crop: CardPhotoCrop;
};

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;
const CROP_ASPECT = cardPhotoAspect();

function centeredCrop(source: ImageSource): CardPhotoCrop {
  const sourceAspect = source.width / source.height;
  const width = sourceAspect >= CROP_ASPECT ? CROP_ASPECT / sourceAspect : 1;
  const height = sourceAspect >= CROP_ASPECT ? 1 : sourceAspect / CROP_ASPECT;

  return {
    x: (1 - width) / 2,
    y: (1 - height) / 2,
    width,
    height,
  };
}

function clampCrop(crop: CardPhotoCrop): CardPhotoCrop {
  const width = Math.min(1, Math.max(0, crop.width));
  const height = Math.min(1, Math.max(0, crop.height));

  return {
    x: Math.min(Math.max(0, crop.x), 1 - width),
    y: Math.min(Math.max(0, crop.y), 1 - height),
    width,
    height,
  };
}

function maxCropZoom(base: CardPhotoCrop, source: ImageSource | null) {
  if (!source || source.width <= 0 || source.height <= 0) return 1;

  const minimumWidthFraction = CARD_CROP_MIN_WIDTH / source.width;
  const minimumHeightFraction = CARD_CROP_MIN_HEIGHT / source.height;
  if (minimumWidthFraction <= 0 || minimumHeightFraction <= 0) return 1;

  return Math.max(
    1,
    Math.min(
      base.width / minimumWidthFraction,
      base.height / minimumHeightFraction
    )
  );
}

function acceptedImage(file: File) {
  return (
    ACCEPTED_MIME_TYPES.has(file.type) ||
    (!file.type && ACCEPTED_EXTENSIONS.test(file.name))
  );
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function EmployeePhotoCropper({
  employeeId,
  action,
  currentPhoto = false,
}: {
  employeeId: string;
  action: PhotoUploadAction;
  currentPhoto?: boolean;
}) {
  const inputId = useId();
  const instructionId = `${inputId}-instructions`;
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectionRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [source, setSource] = useState<ImageSource | null>(null);
  const [baseCrop, setBaseCrop] = useState<CardPhotoCrop | null>(null);
  const [crop, setCrop] = useState<CardPhotoCrop | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const maximumZoom = useMemo(
    () => maxCropZoom(baseCrop ?? centeredCrop(source ?? { width: 1, height: 1 }), source),
    [baseCrop, source]
  );
  const cropError = crop && source ? cropRejection(crop, source) : null;
  const validationError = fileError || cropError || "";
  const canSubmit = Boolean(file && source && crop && !validationError);

  function resetSelection() {
    selectionRef.current += 1;
    setFile(null);
    setPreviewUrl("");
    setSource(null);
    setBaseCrop(null);
    setCrop(null);
    setZoom(1);
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    if (!nextFile) {
      resetSelection();
      return;
    }

    if (!acceptedImage(nextFile)) {
      setFile(null);
      setSource(null);
      setBaseCrop(null);
      setCrop(null);
      setPreviewUrl("");
      setFileError("Pilih foto JPG, PNG, atau WebP.");
      event.currentTarget.value = "";
      return;
    }

    const sizeError = clientFileSizeError(nextFile, undefined, "Ukuran foto maksimal 5 MB.");
    if (sizeError) {
      setFile(null);
      setSource(null);
      setBaseCrop(null);
      setCrop(null);
      setPreviewUrl("");
      setFileError(sizeError);
      event.currentTarget.value = "";
      return;
    }

    const selectionId = selectionRef.current + 1;
    selectionRef.current = selectionId;
    const url = URL.createObjectURL(nextFile);
    const image = new Image();

    image.onload = () => {
      if (selectionRef.current !== selectionId) {
        URL.revokeObjectURL(url);
        return;
      }

      const nextSource = { width: image.naturalWidth, height: image.naturalHeight };
      const nextBaseCrop = centeredCrop(nextSource);
      setFile(nextFile);
      setPreviewUrl(url);
      setSource(nextSource);
      setBaseCrop(nextBaseCrop);
      setCrop(nextBaseCrop);
      setZoom(1);
      setFileError("");
    };
    image.onerror = () => {
      if (selectionRef.current === selectionId) {
        setFile(null);
        setSource(null);
        setBaseCrop(null);
        setCrop(null);
        setPreviewUrl("");
        setFileError("Foto tidak dapat dibaca. Pilih berkas gambar lain.");
        event.currentTarget.value = "";
      }
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  function updateZoom(nextZoom: number) {
    if (!baseCrop || !crop) return;

    const boundedZoom = Math.min(Math.max(1, nextZoom), maximumZoom);
    const width = baseCrop.width / boundedZoom;
    const height = baseCrop.height / boundedZoom;
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    setCrop(
      clampCrop({
        x: centerX - width / 2,
        y: centerY - height / 2,
        width,
        height,
      })
    );
    setZoom(boundedZoom);
  }

  function resetCrop() {
    if (!baseCrop) return;
    setCrop(baseCrop);
    setZoom(1);
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      crop,
    };
    setDragging(true);
  }

  function moveCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || drag.pointerId !== event.pointerId) return;

    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    setCrop(
      clampCrop({
        ...drag.crop,
        x: drag.crop.x + (event.clientX - drag.clientX) / bounds.width,
        y: drag.crop.y + (event.clientY - drag.clientY) / bounds.height,
      })
    );
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function nudgeCrop(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!crop) return;

    const amount = event.shiftKey ? 0.03 : 0.01;
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-amount, 0],
      ArrowRight: [amount, 0],
      ArrowUp: [0, -amount],
      ArrowDown: [0, amount],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    setCrop(clampCrop({ ...crop, x: crop.x + delta[0], y: crop.y + delta[1] }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      event.preventDefault();
      setFileError(validationError || "Pilih foto dan atur area potong terlebih dahulu.");
    }
  }

  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="employee-photo-cropper"
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="employee-photo-cropper-heading">
        <div className="min-w-0">
          <h3>{currentPhoto ? "Ganti foto resmi" : "Unggah foto resmi"}</h3>
          <p>
            Geser kotak ke posisi wajah yang tepat. Rasio kartu dan batas kualitas akan diperiksa sebelum foto disimpan.
          </p>
        </div>
        <ImagePlus aria-hidden="true" />
      </div>

      <div className="employee-photo-cropper-grid">
        <div className="employee-photo-cropper-input">
          <label className="label" htmlFor={inputId}>Pilih foto</label>
          <input
            ref={inputRef}
            id={inputId}
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            capture="user"
            required
            className="employee-photo-file-input"
            onChange={handleFileChange}
            aria-describedby={`${instructionId}${validationError ? ` ${inputId}-error` : ""}`}
          />
          <p id={instructionId} className="employee-photo-cropper-help">
            JPG, PNG, atau WebP. Area minimum {CARD_CROP_MIN_WIDTH}×{CARD_CROP_MIN_HEIGHT} piksel pada foto asli.
          </p>
          {file && <p className="employee-photo-selected" title={file.name}>{file.name}</p>}
        </div>

        <div className="employee-photo-cropper-stage-column">
          {previewUrl && source && crop ? (
            <div
              ref={stageRef}
              className="employee-photo-cropper-stage"
              style={{ aspectRatio: `${source.width} / ${source.height}` }}
            >
              <img src={previewUrl} alt="Pratinjau foto yang akan disimpan" />
              <div
                className={`employee-photo-crop-box ${dragging ? "is-dragging" : ""}`}
                role="button"
                tabIndex={0}
                aria-label="Kotak potong foto"
                aria-describedby={instructionId}
                title="Geser kotak. Gunakan tombol panah untuk menggeser sedikit."
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
                onPointerDown={beginDrag}
                onPointerMove={moveCrop}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={nudgeCrop}
              >
                <span className="employee-photo-crop-box-label"><Move aria-hidden="true" /> Geser area foto</span>
              </div>
            </div>
          ) : (
            <div className="employee-photo-cropper-empty">
              <ImagePlus aria-hidden="true" />
              <span>Pilih foto untuk melihat area crop.</span>
            </div>
          )}

          {source && crop && (
            <div className="employee-photo-cropper-controls">
              <button
                type="button"
                className="btn-secondary employee-photo-cropper-icon-button"
                onClick={() => updateZoom(zoom - 0.1)}
                disabled={zoom <= 1.001}
                aria-label="Perkecil area potong"
                title="Perkecil area potong"
              >
                <ZoomOut aria-hidden="true" />
              </button>
              <label className="employee-photo-zoom-control" htmlFor={`${inputId}-zoom`}>
                <span>Zoom {Math.round(zoom * 100)}%</span>
                <input
                  id={`${inputId}-zoom`}
                  type="range"
                  min="1"
                  max={Math.max(1, maximumZoom).toFixed(2)}
                  step="0.01"
                  value={Math.min(zoom, Math.max(1, maximumZoom))}
                  onChange={(event) => updateZoom(Number(event.currentTarget.value))}
                  aria-valuetext={`${Math.round(zoom * 100)} persen`}
                />
              </label>
              <button
                type="button"
                className="btn-secondary employee-photo-cropper-icon-button"
                onClick={() => updateZoom(zoom + 0.1)}
                disabled={zoom >= maximumZoom - 0.001}
                aria-label="Perbesar area potong"
                title="Perbesar area potong"
              >
                <ZoomIn aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn-secondary employee-photo-cropper-reset"
                onClick={resetCrop}
                aria-label="Reset area potong"
                title="Reset area potong"
              >
                <RotateCcw aria-hidden="true" />
                <span>Reset</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {validationError ? (
        <p id={`${inputId}-error`} className="employee-photo-cropper-error" role="alert">{validationError}</p>
      ) : source && crop ? (
        <p className="employee-photo-cropper-status" role="status">
          Area terpilih {formatPercent(crop.width)} × {formatPercent(crop.height)} dari foto asli.
        </p>
      ) : null}

      <div className="employee-photo-cropper-actions">
        <input type="hidden" name="cropX" value={crop?.x.toFixed(8) ?? ""} />
        <input type="hidden" name="cropY" value={crop?.y.toFixed(8) ?? ""} />
        <input type="hidden" name="cropWidth" value={crop?.width.toFixed(8) ?? ""} />
        <input type="hidden" name="cropHeight" value={crop?.height.toFixed(8) ?? ""} />
        <button type="button" className="btn-secondary" onClick={resetSelection} disabled={!file && !previewUrl}>
          Pilih ulang
        </button>
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          Simpan foto
        </button>
      </div>
    </form>
  );
}
