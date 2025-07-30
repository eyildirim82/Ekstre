import crypto from 'crypto';

export function hash(str: string) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
export function hashJson(obj: any) {
  return hash(JSON.stringify(obj));
}
