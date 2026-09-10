import { useEffect, useRef, useState } from "react";
import { X, Zap, RotateCw, Barcode, Check, Search, AlertCircle, Loader2 } from "lucide-react";
import {
  DEMO_BARCODES,
  DemoBarcode,
  lookupBarcode,
  ScannedProduct,
  scanVideoFrameWithBarcodeDetector,
} from "../services/barcodeService";
import { MealPeriod } from "../services/storageService";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

interface BarcodeScannerModalProps {
  onClose: () => void;
  onLogProduct: (entry: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    time: MealPeriod;
    servingSize: string;
    barcode: string;
  }) => void;
}

export default function BarcodeScannerModal({ onClose, onLogProduct }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>(() => {
    const h = new Date().getHours();
    return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  });

  // Start camera stream
  useEffect(() => {
    let active = true;

    async function startCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraError("Camera access is not supported in this environment. You can use demo barcodes or manual entry.");
          return;
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        if (active) {
          setStream(mediaStream);
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }
        } else {
          mediaStream.getTracks().forEach((t) => t.stop());
        }
      } catch (err) {
        console.warn("Camera stream error:", err);
        setCameraError("Camera permission denied or camera not found. Use Demo Barcodes or manual input below.");
      }
    }

    startCamera();

    return () => {
      active = false;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  // Video frame scanning loop with BarcodeDetector API
  useEffect(() => {
    if (!stream || product || loading) return;

    let scanInterval: ReturnType<typeof setInterval>;

    const runScan = async () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const detected = await scanVideoFrameWithBarcodeDetector(videoRef.current);
        if (detected) {
          handleBarcodeDetected(detected);
        }
      }
    };

    scanInterval = setInterval(runScan, 400);

    return () => clearInterval(scanInterval);
  }, [stream, product, loading]);

  const triggerHaptic = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      // ignore
    }
  };

  const handleBarcodeDetected = async (barcode: string) => {
    setLoading(true);
    triggerHaptic();
    try {
      const p = await lookupBarcode(barcode);
      setProduct(p);
      setMultiplier(1);
    } catch (err) {
      console.error("Barcode lookup failed", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    try {
      const capabilities = (track as any).getCapabilities?.() || {};
      if ("torch" in capabilities) {
        const next = !torchOn;
        await (track as any).applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } else {
        setTorchOn(!torchOn);
      }
    } catch {
      setTorchOn(!torchOn);
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleSelectDemo = (demo: DemoBarcode) => {
    handleBarcodeDetected(demo.barcode);
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleBarcodeDetected(manualCode.trim());
    }
  };

  const handleConfirmLog = () => {
    if (!product) return;
    triggerHaptic();
    onLogProduct({
      name: product.name,
      calories: Math.round(product.calories * multiplier),
      protein: Math.round(product.protein * multiplier),
      carbs: Math.round(product.carbs * multiplier),
      fat: Math.round(product.fat * multiplier),
      time: mealPeriod,
      servingSize: multiplier === 1 ? product.servingSize : `${multiplier}x ${product.servingSize}`,
      barcode: product.barcode,
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0A0A0C] flex flex-col justify-between overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 z-10 bg-gradient-to-b from-[#0A0A0C] to-transparent">
        <div className="flex items-center gap-2">
          <Barcode size={18} className="text-[#00D98A]" />
          <span className="text-[15px] font-medium text-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
            Scan Food Barcode
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <X size={18} />
        </button>
      </div>

      {/* Main viewport area */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden px-4">
        {/* Video feed or camera fallback */}
        {!cameraError ? (
          <div className="absolute inset-0 overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-black/40" />
          </div>
        ) : (
          <div className="z-10 px-6 py-4 rounded-xl bg-white/5 border border-white/10 max-w-sm text-center mb-4">
            <AlertCircle size={28} className="mx-auto text-amber-400 mb-2" />
            <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">{cameraError}</p>
          </div>
        )}

        {/* Viewfinder Reticle */}
        {!product && (
          <div className="relative z-10 w-64 h-48 rounded-2xl border-2 border-[#00D98A]/70 flex flex-col items-center justify-center p-4 backdrop-blur-[1px] shadow-[0_0_30px_rgba(0,217,138,0.2)]">
            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-[#00D98A] rounded-tl-lg" />
            <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-[#00D98A] rounded-tr-lg" />
            <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-[#00D98A] rounded-bl-lg" />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-[#00D98A] rounded-br-lg" />

            {/* Animated laser scanning line */}
            <div className="absolute left-3 right-3 h-[2px] bg-[#00D98A] animate-pulse shadow-[0_0_10px_#00D98A]" />

            {loading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-[#00D98A]" />
                <span className="text-[11px] font-mono text-[#00D98A]">Fetching Open Food Facts...</span>
              </div>
            ) : (
              <span className="text-[11px] text-white/80 font-mono tracking-wider uppercase text-center">
                Align barcode in box
              </span>
            )}
          </div>
        )}

        {/* Camera control buttons */}
        {!product && !cameraError && (
          <div className="relative z-10 flex gap-4 mt-6">
            <button
              onClick={toggleTorch}
              className={`p-3 rounded-full backdrop-blur-md transition-all ${
                torchOn ? "bg-[#00D98A] text-black" : "bg-white/15 text-white"
              }`}
              title="Toggle Flash"
            >
              <Zap size={18} />
            </button>
            <button
              onClick={toggleCamera}
              className="p-3 rounded-full bg-white/15 text-white backdrop-blur-md active:scale-95 transition-transform"
              title="Switch Camera"
            >
              <RotateCw size={18} />
            </button>
          </div>
        )}

        {/* Scanned product preview card */}
        {product && (
          <div className="relative z-20 w-full max-w-sm rounded-2xl bg-[#141418] border border-white/15 p-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex gap-3 items-start mb-3">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-16 h-16 rounded-xl object-contain bg-white/5 border border-white/10 p-1"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Barcode size={28} className="text-[#00D98A]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {product.brand && (
                  <div className="text-[10px] tracking-wider uppercase text-[#00D98A] font-medium truncate">
                    {product.brand}
                  </div>
                )}
                <div className="text-[14px] font-semibold text-white leading-snug line-clamp-2">
                  {product.name}
                </div>
                <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  UPC: {product.barcode} · {product.servingSize}
                </div>
              </div>
            </div>

            {/* Calories & Macros summary */}
            <div className="grid grid-cols-4 gap-2 bg-[#1A1A22] rounded-xl p-2.5 mb-3 text-center border border-white/5">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Calories</div>
                <div className="text-[16px] font-mono font-bold text-[#00D98A]">
                  {Math.round(product.calories * multiplier)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Protein</div>
                <div className="text-[14px] font-mono font-semibold text-[#4DA6FF]">
                  {Math.round(product.protein * multiplier)}g
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Carbs</div>
                <div className="text-[14px] font-mono font-semibold text-[#FFB84D]">
                  {Math.round(product.carbs * multiplier)}g
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Fat</div>
                <div className="text-[14px] font-mono font-semibold text-[#FF6B6B]">
                  {Math.round(product.fat * multiplier)}g
                </div>
              </div>
            </div>

            {/* Serving size multiplier */}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1 text-[11px] text-muted-foreground">
                <span>Serving Multiplier</span>
                <span className="font-mono text-white font-medium">{multiplier}x</span>
              </div>
              <div className="flex gap-1.5">
                {[0.5, 1, 1.5, 2].map((val) => (
                  <button
                    key={val}
                    onClick={() => setMultiplier(val)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                      multiplier === val
                        ? "bg-[#00D98A] text-black font-semibold"
                        : "bg-white/5 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {val}x
                  </button>
                ))}
              </div>
            </div>

            {/* Meal period picker */}
            <div className="mb-4">
              <div className="text-[11px] text-muted-foreground mb-1">Add to meal slot:</div>
              <div className="flex gap-1.5">
                {(["morning", "afternoon", "evening"] as MealPeriod[]).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setMealPeriod(slot)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] capitalize font-medium transition-colors ${
                      mealPeriod === slot
                        ? "bg-[#00D98A]/20 text-[#00D98A] border border-[#00D98A]/40"
                        : "bg-white/5 text-muted-foreground border border-transparent"
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setProduct(null)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-white text-[13px] font-medium"
              >
                Scan Another
              </button>
              <button
                onClick={handleConfirmLog}
                className="flex-[2] py-3 rounded-xl bg-[#00D98A] text-black text-[13px] font-bold flex items-center justify-center gap-1.5 active:opacity-90"
              >
                <Check size={16} />
                Log to {mealPeriod}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Tray: Demo Barcodes & Manual UPC Input */}
      {!product && (
        <div className="z-10 bg-[#141418] border-t border-white/10 p-4 rounded-t-3xl shadow-2xl">
          {/* Quick Demo Barcodes */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] tracking-widest uppercase text-muted-foreground font-semibold">
                Quick Test Products
              </span>
              <span className="text-[9px] text-muted-foreground font-mono">1-tap demo scan</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {DEMO_BARCODES.map((item) => (
                <button
                  key={item.barcode}
                  onClick={() => handleSelectDemo(item)}
                  className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all active:scale-95"
                >
                  <div className="w-2 h-2 rounded-full bg-[#00D98A]" />
                  <div>
                    <div className="text-[11px] font-medium text-white max-w-[130px] truncate">{item.name}</div>
                    <div className="text-[9px] font-mono text-muted-foreground">{item.calories} kcal · {item.protein}g P</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Barcode Input */}
          <form onSubmit={handleManualSearch} className="flex gap-2">
            <div className="flex-1 flex items-center bg-[#1A1A22] rounded-xl px-3 border border-white/10">
              <Search size={14} className="text-muted-foreground mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Or enter barcode (e.g. 0888849000043)"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full bg-transparent text-white text-[12px] py-2.5 outline-none font-mono placeholder:text-muted-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !manualCode.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#00D98A] text-black text-[12px] font-semibold flex items-center gap-1 disabled:opacity-50 active:scale-95"
            >
              Lookup
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
