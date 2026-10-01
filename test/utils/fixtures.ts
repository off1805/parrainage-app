import type { DataSource, Repository } from 'typeorm';
import { Student, StudentLevel, StudentSection } from '../../src/students/student.entity.js';

export interface StudentSpec {
  firstName: string;
  lastName: string;
  level: StudentLevel;
  /** Francophone par défaut. */
  section?: StudentSection;
  /** Nombre de filleuls maximum, pertinent pour un ING4. */
  maxMentees?: number;
  email?: string;
  matricule?: string;
  whatsapp?: string;
  profilePictureUrl?: string;
}

export interface SeededStudent {
  id: string;
  email: string;
  fullName: string;
  raw: Student;
}

let sequence = 0;

/** Insère des étudiants directement en base (raccourci de mise en place de test). */
export async function seedStudents(
  dataSource: DataSource,
  specs: StudentSpec[],
): Promise<Record<string, SeededStudent>> {
  const repository = dataSource.getRepository(Student) as Repository<Student>;
  const result: Record<string, SeededStudent> = {};
  // Repart à zéro à chaque appel : les emails générés sont déterministes.
  sequence = 0;

  for (const spec of specs) {
    sequence += 1;
    const email =
      spec.email ??
      `${spec.firstName.toLowerCase()}.${spec.lastName.toLowerCase()}${spec.level === StudentLevel.ING4 ? '' : sequence}@school.fr`;
    const student = await repository.save(
      repository.create({
        firstName: spec.firstName,
        lastName: spec.lastName,
        email,
        matricule: spec.matricule ?? null,
        level: spec.level,
        section: spec.section ?? StudentSection.FR,
        whatsapp: spec.whatsapp ?? null,
        profilePictureUrl: spec.profilePictureUrl ?? null,
        maxMentees:
          spec.level === StudentLevel.ING4 ? (spec.maxMentees ?? 1) : null,
      }),
    );
    result[`${spec.firstName} ${spec.lastName}`] = {
      id: student.id,
      email: student.email,
      fullName: `${student.firstName} ${student.lastName}`,
      raw: student,
    };
  }

  return result;
}

/** Jeu de données de référence : 4 parrains (1, 2, 2, 3) et 8 filleuls. */
export const COHORT: StudentSpec[] = [
  {
    firstName: 'Paul',
    lastName: 'Durand',
    level: StudentLevel.ING4,
    maxMentees: 1,
  },
  {
    firstName: 'Marie',
    lastName: 'Petit',
    level: StudentLevel.ING4,
    maxMentees: 2,
  },
  {
    firstName: 'Jean',
    lastName: 'Martin',
    level: StudentLevel.ING4,
    maxMentees: 2,
  },
  {
    firstName: 'Sophie',
    lastName: 'Robert',
    level: StudentLevel.ING4,
    maxMentees: 3,
  },
  { firstName: 'Alice', lastName: 'Bernard', level: StudentLevel.ING3 },
  { firstName: 'Bob', lastName: 'Thomas', level: StudentLevel.ING3 },
  { firstName: 'Chloe', lastName: 'Petit', level: StudentLevel.ING3 },
  { firstName: 'David', lastName: 'Moreau', level: StudentLevel.ING3 },
  { firstName: 'Emma', lastName: 'Laurent', level: StudentLevel.ING3 },
  { firstName: 'Felix', lastName: 'Simon', level: StudentLevel.ING3 },
  { firstName: 'Gabriel', lastName: 'Michel', level: StudentLevel.ING3 },
  { firstName: 'Hina', lastName: 'Lefevre', level: StudentLevel.ING3 },
];

export interface ImportBody {
  imported: number;
  rejected: number;
  errors: { row: number; email?: string; message: string }[];
}

/** Chaîne de style supertest, structuralement typée pour éviter la dépendance au type exact. */
export interface RequestFactory {
  (url: string): {
    attach: (
      field: string,
      file: Buffer,
      options: { filename: string; contentType: string },
    ) => any;
  };
}

/** Envoie un fichier CSV ou XLSX sur l'endpoint d'import. */
export async function importFile(
  post: RequestFactory,
  file: Buffer,
  filename: string,
  contentType = 'text/csv',
): Promise<{ status: number; body: ImportBody }> {
  const response = await post('/students/import').attach('file', file, {
    filename,
    contentType,
  });

  return { status: response.status, body: response.body as ImportBody };
}

export const csv = (content: string): Buffer => Buffer.from(content, 'utf-8');
