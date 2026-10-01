import { getAdminKey } from './adminKey';
import type {
  ConstraintType,
  ImportResult,
  InvitationPreview,
  InvitationResult,
  PairingConstraint,
  PairingSession,
  PairingSessionView,
  PairingValidationReport,
  Student,
  StudentLevel,
} from './types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public issues?: { code: string; message: string }[]
  ) {
    super(message);
  }
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: any;
  isFormData?: boolean;
  public?: boolean;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const headers = new Headers();
  
  if (BASE.includes('ngrok')) {
    headers.set('ngrok-skip-browser-warning', '1');
  }

  if (!options.public) {
    const key = getAdminKey();
    if (key) {
      headers.set('X-API-Key', key);
    }
  }

  if (options.body && !options.isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      headers,
      body: options.isFormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(`Serveur injoignable`, 0);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  if (!res.ok) {
    let b: any = {};
    try {
      b = await res.json();
    } catch { /* corps vide */ }
    const msg = Array.isArray(b.message) ? b.message.join(' · ') : b.message ?? res.statusText;
    throw new ApiError(msg, res.status, b.code, b.issues);
  }

  const contentType = res.headers.get('Content-Type');
  if (contentType && contentType.includes('spreadsheetml')) {
    return (await res.blob()) as unknown as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  students: {
    list: (params?: { level?: StudentLevel; search?: string }) => {
      const q = new URLSearchParams();
      if (params?.level) q.set('level', params.level);
      if (params?.search) q.set('search', params.search);
      const qs = q.toString();
      return request<Student[]>(`/students${qs ? '?' + qs : ''}`);
    },
    get: (id: string) => request<Student>(`/students/${id}`),
    update: (id: string, patch: Partial<Omit<Student, 'id' | 'email' | 'level' | 'createdAt' | 'updatedAt'>>) => request<Student>(`/students/${id}`, { method: 'PATCH', body: patch }),
    import: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<ImportResult>('/students/import', { method: 'POST', body: fd, isFormData: true });
    },
  },
  invitations: {
    send: (studentId: string) => request<InvitationResult>(`/students/${studentId}/invitations`, { method: 'POST' }),
    resend: (studentId: string) => request<InvitationResult>(`/students/${studentId}/invitations/resend`, { method: 'POST' }),
    verify: (token: string) => request<InvitationPreview>(`/invitations/verify?token=${encodeURIComponent(token)}`, { public: true }),
    complete: (payload: { token: string; profilePictureUrl: string; whatsapp: string }) => request<InvitationPreview>('/invitations/complete', { method: 'POST', body: payload, public: true }),
  },
  constraints: {
    list: (type?: ConstraintType) => {
      const q = type ? `?type=${type}` : '';
      return request<PairingConstraint[]>(`/pairing-constraints${q}`);
    },
    create: (payload: { sponsorId: string; menteeId: string; type: ConstraintType; reason?: string }) => request<PairingConstraint>('/pairing-constraints', { method: 'POST', body: payload }),
    remove: async (id: string) => {
      try {
        await request<void>(`/pairing-constraints/${id}`, { method: 'DELETE' });
      } catch (e: any) {
        if (e instanceof ApiError && e.status === 400 && e.message.startsWith('Contrainte introuvable')) {
          return;
        }
        throw e;
      }
    },
  },
  sessions: {
    list: () => request<PairingSession[]>('/pairing-sessions'),
    create: () => request<PairingSession>('/pairing-sessions', { method: 'POST' }),
    get: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}`),
    validate: (id: string) => request<PairingValidationReport>(`/pairing-sessions/${id}/validate`, { method: 'POST' }),
    generate: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/generate`, { method: 'POST' }),
    regenerate: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/regenerate`, { method: 'POST' }),
    finalize: (id: string) => request<PairingSessionView>(`/pairing-sessions/${id}/finalize`, { method: 'POST' }),
    exportBlob: (id: string) => request<Blob>(`/pairing-sessions/${id}/export`),
    downloadExport: async (id: string) => {
      const blob = await api.sessions.exportBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parrainage-${id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },
};
