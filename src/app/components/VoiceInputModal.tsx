import { useEffect, useState } from "react";
import { Mic, X, Check, Volume2, AlertCircle } from "lucide-react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

interface VoiceInputModalProps {
  onClose: () => void;
  onVoiceResult: (transcript: string) => void;
}

export default function VoiceInputModal({ onClose, onVoiceResult }: VoiceInputModalProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Check for Web Speech API
    // @ts-expect-error - Web Speech API prefixing
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMsg("Speech recognition is not supported in this browser. You can tap one of the suggested voice commands below.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const text = event.results[current][0].transcript;
        setTranscript(text);
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setErrorMsg("Microphone access was denied. Please allow microphone permissions or pick a phrase below.");
        } else {
          setErrorMsg(`Voice input: ${event.error}`);
        }
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.start();

      return () => {
        try {
          recognition.stop();
        } catch {
          // ignore
        }
      };
    } catch (err) {
      setErrorMsg("Failed to start voice recognition.");
    }
  }, []);

  const handleConfirm = () => {
    if (transcript.trim()) {
      try {
        Haptics.impact({ style: ImpactStyle.Medium });
      } catch {
        // ignore
      }
      onVoiceResult(transcript.trim());
      onClose();
    }
  };

  const handlePickPreset = (phrase: string) => {
    try {
      Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // ignore
    }
    onVoiceResult(phrase);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0A0A0C]/95 backdrop-blur-md flex flex-col justify-end">
      <div className="rounded-t-3xl bg-[#141418] border-t border-white/10 p-6 flex flex-col items-center text-center">
        {/* Close */}
        <div className="w-full flex justify-end mb-2">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white"
          >
            <X size={16} />
          </button>
        </div>

        {/* Animated Microphone */}
        <div className="relative mb-6">
          {listening && (
            <div className="absolute -inset-4 rounded-full bg-[#00D98A]/20 animate-ping" />
          )}
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              listening
                ? "bg-[#00D98A] text-black shadow-[0_0_40px_rgba(0,217,138,0.5)] scale-110"
                : "bg-white/10 text-white"
            }`}
          >
            <Mic size={32} />
          </div>
        </div>

        <h3 className="text-[17px] font-semibold text-white mb-1">
          {listening ? "Listening to your meal..." : "Voice Food Logging"}
        </h3>
        <p className="text-[12px] text-muted-foreground max-w-xs mb-4">
          Say what you ate, e.g. "3 eggs and sourdough toast" or "6oz chicken breast with rice"
        </p>

        {/* Transcript Box */}
        {transcript ? (
          <div className="w-full p-4 rounded-2xl bg-[#1A1A22] border border-[#00D98A]/30 mb-4 text-left">
            <div className="text-[10px] uppercase text-[#00D98A] font-mono mb-1">Heard:</div>
            <div className="text-[15px] font-medium text-white">{transcript}</div>
          </div>
        ) : null}

        {errorMsg && (
          <div className="w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] mb-4 flex items-start gap-2 text-left">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Button */}
        {transcript ? (
          <button
            onClick={handleConfirm}
            className="w-full py-3.5 rounded-xl bg-[#00D98A] text-black font-semibold text-[14px] flex items-center justify-center gap-2 mb-4 active:scale-95"
          >
            <Check size={18} />
            Parse & Log Meal
          </button>
        ) : null}

        {/* Sample Voice Commands */}
        <div className="w-full border-t border-white/10 pt-4 text-left">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1.5">
            <Volume2 size={12} />
            Try Saying Or Tap To Test
          </div>
          <div className="space-y-1.5">
            {[
              "3 eggs and sourdough toast",
              "Grilled chicken breast with 1 cup brown rice",
              "Whey protein shake with banana",
              "500 cal 45p 50c 10f",
            ].map((phrase) => (
              <button
                key={phrase}
                onClick={() => handlePickPreset(phrase)}
                className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-[12px] font-medium border border-white/5 transition-colors"
              >
                "{phrase}"
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
