export type MealPeriod = "morning" | "afternoon" | "evening";

export interface FoodEntry {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  time: MealPeriod;
  servingSize?: string;
  barcode?: string;
  syncedToHealth?: boolean;
}

export type Phase = "cut" | "recomp" | "bulk";

export interface Targets {
  phase: Phase;
  weeklyRate: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  proteinLocked: boolean;
}

export interface HealthSyncSettings {
  autoSync: boolean;
  syncCalories: boolean;
  syncProtein: boolean;
  syncCarbs: boolean;
  syncFat: boolean;
  lastSyncTimestamp: number | null;
}

export interface DayAnalytics {
  day: string;
  date: string;
  cals: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
}

const STORAGE_KEYS = {
  ENTRIES: "logical_entries_by_date",
  TARGETS: "logical_nutrition_targets",
  HEALTH_SYNC: "logical_health_sync_settings",
};

export const DEFAULT_TARGETS: Targets = {
  phase: "cut",
  weeklyRate: 0.5,
  calories: 2400,
  protein: 200,
  carbs: 220,
  fat: 65,
  proteinLocked: false,
};

export const DEFAULT_HEALTH_SYNC: HealthSyncSettings = {
  autoSync: false,
  syncCalories: true,
  syncProtein: true,
  syncCarbs: true,
  syncFat: true,
  lastSyncTimestamp: null,
};

export function formatDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const monthName = target.toLocaleString("en-US", { month: "short" });

  if (diffDays === 0) return `Today, ${monthName} ${d}`;
  if (diffDays === -1) return `Yesterday, ${monthName} ${d}`;
  if (diffDays === 1) return `Tomorrow, ${monthName} ${d}`;

  return `${target.toLocaleString("en-US", { weekday: "short" })}, ${monthName} ${d}`;
}

const INITIAL_DEMO_ENTRIES: Record<string, FoodEntry[]> = {
  [formatDateKey(new Date())]: [
    { id: 1, name: "Greek Yogurt, Plain (2% Fage)", calories: 130, protein: 17, carbs: 8, fat: 4, time: "morning", servingSize: "1 cup (170g)" },
    { id: 2, name: "Blueberries, 1 cup", calories: 84, protein: 1, carbs: 21, fat: 0, time: "morning", servingSize: "1 cup" },
    { id: 3, name: "Cold Brew, black", calories: 5, protein: 0, carbs: 1, fat: 0, time: "morning", servingSize: "12 oz" },
    { id: 4, name: "4oz Chicken Breast, grilled", calories: 187, protein: 35, carbs: 0, fat: 4, time: "afternoon", servingSize: "4 oz" },
    { id: 5, name: "Brown Rice, 3/4 cup cooked", calories: 163, protein: 4, carbs: 34, fat: 1, time: "afternoon", servingSize: "3/4 cup" },
    { id: 6, name: "Broccoli, steamed, 1 cup", calories: 55, protein: 4, carbs: 11, fat: 1, time: "afternoon", servingSize: "1 cup" },
    { id: 7, name: "Salmon, Atlantic, 5oz", calories: 292, protein: 40, carbs: 0, fat: 14, time: "evening", servingSize: "5 oz" },
    { id: 8, name: "Sweet Potato, medium", calories: 103, protein: 2, carbs: 24, fat: 0, time: "evening", servingSize: "1 medium" },
  ],
};

// ─── Storage Operations ───────────────────────────────────────────────────────

function getStorageMap(): Record<string, FoodEntry[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ENTRIES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(INITIAL_DEMO_ENTRIES));
      return INITIAL_DEMO_ENTRIES;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_DEMO_ENTRIES;
  }
}

function setStorageMap(data: Record<string, FoodEntry[]>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save entries to localStorage", err);
  }
}

export function getEntriesForDate(dateKey: string): FoodEntry[] {
  const map = getStorageMap();
  return map[dateKey] || [];
}

export function saveEntry(dateKey: string, entry: Omit<FoodEntry, "id">): FoodEntry {
  const map = getStorageMap();
  const current = map[dateKey] || [];
  const newEntry: FoodEntry = {
    ...entry,
    id: Date.now() + Math.floor(Math.random() * 1000),
  };
  map[dateKey] = [newEntry, ...current];
  setStorageMap(map);
  return newEntry;
}

export function deleteEntry(dateKey: string, id: number): FoodEntry | null {
  const map = getStorageMap();
  const current = map[dateKey] || [];
  const found = current.find((e) => e.id === id) || null;
  map[dateKey] = current.filter((e) => e.id !== id);
  setStorageMap(map);
  return found;
}

export function getDailyTotals(entries: FoodEntry[]) {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (Number(e.calories) || 0),
      protein: acc.protein + (Number(e.protein) || 0),
      carbs: acc.carbs + (Number(e.carbs) || 0),
      fat: acc.fat + (Number(e.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function getAnalyticsData(daysCount: number = 7): DayAnalytics[] {
  const map = getStorageMap();
  const result: DayAnalytics[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = formatDateKey(d);
    const dayEntries = map[dateKey] || [];
    const totals = getDailyTotals(dayEntries);
    const isLogged = dayEntries.length > 0;

    result.push({
      day: daysCount === 7 ? d.toLocaleString("en-US", { weekday: "short" }) : `${d.getDate()}`,
      date: `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`,
      cals: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      logged: isLogged,
    });
  }

  return result;
}

export function getTargets(): Targets {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TARGETS);
    if (!raw) return DEFAULT_TARGETS;
    return { ...DEFAULT_TARGETS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TARGETS;
  }
}

export function saveTargets(targets: Targets): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TARGETS, JSON.stringify(targets));
  } catch (err) {
    console.error("Failed to save targets", err);
  }
}

export function getHealthSyncSettings(): HealthSyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HEALTH_SYNC);
    if (!raw) return DEFAULT_HEALTH_SYNC;
    return { ...DEFAULT_HEALTH_SYNC, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_HEALTH_SYNC;
  }
}

export function saveHealthSyncSettings(settings: HealthSyncSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.HEALTH_SYNC, JSON.stringify(settings));
  } catch (err) {
    console.error("Failed to save health sync settings", err);
  }
}

export function resetAllData(): void {
  localStorage.removeItem(STORAGE_KEYS.ENTRIES);
  localStorage.removeItem(STORAGE_KEYS.TARGETS);
  localStorage.removeItem(STORAGE_KEYS.HEALTH_SYNC);
}

export function loadDemoData(): void {
  const map: Record<string, FoodEntry[]> = { ...INITIAL_DEMO_ENTRIES };
  const today = new Date();

  // Populate realistic previous days
  for (let i = 1; i <= 6; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = formatDateKey(d);
    if (i === 3) continue; // simulate 1 missed day

    const factor = 1 + (Math.sin(i) * 0.1);
    map[key] = [
      { id: Date.now() + i * 10 + 1, name: "Egg & Avocado Sourdough", calories: Math.round(420 * factor), protein: Math.round(24 * factor), carbs: Math.round(36 * factor), fat: Math.round(18 * factor), time: "morning" },
      { id: Date.now() + i * 10 + 2, name: "Grilled Chicken Rice Bowl", calories: Math.round(680 * factor), protein: Math.round(58 * factor), carbs: Math.round(72 * factor), fat: Math.round(14 * factor), time: "afternoon" },
      { id: Date.now() + i * 10 + 3, name: "Whey Protein Shake", calories: 150, protein: 30, carbs: 3, fat: 2, time: "afternoon" },
      { id: Date.now() + i * 10 + 4, name: "Sirloin Steak & Roasted Potatoes", calories: Math.round(750 * factor), protein: Math.round(62 * factor), carbs: Math.round(55 * factor), fat: Math.round(26 * factor), time: "evening" },
    ];
  }

  setStorageMap(map);
}

