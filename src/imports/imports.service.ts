import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import { Student, StudentLevel } from '../students/student.entity.js';
import { ImportStudentRowDto } from './dto/import-student-row.dto.js';
import type {
  ImportStudentsError,
  ImportStudentsResult,
} from './dto/import-students-result.dto.js';

const HEADER_ALIASES: Record<keyof ImportStudentRowDto, string[]> = {
  firstName: ['firstname', 'prenom', 'first'],
  lastName: ['lastname', 'nom', 'last'],
  email: ['email', 'mail', 'courriel'],
  matricule: ['matricule', 'mat'],
  level: ['level', 'niveau', 'promo', 'promotion'],
  maxMentees: [
    'maxmentees',
    'capacity',
    'capacite',
    'capacitemax',
    'maxfilleuls',
  ],
};

const ALIAS_TO_FIELD = new Map<string, keyof ImportStudentRowDto>(
  Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) =>
    aliases.map((alias) => [alias, field as keyof ImportStudentRowDto]),
  ),
);

type RawRow = Record<string, string>;

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async importFile(file: Express.Multer.File): Promise<ImportStudentsResult> {
    const rows = await this.readRows(file);
    return this.persist(rows);
  }

  // ------------------------------------------------------------------ parsing

  private async readRows(file: Express.Multer.File): Promise<RawRow[]> {
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension === 'csv') {
      return this.parseCsv(file.buffer);
    }
    if (extension === 'xlsx' || extension === 'xls') {
      return this.parseXlsx(file.buffer);
    }
    throw new BadRequestException(
      'Format non supporté : utiliser un fichier .csv ou .xlsx',
    );
  }

  private parseCsv(buffer: Buffer): RawRow[] {
    const lines: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < buffer.length; i += 1) {
      const char = buffer.toString('utf-8', i, i + 1);
      if (char === '"') {
        if (inQuotes && buffer.toString('utf-8', i + 1, i + 2) === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && (char === '\n' || char === '\r')) {
        if (char === '\r' && buffer.toString('utf-8', i + 1, i + 2) === '\n')
          i += 1;
        lines.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    if (current.length > 0) lines.push(current);

    return this.toObjects(lines.map(splitCsvLine));
  }

  private async parseXlsx(buffer: Buffer): Promise<RawRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Le fichier ne contient aucune feuille');
    }

    const matrix: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      matrix.push(values.slice(1).map((cell) => this.toCellText(cell)));
    });

    return this.toObjects(matrix);
  }

  /** Première ligne = en-têtes, lignes suivantes = données. */
  private toObjects(matrix: string[][]): RawRow[] {
    const [header, ...body] = matrix;
    if (!header) {
      throw new BadRequestException('Le fichier est vide');
    }

    const fields = header.map((cell) => {
      const key = this.normalizeHeader(cell);
      const field = ALIAS_TO_FIELD.get(key);
      if (!field) {
        throw new BadRequestException(
          `Colonne inconnue : "${cell}". Colonnes attendues : firstName, lastName, email, matricule, level, maxMentees`,
        );
      }
      return field;
    });

    return body
      .filter((cells) => cells.some((cell) => cell !== ''))
      .map((cells) =>
        Object.fromEntries(
          fields.map((field, index) => [field, (cells[index] ?? '').trim()]),
        ),
      );
  }

  private toCellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value.trim();
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value.toString();
    }
    return JSON.stringify(value);
  }

  private normalizeHeader(header: string): string {
    return header
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  // ---------------------------------------------------------------- validation

  private async persist(rawRows: RawRow[]): Promise<ImportStudentsResult> {
    const errors: ImportStudentsError[] = [];
    const seenInFile = new Set<string>();
    const valid: { row: number; data: ImportStudentRowDto }[] = [];

    for (const [index, raw] of rawRows.entries()) {
      const rowNumber = index + 2; // +1 en-tête, +1 base 1-based
      const candidate = this.toCandidate(raw);
      const { instance, errors: rowErrors } = await this.validateRow(
        candidate,
        seenInFile,
      );

      if (rowErrors.length > 0) {
        errors.push(
          ...rowErrors.map((message) => ({
            row: rowNumber,
            email: candidate.email,
            message,
          })),
        );
        continue;
      }

      seenInFile.add(candidate.email.toLowerCase());
      // `instance` porte les valeurs normalisées (niveau, capacité) : c'est
      // exactement cette version qui doit être enregistrée.
      valid.push({ row: rowNumber, data: instance });
    }

    if (valid.length > 0) {
      const emails = valid.map(({ data }) => data.email.toLowerCase());
      const existing = await this.students.find({
        where: { email: In(emails) },
        select: { email: true },
      });
      const existingEmails = new Set(
        existing.map((student) => student.email.toLowerCase()),
      );

      const insertable = valid.filter(({ row, data }) => {
        if (existingEmails.has(data.email.toLowerCase())) {
          errors.push({
            row,
            email: data.email,
            message: 'email déjà importé',
          });
          return false;
        }
        return true;
      });

      await this.saveAll(insertable);
      this.logger.log(
        `Import : ${insertable.length} étudiant(s) inséré(s), ${errors.length} rejet(s)`,
      );
      return { imported: insertable.length, rejected: errors.length, errors };
    }

    return { imported: 0, rejected: errors.length, errors };
  }

  private async saveAll(
    rows: { row: number; data: ImportStudentRowDto }[],
  ): Promise<void> {
    const entities = rows.map(({ data }) =>
      this.students.create({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        matricule: data.matricule || null,
        level: data.level,
        maxMentees: data.level === StudentLevel.ING4 ? data.maxMentees! : null,
        whatsapp: null,
        profilePictureUrl: null,
      }),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Student, entities);
    });
  }

  private async validateRow(
    candidate: RawRow,
    seenInFile: Set<string>,
  ): Promise<{ instance: ImportStudentRowDto; errors: string[] }> {
    const messages: string[] = [];

    const instance = plainToInstance(ImportStudentRowDto, {
      ...candidate,
      level: this.normalizeLevel(candidate.level ?? ''),
      maxMentees: this.normalizeMaxMentees(candidate.maxMentees),
    });

    for (const error of await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    })) {
      messages.push(...Object.values(error.constraints ?? {}));
    }

    if (instance.email && seenInFile.has(instance.email.toLowerCase())) {
      messages.push('email en double dans le fichier');
    }
    if (
      instance.level === StudentLevel.ING4 &&
      (instance.maxMentees === undefined || instance.maxMentees === null)
    ) {
      messages.push('maxMentees est obligatoire pour un ING4');
    }

    return { instance, errors: [...new Set(messages)] };
  }

  private toCandidate(raw: RawRow): RawRow {
    return {
      firstName: raw.firstName ?? '',
      lastName: raw.lastName ?? '',
      email: raw.email ?? '',
      matricule: raw.matricule ?? '',
      level: raw.level ?? '',
      maxMentees: raw.maxMentees ?? '',
    };
  }

  /** Accepte ING3, ING 3, 3ING, 4A... → ING3 | ING4 | '' (invalide). */
  private normalizeLevel(raw: string): string {
    const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value === 'ING3' || value === '3ING' || value === 'ING03')
      return StudentLevel.ING3;
    if (value === 'ING4' || value === '4ING' || value === 'ING04')
      return StudentLevel.ING4;
    return raw;
  }

  private normalizeMaxMentees(raw: string | undefined): number | undefined {
    if (raw === undefined || raw === '') return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : Number.NaN;
  }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
