import photos from '../src/data/photos.json';

const errors: string[] = [];
const ids = new Set<string>();

const ID_PATTERN = /^[a-z]+(-[a-z]+)*-\d{2,}$/;
const VALID_TEXT_COLORS = ['white', 'dark'];
const VALID_WATERMARK_POSITIONS = ['lower-left', 'lower-right', 'upper-left', 'upper-right'];
const VALID_TIERS = ['standard', 'high-capacity'];

for (const p of photos) {
  const prefix = `[${p.id}]`;

  if (!ID_PATTERN.test(p.id)) {
    errors.push(`${prefix} invalid id format — must match ${ID_PATTERN}`);
  }

  if (ids.has(p.id)) {
    errors.push(`${prefix} duplicate id`);
  }
  ids.add(p.id);

  if (typeof p.width !== 'number' || typeof p.height !== 'number') {
    errors.push(`${prefix} width/height must be numbers`);
  }

  const tz = p.textZone;
  if (!tz || tz.x < 0 || tz.y < 0 || tz.width <= 0 || tz.height <= 0) {
    errors.push(`${prefix} textZone values must be positive`);
  }
  if (tz && (tz.x + tz.width > 1.001 || tz.y + tz.height > 1.001)) {
    errors.push(`${prefix} textZone extends past photo boundary`);
  }

  const cap = p.capacity;
  if (!cap || cap.line1 <= 0 || cap.line2 <= 0) {
    errors.push(`${prefix} capacity values must be positive`);
  }

  if (!VALID_TEXT_COLORS.includes(p.textColor)) {
    errors.push(`${prefix} textColor must be 'white' or 'dark'`);
  }

  if (!VALID_WATERMARK_POSITIONS.includes(p.watermarkPosition)) {
    errors.push(`${prefix} invalid watermarkPosition`);
  }

  if (!VALID_TIERS.includes(p.tier)) {
    errors.push(`${prefix} tier must be 'standard' or 'high-capacity'`);
  }

  if (p.tier === 'high-capacity' && (cap.line1 < 60 || cap.line2 < 100)) {
    errors.push(`${prefix} high-capacity photo must have capacity >= 60/100`);
  }

  if (typeof p.credit !== 'string') {
    errors.push(`${prefix} credit must be a string`);
  }
}

const highCapacityCount = photos.filter((p) => p.tier === 'high-capacity').length;
if (highCapacityCount < 8) {
  errors.push(`Library has only ${highCapacityCount} high-capacity photos; need >= 8`);
}

if (errors.length > 0) {
  console.error('photos.json lint errors:');
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}

console.log(`✓ ${photos.length} photos validated (${highCapacityCount} high-capacity)`);
