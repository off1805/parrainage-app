export function getAdminKey(): string | null {
  return sessionStorage.getItem('adminKey');
}

export function setAdminKey(key: string): void {
  sessionStorage.setItem('adminKey', key);
}

export function clearAdminKey(): void {
  sessionStorage.removeItem('adminKey');
}
