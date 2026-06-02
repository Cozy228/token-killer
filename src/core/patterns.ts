export const IMPORTANT_PATTERN =
  /error|failed|failure|exception|fatal|cannot|undefined|null|timeout|denied|stack|FAIL|ERROR|WARN/i;

export function isNoisyPath(value: string): boolean {
  return /noise|node_modules|dist|build|target|coverage|\.git/.test(value);
}
