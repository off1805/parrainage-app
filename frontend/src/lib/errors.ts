import { ApiError } from './api';

export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Le serveur est injoignable. Vérifie ta connexion.";
    if (e.status === 401) return "Clé admin invalide ou absente.";
    return e.message;
  }
  return "Une erreur inattendue est survenue.";
}
