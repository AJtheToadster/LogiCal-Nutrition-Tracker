import { useState, useEffect } from "react";
import {
  Settings,
  ChevronLeft,
  ChevronRight,
  Mic,
  Scan,
  LayoutDashboard,
  BarChart2,
  Target,
  Trash2,
  Check,
  Heart,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

import {
  FoodEntry,
  MealPeriod,
  Phase,
  Targets,
  HealthSyncSettings,
  formatDateKey,
  formatDisplayDate,
  getEntriesForDate,
  saveEntry,
  deleteEntry,
  getDailyTotals,
  getAnalyticsData,
  getTargets,
  saveTargets,
  getHealthSyncSettings,
  saveHealthSyncSettings,
} from "./services/storageService";
import { syncToAppleHealth } from "./services/appleHealthService";
import { parseFoodNaturalLanguage } from "./services/foodParserService";

import BarcodeScannerModal from "./components/BarcodeScannerModal";
import SettingsModal from "./components/SettingsModal";
import VoiceInputModal from "./components/VoiceInputModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = "dashboard" | "goals" | "analytics";

interface ModalMacros {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize?: string;
  time: MealPeriod;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MacroBar({
  label,
  current,
  target,
  color,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
}) {
  const pct = clamp((current / (target || 1)) * 100, 0, 100);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-baseline mb-1">
        <span
          className="text-[10px] tracking-widest uppercase text-muted-foreground font-medium"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          {label}
        </span>
      </div>
      <div
        className="text-[11px] font-mono font-medium text-foreground mb-2"
        style={{ fontFamily: "DM Mono, monospace" }}
      >
        {current}
        <span className="text-muted-foreground font-light">/{target}g</span>
      </div>
      <div className="h-[3px] bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  onDelete,
}: {
  entry: FoodEntry;
  onDelete: (id: number) => void;
}) {
  const [swiped, setSwiped] = useState(false);

  return (
    <div
      className="relative overflow-hidden group"
      onMouseEnter={() => setSwiped(true)}
      onMouseLeave={() => setSwiped(false)}
      onClick={() => setSwiped((s) => !s)}
    >
      <div
        className="flex items-center justify-between py-3 px-4 transition-transform duration-200"
        style={{ transform: swiped ? "translateX(-52px)" : "translateX(0)" }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div
            className="text-[13px] text-foreground leading-tight truncate"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {entry.name}
          </div>
          <div
            className="text-[11px] text-muted-foreground mt-0.5 font-mono"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            P{entry.protein} · C{entry.carbs} · F{entry.fat}
            {entry.servingSize && ` · ${entry.servingSize}`}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="text-[15px] font-mono font-medium text-foreground"
            style={{ fontFamily: "DM Mono, monospace" }}
          >
            {entry.calories}
          </div>
          <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
            kcal
          </div>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.id);
        }}
        className="absolute right-0 top-0 bottom-0 w-[52px] flex items-center justify-center bg-destructive transition-opacity duration-200"
        style={{ opacity: swiped ? 1 : 0 }}
        aria-label="Delete entry"
      >
        <Trash2 size={14} className="text-white" />
      </button>
    </div>
  );
}

function TimelineGroup({
  label,
  entries,
  onDelete,
}: {
  label: string;
  entries: FoodEntry[];
  onDelete: (id: number) => void;
}) {
  const groupCals = entries.reduce((a, e) => a + (Number(e.calories) || 0), 0);
  if (entries.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-4 py-2">
        <span
          className="text-[10px] tracking-widest uppercase text-muted-foreground font-medium"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          {label}
        </span>
        <span
          className="text-[11px] font-mono text-muted-foreground"
          style={{ fontFamily: "DM Mono, monospace" }}
        >
          {groupCals} kcal
        </span>
      </div>
      <div className="border border-border rounded-lg overflow-hidden mx-4">
        {entries.map((entry, i) => (
          <div key={entry.id}>
            {i > 0 && <div className="h-px bg-border mx-4" />}
            <EntryRow entry={entry} onDelete={onDelete} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Entry Modal ──────────────────────────────────────────────────────────────

const PERIOD_LABELS: { key: MealPeriod; label: string; hint: string }[] = [
  { key: "morning", label: "Morning", hint: "6am–12pm" },
  { key: "afternoon", label: "Afternoon", hint: "12–5pm" },
  { key: "evening", label: "Evening", hint: "5pm+" },
];

function EntryModal({
  initialData,
  onClose,
  onLog,
}: {
  initialData: ModalMacros;
  onClose: () => void;
  onLog: (data: ModalMacros) => void;
}) {
  const [data, setData] = useState<ModalMacros>(initialData);

  const updateMacro = (key: keyof Omit<ModalMacros, "name" | "time" | "servingSize">, val: string) => {
    const n = parseInt(val, 10) || 0;
    setData((prev) => ({ ...prev, [key]: n }));
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        style={{ background: "#1A1A22", borderTop: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-muted" />
        </div>

        <div className="px-4 pt-2 pb-6">
          {/* Food name */}
          <div className="mb-4">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground mb-1"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Food Item
            </div>
            <input
              type="text"
              value={data.name}
              onChange={(e) => setData((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full bg-[#252530] text-foreground text-[14px] font-medium px-3 py-2 rounded-xl outline-none border border-white/5"
              style={{ fontFamily: "Inter, sans-serif" }}
            />
          </div>

          {/* Meal period selector */}
          <div className="mb-4">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground mb-2"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Add to
            </div>
            <div className="flex gap-2">
              {PERIOD_LABELS.map(({ key, label, hint }) => {
                const active = data.time === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setData((prev) => ({ ...prev, time: key }))}
                    className="flex-1 flex flex-col items-center py-2 rounded-xl transition-all duration-150"
                    style={{
                      background: active ? "rgba(0,217,138,0.12)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${active ? "rgba(0,217,138,0.35)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <span
                      className="text-[12px] font-medium"
                      style={{ fontFamily: "Inter, sans-serif", color: active ? "#00D98A" : "#888899" }}
                    >
                      {label}
                    </span>
                    <span
                      className="text-[9px] mt-0.5"
                      style={{ fontFamily: "DM Mono, monospace", color: active ? "rgba(0,217,138,0.6)" : "#444455" }}
                    >
                      {hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-border mb-4" />

          {/* Calories hero */}
          <div className="flex items-baseline justify-between mb-3">
            <span
              className="text-[11px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Calories
            </span>
            <div className="rounded-md overflow-hidden" style={{ background: "#252530" }}>
              <input
                type="number"
                value={data.calories}
                onChange={(e) => updateMacro("calories", e.target.value)}
                className="w-24 text-right text-[22px] font-mono font-medium bg-transparent text-[#00D98A] px-2 py-1 outline-none"
                style={{ fontFamily: "DM Mono, monospace" }}
              />
            </div>
          </div>

          {/* Macro rows */}
          {(["protein", "carbs", "fat"] as const).map((key) => (
            <div key={key} className="flex items-center justify-between mb-3">
              <span
                className="text-[11px] tracking-widest uppercase text-muted-foreground capitalize"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {key}
              </span>
              <div className="flex items-center gap-2">
                <div className="rounded-md overflow-hidden" style={{ background: "#252530" }}>
                  <input
                    type="number"
                    value={data[key]}
                    onChange={(e) => updateMacro(key, e.target.value)}
                    className="w-16 text-right text-[15px] font-mono font-medium bg-transparent text-foreground px-2 py-1.5 outline-none"
                    style={{ fontFamily: "DM Mono, monospace" }}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground w-4" style={{ fontFamily: "DM Mono, monospace" }}>
                  g
                </span>
              </div>
            </div>
          ))}

          <div className="h-px bg-border mb-4" />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl border border-border text-foreground text-[14px] font-medium transition-colors active:opacity-70"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Cancel
            </button>
            <button
              onClick={() => onLog(data)}
              className="flex-[2] py-3.5 rounded-xl text-[14px] font-medium transition-colors active:opacity-80"
              style={{ background: "#00D98A", color: "#0A0A0C", fontFamily: "Inter, sans-serif" }}
            >
              Log to {PERIOD_LABELS.find((p) => p.key === data.time)?.label ?? data.time}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 1: Dashboard ──────────────────────────────────────────────────────

function DashboardScreen({
  entries,
  dateKey,
  targets,
  healthSettings,
  onPrevDate,
  onNextDate,
  onDeleteEntry,
  onLogEntry,
  onOpenScanner,
  onOpenVoice,
  onOpenSettings,
  onTabChange,
}: {
  entries: FoodEntry[];
  dateKey: string;
  targets: Targets;
  healthSettings: HealthSyncSettings;
  onPrevDate: () => void;
  onNextDate: () => void;
  onDeleteEntry: (id: number) => void;
  onLogEntry: (entry: ModalMacros) => void;
  onOpenScanner: () => void;
  onOpenVoice: () => void;
  onOpenSettings: () => void;
  onTabChange: (s: Screen) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<ModalMacros>({
    name: "Meal Entry",
    calories: 200,
    protein: 20,
    carbs: 25,
    fat: 5,
    time: "morning",
  });
  const [inputVal, setInputVal] = useState("");

  const totals = getDailyTotals(entries);
  const remaining = targets.calories - totals.calories;
  const calPct = clamp((totals.calories / (targets.calories || 1)) * 100, 0, 100);

  const displayDate = formatDisplayDate(dateKey);

  const handleInputSubmit = (text: string) => {
    if (!text.trim()) return;

    // Parse natural language or shorthand
    const parsed = parseFoodNaturalLanguage(text);
    const h = new Date().getHours();
    const period: MealPeriod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

    setModalData({
      name: parsed.name,
      calories: parsed.calories,
      protein: parsed.protein,
      carbs: parsed.carbs,
      fat: parsed.fat,
      time: period,
    });
    setShowModal(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleInputSubmit(inputVal);
    }
  };

  const morning = entries.filter((e) => e.time === "morning");
  const afternoon = entries.filter((e) => e.time === "afternoon");
  const evening = entries.filter((e) => e.time === "evening");

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevDate}
            className="p-1 text-muted-foreground active:text-foreground transition-colors"
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>
          <span
            className="text-[14px] font-medium text-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {displayDate}
          </span>
          <button
            onClick={onNextDate}
            className="p-1 text-muted-foreground active:text-foreground transition-colors"
            title="Next Day"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Apple Health quick sync status button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#FF2D55]/10 text-[#FF2D55] border border-[#FF2D55]/20 text-[10px] font-medium"
            title="Apple Health Status"
          >
            <Heart size={12} />
            <span>Health</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-1 text-muted-foreground active:text-foreground transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Summary card */}
      <div
        className="mx-4 rounded-2xl p-4 mb-4 shrink-0 shadow-sm"
        style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div
              className="text-[11px] tracking-widest uppercase text-muted-foreground mb-0.5"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Remaining
            </div>
            <div
              className="text-[32px] font-mono font-medium leading-none"
              style={{
                fontFamily: "DM Mono, monospace",
                color: remaining < 0 ? "#FF4455" : "#00D98A",
              }}
            >
              {remaining < 0 ? "-" : ""}
              {Math.abs(remaining)}
            </div>
            <div
              className="text-[11px] text-muted-foreground mt-0.5"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {totals.calories}{" "}
              <span className="text-muted-foreground font-light">/ {targets.calories} kcal</span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground mb-1"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Goal
            </div>
            <div
              className="text-[13px] font-mono text-foreground"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {targets.calories}
            </div>
            <div className="text-[10px] text-muted-foreground" style={{ fontFamily: "Inter, sans-serif" }}>
              kcal / day
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[5px] rounded-full overflow-hidden mb-4" style={{ background: "#252530" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${calPct}%`,
              background:
                calPct >= 100 ? "#FF4455" : "linear-gradient(90deg, #00D98A 0%, #00BF7A 100%)",
            }}
          />
        </div>

        {/* Macro split */}
        <div className="flex gap-4">
          <MacroBar label="Protein" current={totals.protein} target={targets.protein} color="#4DA6FF" />
          <div className="w-px bg-border" />
          <MacroBar label="Carbs" current={totals.carbs} target={targets.carbs} color="#FFB84D" />
          <div className="w-px bg-border" />
          <MacroBar label="Fat" current={totals.fat} target={targets.fat} color="#FF6B6B" />
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {entries.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
              <LayoutDashboard size={20} />
            </div>
            <div className="text-[14px] font-medium text-foreground mb-1">No meals logged yet</div>
            <div className="text-[12px] text-muted-foreground max-w-xs mx-auto">
              Scan a barcode, use voice logging, or type a meal below to start tracking.
            </div>
          </div>
        ) : (
          <>
            <TimelineGroup label="Morning" entries={morning} onDelete={onDeleteEntry} />
            <TimelineGroup label="Afternoon" entries={afternoon} onDelete={onDeleteEntry} />
            <TimelineGroup label="Evening" entries={evening} onDelete={onDeleteEntry} />
          </>
        )}
        <div className="h-4" />
      </div>

      {/* Entry bar */}
      <div
        className="px-4 pt-2 pb-2 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#1A1A22" }}>
          <input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type '3 eggs and sourdough toast' or quick-add..."
            className="flex-1 bg-transparent text-foreground text-[13px] outline-none placeholder:text-muted-foreground min-w-0"
            style={{ fontFamily: "Inter, sans-serif" }}
          />
          <button
            onClick={onOpenVoice}
            className="text-muted-foreground hover:text-[#00D98A] transition-colors shrink-0 ml-1 p-1"
            title="Voice food logging"
          >
            <Mic size={18} />
          </button>
          <button
            onClick={onOpenScanner}
            className="text-muted-foreground hover:text-[#00D98A] transition-colors shrink-0 p-1"
            title="Scan barcode"
          >
            <Scan size={18} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center px-4 pb-8 pt-2 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("dashboard")}
        >
          <LayoutDashboard size={20} style={{ color: "#00D98A" }} />
          <span
            className="text-[9px] tracking-wider uppercase"
            style={{ color: "#00D98A", fontFamily: "Inter, sans-serif" }}
          >
            Log
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("analytics")}
        >
          <BarChart2 size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Analytics
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("goals")}
        >
          <Target size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Goals
          </span>
        </button>
      </div>

      {/* Modal overlay */}
      {showModal && (
        <EntryModal
          initialData={modalData}
          onClose={() => setShowModal(false)}
          onLog={(item) => {
            onLogEntry(item);
            setShowModal(false);
            setInputVal("");
          }}
        />
      )}
    </div>
  );
}

// ─── Screen 2: Goal Setup ─────────────────────────────────────────────────────

function GoalsScreen({
  targets,
  onSaveTargets,
  onTabChange,
}: {
  targets: Targets;
  onSaveTargets: (t: Targets) => void;
  onTabChange: (s: Screen) => void;
}) {
  const [phase, setPhase] = useState<Phase>(targets.phase);
  const [weeklyRate, setWeeklyRate] = useState(targets.weeklyRate);
  const [protein, setProtein] = useState(targets.protein);
  const [carbs, setCarbs] = useState(targets.carbs);
  const [fat, setFat] = useState(targets.fat);
  const [proteinLocked, setProteinLocked] = useState(targets.proteinLocked);
  const [saved, setSaved] = useState(false);

  const baseCalories = {
    cut: Math.round(2800 - weeklyRate * 500),
    recomp: 2800,
    bulk: Math.round(2800 + weeklyRate * 250),
  }[phase];

  const totalMacroCals = protein * 4 + carbs * 4 + fat * 9;

  const handleCarbChange = (val: number) => {
    setCarbs(val);
    if (!proteinLocked) {
      const remaining = Math.round((baseCalories - val * 4 - fat * 9) / 4);
      setProtein(clamp(remaining, 100, 350));
    }
  };

  const handleFatChange = (val: number) => {
    setFat(val);
    if (!proteinLocked) {
      const remaining = Math.round((baseCalories - carbs * 4 - val * 9) / 4);
      setProtein(clamp(remaining, 100, 350));
    }
  };

  const handleSave = () => {
    try {
      Haptics.impact({ style: ImpactStyle.Heavy });
    } catch {
      // ignore
    }
    const updated: Targets = {
      phase,
      weeklyRate,
      calories: baseCalories,
      protein,
      carbs,
      fat,
      proteinLocked,
    };
    onSaveTargets(updated);
    setSaved(true);
    toast.success("Fitness Targets Updated", {
      description: `Daily calorie goal set to ${baseCalories} kcal (${protein}P · ${carbs}C · ${fat}F)`,
    });
    setTimeout(() => setSaved(false), 2000);
  };

  const phaseLabels: { key: Phase; label: string; sub: string }[] = [
    { key: "cut", label: "Cut", sub: "Fat Loss" },
    { key: "recomp", label: "Recomp", sub: "Maintain" },
    { key: "bulk", label: "Bulk", sub: "Muscle" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-center px-4 pt-12 pb-4 shrink-0">
        <span
          className="text-[16px] font-medium text-foreground"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Fitness Strategy & Targets
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "none" }}>
        {/* Phase toggle */}
        <div
          className="rounded-xl overflow-hidden mb-6"
          style={{
            background: "#141418",
            border: "1px solid rgba(255,255,255,0.07)",
            padding: "4px",
          }}
        >
          <div className="grid grid-cols-3 gap-1">
            {phaseLabels.map(({ key, label, sub }) => (
              <button
                key={key}
                onClick={() => setPhase(key)}
                className="py-2.5 rounded-lg transition-all duration-200 flex flex-col items-center"
                style={{
                  background: phase === key ? "#00D98A" : "transparent",
                  color: phase === key ? "#0A0A0C" : "#666678",
                }}
              >
                <span className="text-[12px] font-medium" style={{ fontFamily: "Inter, sans-serif" }}>
                  {label}
                </span>
                <span
                  className="text-[9px] tracking-wider uppercase mt-0.5"
                  style={{ fontFamily: "Inter, sans-serif", opacity: 0.7 }}
                >
                  {sub}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Rate slider */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Weekly Rate
            </div>
            <div
              className="text-[11px] font-mono text-muted-foreground"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {phase === "cut" ? "-" : "+"}
              {weeklyRate} lbs/wk
            </div>
          </div>

          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={weeklyRate}
            onChange={(e) => setWeeklyRate(parseFloat(e.target.value))}
            className="w-full mb-4 cursor-pointer"
            style={{ accentColor: "#00D98A" }}
          />

          <div className="text-center">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground mb-1"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Calculated Target
            </div>
            <div
              className="text-[36px] font-mono font-medium leading-none"
              style={{ fontFamily: "DM Mono, monospace", color: "#00D98A" }}
            >
              {baseCalories.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1" style={{ fontFamily: "Inter, sans-serif" }}>
              kcal / day
            </div>
          </div>
        </div>

        {/* Macro overrides */}
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Fine-Tune Macros
            </div>
            <div
              className="text-[11px] font-mono text-muted-foreground"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {totalMacroCals} <span className="text-muted-foreground opacity-60">/ {baseCalories} kcal</span>
            </div>
          </div>

          {/* Protein row */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <div
                  className="text-[11px] tracking-widest uppercase text-muted-foreground"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  Protein
                </div>
                <button
                  onClick={() => setProteinLocked((l) => !l)}
                  className="text-[9px] px-1.5 py-0.5 rounded transition-all duration-150"
                  style={{
                    fontFamily: "Inter, sans-serif",
                    background: proteinLocked ? "rgba(0,217,138,0.15)" : "rgba(255,255,255,0.06)",
                    color: proteinLocked ? "#00D98A" : "#666678",
                    border: `1px solid ${proteinLocked ? "rgba(0,217,138,0.3)" : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  {proteinLocked ? "LOCKED" : "LOCK"}
                </button>
              </div>
              <span
                className="text-[15px] font-mono font-medium text-foreground"
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                {protein}g
              </span>
            </div>
            <input
              type="range"
              min={80}
              max={350}
              step={5}
              value={protein}
              onChange={(e) => setProtein(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#4DA6FF" }}
              disabled={!proteinLocked}
            />
          </div>

          {/* Carbs row */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <div
                className="text-[11px] tracking-widest uppercase text-muted-foreground"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Carbohydrates
              </div>
              <span
                className="text-[15px] font-mono font-medium text-foreground"
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                {carbs}g
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={400}
              step={5}
              value={carbs}
              onChange={(e) => handleCarbChange(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#FFB84D" }}
            />
          </div>

          {/* Fat row */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div
                className="text-[11px] tracking-widest uppercase text-muted-foreground"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Fats
              </div>
              <span
                className="text-[15px] font-mono font-medium text-foreground"
                style={{ fontFamily: "DM Mono, monospace" }}
              >
                {fat}g
              </span>
            </div>
            <input
              type="range"
              min={25}
              max={150}
              step={5}
              value={fat}
              onChange={(e) => handleFatChange(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer"
              style={{ accentColor: "#FF6B6B" }}
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div
        className="px-4 pt-2 pb-10 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={handleSave}
          className="w-full py-4 rounded-xl text-[14px] font-medium flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.98]"
          style={{
            background: saved ? "rgba(0,217,138,0.15)" : "#00D98A",
            color: saved ? "#00D98A" : "#0A0A0C",
            border: saved ? "1px solid rgba(0,217,138,0.3)" : "none",
            fontFamily: "Inter, sans-serif",
          }}
        >
          {saved ? (
            <>
              <Check size={16} />
              Targets Updated
            </>
          ) : (
            "Save & Update Targets"
          )}
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center px-4 pb-8 pt-2 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("dashboard")}
        >
          <LayoutDashboard size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Log
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("analytics")}
        >
          <BarChart2 size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Analytics
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("goals")}
        >
          <Target size={20} style={{ color: "#00D98A" }} />
          <span
            className="text-[9px] tracking-wider uppercase"
            style={{ color: "#00D98A", fontFamily: "Inter, sans-serif" }}
          >
            Goals
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Screen 3: Analytics (Real Live User Data) ────────────────────────────────

type TimeFrame = "7d" | "30d";
type DataKey = "cals" | "protein" | "carbs" | "fat";

function isOnTarget(val: number, target: number) {
  if (val === 0 || !target) return false;
  return Math.abs(val - target) / target <= 0.1;
}

function AnalyticsScreen({
  targets,
  onTabChange,
}: {
  targets: Targets;
  onTabChange: (s: Screen) => void;
}) {
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("7d");
  const [goalAlerts, setGoalAlerts] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const daysCount = timeFrame === "30d" ? 30 : 7;
  const data = getAnalyticsData(daysCount);

  const maxCal = timeFrame === "30d" ? 3200 : 3000;
  const targetLineY = (targets.calories / maxCal) * 100;

  const activeDays = data.filter((d) => d.logged);
  const missedCount = data.filter((d) => !d.logged).length;

  const selectedDay = selectedIdx !== null ? data[selectedIdx] : null;

  const avg = (key: DataKey) => {
    const vals = activeDays.map((d) => d[key] as number);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };

  const metDays = (key: DataKey, target: number) =>
    activeDays.filter((d) => isOnTarget(d[key] as number, target)).length;

  const fluctuation = (key: DataKey) => {
    const vals = activeDays.map((d) => d[key] as number).filter(Boolean);
    if (!vals.length) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const pctDiffs = vals.map((v) => Math.abs((v - mean) / mean) * 100);
    return Math.round(pctDiffs.reduce((a, b) => a + b, 0) / pctDiffs.length);
  };

  const displayVal = (key: DataKey) =>
    selectedDay ? (selectedDay[key] as number) : avg(key);

  const periodLabel = timeFrame === "7d" ? "Past 7 Days" : "Past 30 Days";

  const macroRows: { label: string; key: DataKey; unit: string; color: string; target: number }[] = [
    { label: "Calories", key: "cals", unit: "kcal", color: "#00D98A", target: targets.calories },
    { label: "Protein", key: "protein", unit: "g", color: "#4DA6FF", target: targets.protein },
    { label: "Carbs", key: "carbs", unit: "g", color: "#FFB84D", target: targets.carbs },
    { label: "Fat", key: "fat", unit: "g", color: "#FF6B6B", target: targets.fat },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 shrink-0">
        <div
          className="text-[11px] tracking-widest uppercase text-muted-foreground mb-3"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          Macro Trends & Insights
        </div>
        {/* Time frame segmented control */}
        <div className="flex rounded-xl overflow-hidden p-[3px]" style={{ background: "#1A1A22" }}>
          {(["7d", "30d"] as TimeFrame[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTimeFrame(t);
                setSelectedIdx(null);
              }}
              className="flex-1 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150"
              style={{
                fontFamily: "Inter, sans-serif",
                background: timeFrame === t ? "#00D98A" : "transparent",
                color: timeFrame === t ? "#0A0A0C" : "#666678",
              }}
            >
              {t === "7d" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "none" }}>
        {/* Bar chart card */}
        <div
          className="rounded-2xl p-4 mb-3"
          style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Calories — {periodLabel}
            </div>
            {/* Goal alerts toggle */}
            <button
              onClick={() => setGoalAlerts((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all duration-150"
              style={{
                background: goalAlerts ? "rgba(0,217,138,0.12)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${goalAlerts ? "rgba(0,217,138,0.25)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{ background: goalAlerts ? "#00D98A" : "#444455" }}
              />
              <span
                className="text-[9px] tracking-wider uppercase"
                style={{
                  fontFamily: "Inter, sans-serif",
                  color: goalAlerts ? "#00D98A" : "#555566",
                }}
              >
                Goal Alerts
              </span>
            </button>
          </div>

          {/* Chart area with target line overlay */}
          <div className="relative" style={{ height: 96 }}>
            {/* Target dashed line */}
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                bottom: `${clamp(targetLineY, 5, 95)}%`,
                borderTop: "1.5px dashed rgba(255,255,255,0.35)",
                zIndex: 2,
              }}
            />

            {/* Bars */}
            <div className="absolute inset-0 flex items-end gap-1.5">
              {data.map((d, i) => {
                const pct = d.logged ? clamp((d.cals / maxCal) * 100, 4, 100) : 4;
                const onTarget = isOnTarget(d.cals, targets.calories);
                const overMiss = goalAlerts && d.logged && !onTarget;
                const isSelected = selectedIdx === i;

                let barBg: string;
                if (!d.logged) {
                  barBg = "rgba(255,255,255,0.06)";
                } else if (isSelected) {
                  barBg = "#00D98A";
                } else if (overMiss) {
                  barBg = d.cals > targets.calories ? "#FF6B6B" : "#4DA6FF";
                } else if (onTarget) {
                  barBg = "rgba(0,217,138,0.75)";
                } else {
                  barBg =
                    "linear-gradient(180deg, rgba(0,217,138,0.45) 0%, rgba(0,217,138,0.2) 100%)";
                }

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                    className="flex-1 flex flex-col justify-end rounded-t-sm transition-all duration-200 focus:outline-none"
                    style={{
                      height: "100%",
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                    aria-label={`${d.day}: ${d.cals} kcal`}
                  >
                    <div
                      className="w-full rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${pct}%`,
                        background: barBg,
                        boxShadow: isSelected ? "0 0 0 1.5px #00D98A" : "none",
                        opacity: !d.logged ? 0.4 : 1,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Day labels */}
          <div className="flex gap-1.5 mt-2">
            {data.map((d, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[8px] transition-colors"
                style={{
                  fontFamily: "DM Mono, monospace",
                  color: selectedIdx === i ? "#00D98A" : d.logged ? "#444455" : "#2A2A38",
                }}
              >
                {timeFrame === "30d" ? (parseInt(d.day, 10) % 5 === 0 ? d.day : "") : d.day}
              </div>
            ))}
          </div>

          {/* Target legend */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1" style={{ borderTop: "1.5px dashed rgba(255,255,255,0.25)" }} />
            <span
              className="text-[9px] font-mono text-muted-foreground"
              style={{ fontFamily: "DM Mono, monospace" }}
            >
              {targets.calories.toLocaleString()} target
            </span>
          </div>

          {selectedDay && (
            <div
              className="mt-3 px-3 py-2 rounded-lg"
              style={{
                background: "rgba(0,217,138,0.07)",
                border: "1px solid rgba(0,217,138,0.15)",
              }}
            >
              <div
                className="text-[10px] font-mono"
                style={{ fontFamily: "DM Mono, monospace", color: "#00D98A" }}
              >
                {selectedDay.date} ·{" "}
                {selectedDay.logged
                  ? `${selectedDay.cals.toLocaleString()} kcal logged (${selectedDay.protein}P · ${selectedDay.carbs}C · ${selectedDay.fat}F)`
                  : "No meal logged for this date"}
              </div>
            </div>
          )}
        </div>

        {/* Averages card */}
        <div
          className="rounded-2xl p-4 mb-3"
          style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              {selectedDay
                ? `${selectedDay.date} — Detail`
                : `${timeFrame === "7d" ? "7" : "30"}-Day Averages`}
            </div>
            {!selectedDay && (
              <div
                className="text-[9px] text-muted-foreground"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {activeDays.length}/{data.length} days logged
              </div>
            )}
          </div>

          {macroRows.map((row) => {
            const val = displayVal(row.key);
            const met = metDays(row.key, row.target);
            const fluct = fluctuation(row.key);
            const onTgt = isOnTarget(val, row.target);
            return (
              <div
                key={row.label}
                className="flex items-center py-2.5 border-b border-border last:border-0 gap-2"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.color }} />
                <span
                  className="text-[12px] text-muted-foreground w-16 shrink-0"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  {row.label}
                </span>

                {/* Value */}
                <span
                  className="text-[15px] font-mono font-medium text-foreground flex-1"
                  style={{ fontFamily: "DM Mono, monospace" }}
                >
                  {val > 0 ? val.toLocaleString() : "—"}
                  <span className="text-[10px] text-muted-foreground font-light ml-0.5">{row.unit}</span>
                </span>

                {/* Consistency badge */}
                {!selectedDay && val > 0 && (
                  <div
                    className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                    style={{
                      fontFamily: "DM Mono, monospace",
                      background: onTgt ? "rgba(0,217,138,0.1)" : "rgba(255,255,255,0.05)",
                      color: onTgt ? "#00D98A" : "#555566",
                      border: `1px solid ${onTgt ? "rgba(0,217,138,0.2)" : "rgba(255,255,255,0.06)"}`,
                    }}
                  >
                    {row.key === "cals" ? `±${fluct}%` : `${met}/${activeDays.length}d`}
                  </div>
                )}

                {/* On-target dot for selected day */}
                {selectedDay && val > 0 && (
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: onTgt ? "#00D98A" : "rgba(255,255,255,0.12)" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Dynamic Trend Insights card */}
        <div
          className="rounded-2xl p-4"
          style={{ background: "#141418", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="text-[10px] tracking-widest uppercase text-muted-foreground"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              Trend Insights
            </div>
            <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          <div className="space-y-3">
            {missedCount > 0 && (
              <div className="flex gap-3">
                <div
                  className="w-1 rounded-full shrink-0 mt-1 self-stretch"
                  style={{ background: "rgba(255,255,255,0.12)" }}
                />
                <p
                  className="text-[12px] leading-relaxed text-muted-foreground"
                  style={{ fontFamily: "Inter, sans-serif" }}
                >
                  You have{" "}
                  <span className="text-foreground font-medium">
                    {missedCount} unlogged day{missedCount > 1 ? "s" : ""}
                  </span>{" "}
                  this period. Your average protein across active days is{" "}
                  <span className="text-foreground font-medium">{avg("protein")}g</span>.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <div
                className="w-1 rounded-full shrink-0 mt-1 self-stretch"
                style={{ background: "rgba(0,217,138,0.35)" }}
              />
              <p
                className="text-[12px] leading-relaxed text-muted-foreground"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Calorie variance is{" "}
                <span className="text-foreground font-medium">±{fluctuation("cals")}%</span>.{" "}
                {fluctuation("cals") < 10
                  ? "Consistency is strong and tightly aligned with your goals."
                  : "Daily intake varies slightly—aim to keep meals predictable."}
              </p>
            </div>

            <div className="flex gap-3">
              <div
                className="w-1 rounded-full shrink-0 mt-1 self-stretch"
                style={{ background: "rgba(77,166,255,0.35)" }}
              />
              <p
                className="text-[12px] leading-relaxed text-muted-foreground"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                Protein hit target on{" "}
                <span className="text-foreground font-medium">
                  {metDays("protein", targets.protein)}/{activeDays.length || 1} logged days
                </span>
                .{" "}
                {metDays("protein", targets.protein) >= (activeDays.length || 1) * 0.7
                  ? "Your muscle-maintenance and protein synthesis goals are on track."
                  : "Consider adding a mid-day protein source like Greek yogurt or a whey shake."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex items-center px-4 pb-8 pt-2 shrink-0"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("dashboard")}
        >
          <LayoutDashboard size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Log
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("analytics")}
        >
          <BarChart2 size={20} style={{ color: "#00D98A" }} />
          <span
            className="text-[9px] tracking-wider uppercase"
            style={{ color: "#00D98A", fontFamily: "Inter, sans-serif" }}
          >
            Analytics
          </span>
        </button>
        <button
          className="flex-1 flex flex-col items-center gap-1 py-1"
          onClick={() => onTabChange("goals")}
        >
          <Target size={20} className="text-muted-foreground" />
          <span
            className="text-[9px] tracking-wider uppercase text-muted-foreground"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Goals
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [dateKey, setDateKey] = useState<string>(() => formatDateKey(new Date()));
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [targets, setTargets] = useState<Targets>(getTargets);
  const [healthSettings, setHealthSettings] = useState<HealthSyncSettings>(getHealthSyncSettings);

  // Modals
  const [showScanner, setShowScanner] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load entries when dateKey changes
  useEffect(() => {
    setEntries(getEntriesForDate(dateKey));
  }, [dateKey]);

  const reloadData = () => {
    setEntries(getEntriesForDate(dateKey));
    setTargets(getTargets());
    setHealthSettings(getHealthSyncSettings());
  };

  const handlePrevDate = () => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() - 1);
    setDateKey(formatDateKey(date));
  };

  const handleNextDate = () => {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    setDateKey(formatDateKey(date));
  };

  const handleDeleteEntry = (id: number) => {
    const deleted = deleteEntry(dateKey, id);
    if (deleted) {
      setEntries(getEntriesForDate(dateKey));
      toast("Meal deleted", {
        description: deleted.name,
        action: {
          label: "Undo",
          onClick: () => {
            saveEntry(dateKey, deleted);
            setEntries(getEntriesForDate(dateKey));
          },
        },
      });
    }
  };

  const handleLogEntry = (item: ModalMacros) => {
    saveEntry(dateKey, {
      name: item.name,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      time: item.time,
      servingSize: item.servingSize,
    });
    setEntries(getEntriesForDate(dateKey));

    try {
      Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // ignore
    }

    toast.success("Meal Logged", {
      description: `${item.name} (${item.calories} kcal)`,
    });

    // Auto-sync to Apple Health if enabled
    if (healthSettings.autoSync) {
      const currentEntries = getEntriesForDate(dateKey);
      syncToAppleHealth(currentEntries, dateKey, healthSettings);
    }
  };

  const handleSaveTargets = (newTargets: Targets) => {
    saveTargets(newTargets);
    setTargets(newTargets);
  };

  return (
    <div className="min-h-screen bg-[#070709] flex items-center justify-center p-0 sm:p-6 select-none">
      <Toaster position="top-center" richColors theme="dark" />

      {/* Phone shell / Responsive mobile container */}
      <div
        className="relative overflow-hidden w-full h-full sm:w-[390px] sm:h-[844px] sm:rounded-[50px] bg-[#0A0A0C] shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_40px_80px_rgba(0,0,0,0.7),0_0_0_8px_#111115,0_0_0_9px_rgba(255,255,255,0.06)]"
      >
        {/* Notch - only on desktop container frame */}
        <div
          className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 z-30"
          style={{
            width: 126,
            height: 34,
            background: "#0A0A0C",
            borderRadius: "0 0 20px 20px",
          }}
        />

        {/* Screen container */}
        <div className="absolute inset-0 overflow-hidden sm:rounded-[50px]">
          {screen === "dashboard" && (
            <DashboardScreen
              entries={entries}
              dateKey={dateKey}
              targets={targets}
              healthSettings={healthSettings}
              onPrevDate={handlePrevDate}
              onNextDate={handleNextDate}
              onDeleteEntry={handleDeleteEntry}
              onLogEntry={handleLogEntry}
              onOpenScanner={() => setShowScanner(true)}
              onOpenVoice={() => setShowVoice(true)}
              onOpenSettings={() => setShowSettings(true)}
              onTabChange={setScreen}
            />
          )}

          {screen === "goals" && (
            <GoalsScreen
              targets={targets}
              onSaveTargets={handleSaveTargets}
              onTabChange={setScreen}
            />
          )}

          {screen === "analytics" && (
            <AnalyticsScreen
              targets={targets}
              onTabChange={setScreen}
            />
          )}
        </div>

        {/* Full-screen Modals */}
        {showScanner && (
          <BarcodeScannerModal
            onClose={() => setShowScanner(false)}
            onLogProduct={(p) => {
              handleLogEntry({
                name: p.name,
                calories: p.calories,
                protein: p.protein,
                carbs: p.carbs,
                fat: p.fat,
                time: p.time,
                servingSize: p.servingSize,
              });
            }}
          />
        )}

        {showVoice && (
          <VoiceInputModal
            onClose={() => setShowVoice(false)}
            onVoiceResult={(transcript) => {
              const parsed = parseFoodNaturalLanguage(transcript);
              const h = new Date().getHours();
              const period: MealPeriod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
              handleLogEntry({
                name: parsed.name,
                calories: parsed.calories,
                protein: parsed.protein,
                carbs: parsed.carbs,
                fat: parsed.fat,
                time: period,
              });
            }}
          />
        )}

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            entries={entries}
            currentDateKey={dateKey}
            targets={targets}
            healthSettings={healthSettings}
            onUpdateHealthSettings={setHealthSettings}
            onDataReload={reloadData}
          />
        )}
      </div>
    </div>
  );
}
