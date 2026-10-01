import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { describeError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/image';
import type { InvitationPreview } from '../lib/types';

const WHATSAPP_RE = /^[+0-9][0-9\s().-]{5,31}$/;
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Screen =
  | { kind: 'no-token' }
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'already-used' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }
  | { kind: 'network-error'; message: string }
  | { kind: 'form'; preview: InvitationPreview }
  | { kind: 'success'; firstName: string; photoUrl: string };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function classifyError(e: unknown): Screen {
  if (!(e instanceof ApiError)) {
    return { kind: 'network-error', message: describeError(e) };
  }
  if (e.status === 0) {
    return { kind: 'network-error', message: describeError(e) };
  }
  if (e.status === 400 || e.status === 404) {
    return { kind: 'not-found' };
  }
  if (e.status === 410) {
    const msg = e.message.toLowerCase();
    if (msg.includes('déjà utilisée') || msg.includes('deja utilisee')) return { kind: 'already-used' };
    if (msg.includes('expiré') || msg.includes('expire')) return { kind: 'expired' };
    if (msg.includes('annulée') || msg.includes('annulee')) return { kind: 'cancelled' };
    return { kind: 'already-used' };
  }
  return { kind: 'network-error', message: describeError(e) };
}

export default function Invitation() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [screen, setScreen] = useState<Screen>(
    token ? { kind: 'loading' } : { kind: 'no-token' },
  );

  // Form state
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappError, setWhatsappError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Keep uploaded URL across retries so we don't re-upload
  const uploadedUrl = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setScreen({ kind: 'loading' });
    try {
      const preview = await api.invitations.verify(token);
      setScreen({ kind: 'form', preview });
    } catch (e: unknown) {
      setScreen(classifyError(e));
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Cleanup photo preview URL
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setPhotoError('Format accepté : JPEG, PNG ou WebP.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setPhotoError('La photo ne doit pas dépasser 8 Mo.');
      e.target.value = '';
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    // Reset uploaded URL if user changes photo
    uploadedUrl.current = null;
  }

  function handleWhatsapp(value: string) {
    setWhatsapp(value);
    if (value && !WHATSAPP_RE.test(value)) {
      setWhatsappError('Numéro invalide. Exemple : +237 6XX XX XX XX');
    } else {
      setWhatsappError('');
    }
  }

  const isValid = photo && WHATSAPP_RE.test(whatsapp) && !sending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !photo || !isValid) return;

    setSending(true);
    setSendError('');

    try {
      // 1) Upload to Supabase (unless already done)
      let publicUrl = uploadedUrl.current;
      if (!publicUrl) {
        if (!supabase) {
          setSendError('Configuration Supabase manquante. Contacte l\'équipe.');
          setSending(false);
          return;
        }

        const compressed = await compressImage(photo);
        const filename = `${crypto.randomUUID()}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('profile-pictures')
          .upload(filename, compressed, { contentType: 'image/jpeg' });

        if (uploadError) {
          setSendError(`Échec de l'envoi de la photo : ${uploadError.message}`);
          setSending(false);
          return;
        }

        const { data } = supabase.storage
          .from('profile-pictures')
          .getPublicUrl(filename);

        publicUrl = data.publicUrl;
        uploadedUrl.current = publicUrl;
      }

      // 2) Complete profile
      await api.invitations.complete({
        token,
        profilePictureUrl: publicUrl,
        whatsapp: whatsapp.trim(),
      });

      setScreen({
        kind: 'success',
        firstName: screen.kind === 'form' ? screen.preview.firstName : '',
        photoUrl: publicUrl,
      });
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 410) {
        setScreen(classifyError(err));
        return;
      }
      setSendError(describeError(err));
    } finally {
      setSending(false);
    }
  }

  /* ── Screens ── */

  if (screen.kind === 'no-token') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Oups</span>
          <p className="inv-text">Ce lien est invalide. Vérifie l'adresse dans ton email.</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'loading') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Parrainage</span>
          <p className="inv-text inv-pulse">Vérification en cours…</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'not-found') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Lien introuvable</span>
          <p className="inv-text">Ce lien n'existe pas ou est incomplet. Vérifie que tu as bien copié l'adresse depuis ton email.</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'already-used') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Déjà envoyé ✓</span>
          <p className="inv-text">Tu as déjà envoyé ton profil, merci ! On se retrouve le jour J.</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'expired') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Lien expiré</span>
          <p className="inv-text">Ce lien a expiré, demande-en un nouveau à l'équipe.</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'cancelled') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Lien remplacé</span>
          <p className="inv-text">Ce lien a été remplacé, utilise le dernier email reçu.</p>
        </div>
      </div>
    );
  }

  if (screen.kind === 'network-error') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Erreur</span>
          <p className="inv-text">{screen.message}</p>
          <button className="inv-btn" onClick={load}>Réessayer</button>
        </div>
      </div>
    );
  }

  if (screen.kind === 'success') {
    return (
      <div className="inv-page">
        <div className="inv-card">
          <span className="script inv-title">Merci {screen.firstName} !</span>
          <div className="inv-success-photo">
            <div className="arch inv-arch">
              <img src={screen.photoUrl} alt="" />
            </div>
          </div>
          <p className="inv-text">Ta carte apparaîtra le jour J&nbsp;🎉</p>
        </div>
      </div>
    );
  }

  /* ── Form ── */
  const { preview } = screen;

  return (
    <div className="inv-page">
      <div className="inv-card">
        <span className="script inv-title">Bonjour {preview.firstName}</span>
        <p className="inv-subtitle">
          Complète ton profil avant le <strong>{formatDate(preview.expiresAt)}</strong>
        </p>

        <form className="inv-form" onSubmit={handleSubmit}>
          {/* Photo */}
          <label className="inv-label">Ta plus belle photo</label>
          <div className="inv-photo-zone">
            <div className="arch inv-arch">
              {photoPreview ? (
                <img src={photoPreview} alt="Aperçu" />
              ) : (
                <span className="mono">📷</span>
              )}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto}
              className="inv-file-input"
              id="inv-photo-input"
            />
            <label htmlFor="inv-photo-input" className="inv-btn inv-btn-outline">
              {photo ? 'Changer la photo' : 'Choisir une photo'}
            </label>
            {photoError && <p className="inv-error">{photoError}</p>}
          </div>

          {/* WhatsApp */}
          <label className="inv-label" htmlFor="inv-whatsapp">Ton numéro WhatsApp</label>
          <input
            id="inv-whatsapp"
            type="tel"
            className="inv-input"
            placeholder="+237 6XX XX XX XX"
            value={whatsapp}
            onChange={(e) => handleWhatsapp(e.target.value)}
          />
          {whatsappError && <p className="inv-error">{whatsappError}</p>}

          {sendError && <p className="inv-error">{sendError}</p>}

          <button
            type="submit"
            className="inv-btn inv-btn-primary"
            disabled={!isValid}
          >
            {sending ? 'Envoi en cours…' : 'Envoyer mon profil'}
          </button>
        </form>
      </div>
    </div>
  );
}
