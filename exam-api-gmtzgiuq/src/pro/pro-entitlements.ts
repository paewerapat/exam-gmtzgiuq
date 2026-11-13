/**
 * Real rights of a Pro plan (`pro_plans.entitlements`, task 17), separate
 * from the text of the Upgrade page. Tasks 6/8/9 read these through
 * ProAccessService.getEntitlements.
 *
 * - predictedSets: Predicted Exam sets per subject (whole number ≥ 0), or
 *   null = every set
 * - mockPurchase: may take the Mock Exams with accessType = purchase of the
 *   plan's venue
 *
 * Keys that are not known yet are kept (forward compatible); only the types
 * of the known keys are checked.
 */
export interface ProEntitlements {
  challenge: boolean;
  beyond: boolean;
  predictedSets: number | null;
  solutions: boolean;
  analytics: boolean;
  mockPurchase: boolean;
  [key: string]: unknown;
}

export const ENTITLEMENT_FLAGS = [
  'challenge',
  'beyond',
  'solutions',
  'analytics',
  'mockPurchase',
] as const;

export const MAX_PREDICTED_SETS = 1000;
/** Every key of the object, known ones included. */
export const MAX_ENTITLEMENT_KEYS = 40;
export const MAX_ENTITLEMENT_TEXT_LENGTH = 200;
/** Name of an extra key (no __proto__ and the like). */
export const ENTITLEMENT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

/** Rights of a venue without any plan (no free plan either). */
export const NO_ENTITLEMENTS: Readonly<ProEntitlements> = Object.freeze({
  challenge: false,
  beyond: false,
  predictedSets: 0,
  solutions: false,
  analytics: false,
  mockPurchase: false,
});

const KNOWN_KEYS = new Set<string>([...ENTITLEMENT_FLAGS, 'predictedSets']);

const FLAG_LABELS: Record<(typeof ENTITLEMENT_FLAGS)[number], string> = {
  challenge: 'challenge (ข้อ Challenge)',
  beyond: 'beyond (ข้อ Beyond)',
  solutions: 'solutions (เฉลยพร้อมวิธีทำ)',
  analytics: 'analytics (Analytics)',
  mockPurchase: 'mockPurchase (ชุด Mock ที่ต้องซื้อ)',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPredictedSets(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= MAX_PREDICTED_SETS)
  );
}

function isExtraValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= MAX_ENTITLEMENT_TEXT_LENGTH)
  );
}

/**
 * Strict check of entitlements sent by an admin. Returns the Thai error
 * message, or null when valid. Known keys may be left out (→ false / 0).
 */
export function checkEntitlements(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'สิทธิ์ของแพ็กเกจ (entitlements) ต้องเป็น object';
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_ENTITLEMENT_KEYS) {
    return `สิทธิ์ของแพ็กเกจมีได้ไม่เกิน ${MAX_ENTITLEMENT_KEYS} รายการ`;
  }
  for (const flag of ENTITLEMENT_FLAGS) {
    if (flag in value && typeof value[flag] !== 'boolean') {
      return `สิทธิ์ ${FLAG_LABELS[flag]} ต้องเป็น true หรือ false`;
    }
  }
  if ('predictedSets' in value && !isPredictedSets(value.predictedSets)) {
    return `จำนวนชุด Predicted (predictedSets) ต้องเป็นจำนวนเต็ม 0–${MAX_PREDICTED_SETS} หรือ null (ทุกชุด)`;
  }
  for (const key of keys) {
    if (KNOWN_KEYS.has(key)) continue;
    if (!ENTITLEMENT_KEY_PATTERN.test(key)) {
      return `ชื่อสิทธิ์ "${key.slice(0, 60)}" ไม่ถูกต้อง (ตัวอักษรอังกฤษ ตัวเลข หรือ _ ขึ้นต้นด้วยตัวอักษร ไม่เกิน 50 ตัว)`;
    }
    if (!isExtraValue(value[key])) {
      return `สิทธิ์ ${key} ต้องเป็น true/false ตัวเลข ข้อความไม่เกิน ${MAX_ENTITLEMENT_TEXT_LENGTH} ตัวอักษร หรือ null`;
    }
  }
  return null;
}

/**
 * Build the stored form: known keys with their type (missing/invalid →
 * the NO_ENTITLEMENTS value), then valid extra keys as they are.
 */
function build(value: Record<string, unknown>): ProEntitlements {
  const result: ProEntitlements = { ...NO_ENTITLEMENTS };
  for (const flag of ENTITLEMENT_FLAGS) {
    const flagValue = value[flag];
    if (typeof flagValue === 'boolean') result[flag] = flagValue;
  }
  const sets = value.predictedSets;
  if ('predictedSets' in value && isPredictedSets(sets)) {
    result.predictedSets = sets;
  }
  let count = KNOWN_KEYS.size;
  for (const key of Object.keys(value)) {
    if (KNOWN_KEYS.has(key)) continue;
    if (count >= MAX_ENTITLEMENT_KEYS) break;
    if (ENTITLEMENT_KEY_PATTERN.test(key) && isExtraValue(value[key])) {
      result[key] = value[key];
      count++;
    }
  }
  return result;
}

/** The value to store from POST/PUT (already checked by the DTO). */
export function prepareEntitlements(value: unknown): ProEntitlements {
  return isPlainObject(value) ? build(value) : { ...NO_ENTITLEMENTS };
}

/**
 * Read `pro_plans.entitlements` tolerantly: a JSON string (MariaDB returns
 * json columns as text in raw queries) is parsed; null/malformed →
 * NO_ENTITLEMENTS; a known key with a wrong type → its NO_ENTITLEMENTS value.
 */
export function normalizeStoredEntitlements(value: unknown): ProEntitlements {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { ...NO_ENTITLEMENTS };
    }
  }
  return isPlainObject(data) ? build(data) : { ...NO_ENTITLEMENTS };
}
