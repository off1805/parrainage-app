export interface ImportStudentsError {
  /** Numéro de ligne dans le fichier, en-tête inclus (1-based). */
  row: number;
  email?: string;
  message: string;
}

export interface ImportStudentsResult {
  imported: number;
  rejected: number;
  errors: ImportStudentsError[];
}
