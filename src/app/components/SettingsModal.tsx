import { useState } from "react";
import {
  X,
  Heart,
  RefreshCw,
  Download,
  Check,
  Smartphone,
  RotateCcw,
  Sparkles,
  Info,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  FoodEntry,
  HealthSyncSettings,
  saveHealthSyncSettings,
  resetAllData,
  loadDemoData,
  Targets,
} from "../services/storageService";
import { exportAppleHealthCSV, syncToAppleHealth } from "../services/appleHealthService";
import { toast } from "sonner";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

interface SettingsModalProps {
  onClose: () => void;
  entries: FoodEntry[];
  currentDateKey: string;
  targets: Targets;
  healthSettings: HealthSyncSettings;
  onUpdateHealthSettings: (s: HealthSyncSettings) => void;
  onDataReload: () => void;
}

export default function SettingsModal({
  onClose,
  entries,
  currentDateKey,
  targets,
  healthSettings,
  onUpdateHealthSettings,
  onDataReload,
}: SettingsModalProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [showShortcutGuide, setShowShortcutGuide] = useState(false);

  const handleSyncHealth = async () => {
    setSyncing(true);
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // ignore
    }

    try {
      const res = await syncToAppleHealth(entries, currentDateKey, healthSettings);
      const updated = {
        ...healthSettings,
        lastSyncTimestamp: res.syncedTimestamp,
      };
      saveHealthSyncSettings(updated);
      onUpdateHealthSettings(updated);
      setSyncSuccess(true);
      toast.success("Apple Health Sync", {
        description: res.message,
      });
      setTimeout(() => setSyncSuccess(false), 2500);
    } catch (err) {
      toast.error("Sync Failed", {
        description: "Could not trigger Apple Health sync.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleMetric = (key: keyof HealthSyncSettings) => {
    const updated = { ...healthSettings, [key]: !healthSettings[key] };
    saveHealthSyncSettings(updated);
    onUpdateHealthSettings(updated);
  };

  const handleExportCSV = () => {
    exportAppleHealthCSV(entries, currentDateKey);
    toast.success("Apple Health CSV Exported", {
      description: "Downloaded format compatible with Apple Health & Health CSV import.",
    });
  };

  const handleLoadDemo = () => {
    loadDemoData();
    onDataReload();
    toast.success("Demo Data Loaded", {
      description: "Populated 7 days of realistic nutrition history for analytics.",
    });
  };

  const handleResetData = () => {
    if (confirm("Reset all logged entries and restore defaults?")) {
      resetAllData();
      onDataReload();
      toast.info("Data Reset", {
        description: "All custom food entries have been cleared.",
      });
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-[#0A0A0C] flex flex-col justify-between overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0 border-b border-white/10">
        <span className="text-[16px] font-medium text-white" style={{ fontFamily: "Inter, sans-serif" }}>
          Settings & Health Integration
        </span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>
        {/* Apple Health Card */}
        <div className="rounded-2xl p-4 bg-[#141418] border border-white/10 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#FF2D55]/20 flex items-center justify-center text-[#FF2D55]">
                <Heart size={18} />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-white">Apple HealthKit</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {healthSettings.lastSyncTimestamp
                    ? `Last synced: ${new Date(healthSettings.lastSyncTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : "Not synced yet"}
                </div>
              </div>
            </div>
            <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-md bg-[#00D98A]/15 text-[#00D98A] border border-[#00D98A]/30">
              Active
            </span>
          </div>

          <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
            Automatically record your daily calories, protein, carbs, and fat into the Apple Health app.
          </p>

          {/* Sync Button */}
          <button
            onClick={handleSyncHealth}
            disabled={syncing}
            className={`w-full py-3.5 rounded-xl font-medium text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              syncSuccess
                ? "bg-[#00D98A]/20 text-[#00D98A] border border-[#00D98A]/40"
                : "bg-[#FF2D55] text-white shadow-[0_0_20px_rgba(255,45,85,0.3)]"
            }`}
          >
            {syncing ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Syncing to Apple Health...
              </>
            ) : syncSuccess ? (
              <>
                <Check size={16} />
                Synced to Apple Health!
              </>
            ) : (
              <>
                <Heart size={16} />
                Sync Today's Macros to Apple Health
              </>
            )}
          </button>

          {/* Metric sync toggles */}
          <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
            <div className="text-[10px] tracking-wider uppercase text-muted-foreground font-medium mb-1">
              Metrics to Sync
            </div>
            {[
              { key: "syncCalories", label: "Active Energy (Calories)", color: "#00D98A" },
              { key: "syncProtein", label: "Dietary Protein", color: "#4DA6FF" },
              { key: "syncCarbs", label: "Dietary Carbohydrates", color: "#FFB84D" },
              { key: "syncFat", label: "Dietary Total Fat", color: "#FF6B6B" },
            ].map(({ key, label, color }) => (
              <div key={key} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[12px] text-white">{label}</span>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(healthSettings[key as keyof HealthSyncSettings])}
                  onChange={() => handleToggleMetric(key as keyof HealthSyncSettings)}
                  className="w-4 h-4 rounded accent-[#00D98A] cursor-pointer"
                />
              </div>
            ))}
          </div>

          {/* Export CSV action */}
          <div className="mt-4 pt-3 border-t border-white/10 flex gap-2">
            <button
              onClick={handleExportCSV}
              className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Download size={14} />
              Export Health CSV
            </button>
            <button
              onClick={() => setShowShortcutGuide(!showShortcutGuide)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Smartphone size={14} />
              Shortcut Guide
            </button>
          </div>

          {/* Apple Shortcut Guide */}
          {showShortcutGuide && (
            <div className="mt-3 p-3 rounded-xl bg-[#1A1A22] border border-white/10 text-[11px] text-muted-foreground space-y-2">
              <div className="flex items-center gap-1.5 text-white font-medium">
                <Info size={14} className="text-[#00D98A]" />
                How Apple Shortcuts Sync Works
              </div>
              <p>
                When you tap <strong>Sync Today's Macros</strong>, LogiCal calls the native iOS HealthKit engine on your device (or triggers the <code>LogiCal Sync</code> iOS Shortcut when testing on web/Safari).
              </p>
              <div className="p-2 rounded bg-black/40 font-mono text-[10px] text-white/90">
                1. Tap 'Sync Today's Macros'<br />
                2. iOS records Active Energy, Protein, Carbs, & Fat<br />
                3. Check the Apple Health app under Nutrition!
              </div>
            </div>
          )}
        </div>

        {/* Active Daily Targets Summary */}
        <div className="rounded-2xl p-4 bg-[#141418] border border-white/10">
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
            Current Daily Targets
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2 rounded-xl bg-white/5">
              <div className="text-[9px] uppercase text-muted-foreground">Calories</div>
              <div className="text-[15px] font-mono font-bold text-[#00D98A]">{targets.calories}</div>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <div className="text-[9px] uppercase text-muted-foreground">Protein</div>
              <div className="text-[14px] font-mono font-semibold text-[#4DA6FF]">{targets.protein}g</div>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <div className="text-[9px] uppercase text-muted-foreground">Carbs</div>
              <div className="text-[14px] font-mono font-semibold text-[#FFB84D]">{targets.carbs}g</div>
            </div>
            <div className="p-2 rounded-xl bg-white/5">
              <div className="text-[9px] uppercase text-muted-foreground">Fat</div>
              <div className="text-[14px] font-mono font-semibold text-[#FF6B6B]">{targets.fat}g</div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Change targets and calorie formulas anytime in the <strong>Goals</strong> tab.
          </p>
        </div>

        {/* Data Management Card */}
        <div className="rounded-2xl p-4 bg-[#141418] border border-white/10 space-y-3">
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
            Data Management
          </div>

          <button
            onClick={handleLoadDemo}
            className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[12px] font-medium flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#00D98A]" />
              <span>Load 7-Day Realistic History</span>
            </div>
            <ArrowRight size={14} className="text-muted-foreground" />
          </button>

          <button
            onClick={handleResetData}
            className="w-full py-2.5 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[12px] font-medium flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <RotateCcw size={14} />
              <span>Reset All Food Logs</span>
            </div>
            <ArrowRight size={14} className="text-red-400/60" />
          </button>
        </div>

        {/* About App */}
        <div className="text-center pt-2 pb-4">
          <div className="text-[12px] font-medium text-white">LogiCal Nutrition Tracker</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            Native iOS & Web · Powered by Capacitor
          </div>
        </div>
      </div>
    </div>
  );
}

