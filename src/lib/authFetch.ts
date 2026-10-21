import { auth } from '../firebase';

/** fetch() with the current user's Firebase ID token (required by /api/drive, /api/calendar and /api/auth). */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const idToken = await auth.currentUser?.getIdToken();
  if (idToken) headers.set('Authorization', `Bearer ${idToken}`);
  return fetch(input, { ...init, headers });
}

/** Downloads an authenticated response as a file (replaces window.open, which cannot send the token). */
export async function downloadWithAuth(url: string, fileName: string): Promise<void> {
  const response = await authFetch(url);
  if (!response.ok) throw new Error('Download failed');
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
