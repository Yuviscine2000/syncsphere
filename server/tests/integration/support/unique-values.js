import { randomUUID } from 'node:crypto';

export function uniqueSuffix() {
  return `${Date.now()}-${randomUUID()}`;
}

export function uniqueEmail(prefix = 'integration') {
  return `${prefix}+${uniqueSuffix()}@example.test`;
}

export function uniqueName(prefix = 'integration') {
  const suffix = `${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
  return `${prefix}_${suffix}`;
}

export function uniqueKey(prefix = 'integration') {
  return `${prefix}:${uniqueSuffix()}`;
}
