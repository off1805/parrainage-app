import ExcelJS from 'exceljs';
import { StudentLevel } from '../src/students/student.entity.js';
import { createTestApp } from './utils/test-app.js';
import type { TestApp } from './utils/test-app.js';
import { csv, importFile } from './utils/fixtures.js';

const HEADER = 'firstName,lastName,email,matricule,level,maxMentees';

const line = (
  first: string,
  last: string,
  email: string,
  level: string,
  max = '',
  matricule = 'M1',
) => [first, last, email, matricule, level, max].join(',');

async function xlsxFile(
  rows: string[][],
  sheetName = 'Etudiants',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

describe("Import d'étudiants (e2e)", () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  it('importe un CSV valide et renvoie le résumé demandé', async () => {
    const content = [
      HEADER,
      line('Paul', 'Durand', 'paul.durand@school.fr', 'ING4', '2', 'M1001'),
      line('Marie', 'Petit', 'marie.petit@school.fr', 'ING4', '3', 'M1002'),
      line('Alice', 'Bernard', 'alice.bernard@school.fr', 'ING3', '', 'M2001'),
      line('Bob', 'Thomas', 'bob.thomas@school.fr', 'ING3'),
    ].join('\n');

    const { status, body } = await importFile(
      ctx.post,
      csv(content),
      'etudiants.csv',
    );

    expect(status).toBe(201);
    expect(body).toEqual({ imported: 4, rejected: 0, errors: [] });

    const { body: ing4 } = await ctx.get('/students?level=ING4').expect(200);
    const { body: ing3 } = await ctx.get('/students?level=ING3').expect(200);
    expect(ing4).toHaveLength(2);
    expect(ing3).toHaveLength(2);
    expect(
      ing4.find((s: { firstName: string }) => s.firstName === 'Paul')
        .maxMentees,
    ).toBe(2);
    expect(
      ing3.every((s: { maxMentees: number | null }) => s.maxMentees === null),
    ).toBe(true);
  });

  it('rejette les lignes invalides en citant le numéro de ligne', async () => {
    const content = [
      HEADER,
      line('Paul', 'Durand', 'paul.durand@school.fr', 'ING4', '2', 'M1001'),
      line('Invalide', 'Email', 'pas-un-email', 'ING3', '', 'M2001'),
      line('Mauvais', 'Niveau', 'niveau@school.fr', 'ING5', '', 'M2002'),
      line('Capacite', 'Nulle', 'capacite@school.fr', 'ING4', '0', 'M2003'),
      line('Sans', 'Capacite', 'sanscapacite@school.fr', 'ING4', '', 'M2004'),
      line('Paul', 'Durand', 'paul.durand@school.fr', 'ING4', '2', 'M1009'),
    ].join('\n');

    const { body } = await importFile(ctx.post, csv(content), 'etudiants.csv');

    expect(body.imported).toBe(1);
    expect(body.rejected).toBe(5);
    expect(body.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(body.errors.find((e) => e.row === 3)!.message).toMatch(/email/i);
    expect(body.errors.find((e) => e.row === 4)!.message).toMatch(
      /ING3 ou ING4/,
    );
    expect(body.errors.find((e) => e.row === 5)!.message).toMatch(
      /supérieur ou égal à 1/,
    );
    expect(body.errors.find((e) => e.row === 6)!.message).toMatch(
      /obligatoire pour un ING4/,
    );
    expect(body.errors.find((e) => e.row === 7)!.message).toMatch(/double/i);
  });

  it('détecte un email déjà présent en base', async () => {
    const valid = [
      HEADER,
      line('Paul', 'Durand', 'paul.durand@school.fr', 'ING4', '2'),
    ].join('\n');
    await importFile(ctx.post, csv(valid), 'premier.csv');

    const doublon = [
      HEADER,
      line('Autre', 'Eleve', 'paul.durand@school.fr', 'ING3'),
    ].join('\n');
    const { body } = await importFile(ctx.post, csv(doublon), 'doublon.csv');

    expect(body).toMatchObject({ imported: 0, rejected: 1 });
    expect(body.errors[0]!.message).toMatch(/déjà importé/);
  });

  it('importe un XLSX avec en-têtes accentués et niveaux formats librement', async () => {
    const file = await xlsxFile([
      ['Prénom', 'Nom', 'Email', 'Matricule', 'Niveau', 'Max Mentees'],
      ['Yasmine', 'Amrani', 'yasmine.amrani@school.fr', 'M3001', 'ING3', ''],
      [
        'Zinedine',
        'Badaoui',
        'zinedine.badaoui@school.fr',
        'M3002',
        '4 ING',
        '2',
      ],
      ['Meriem', 'Cherif', 'meriem.cherif@school.fr', 'M3003', '3ing', ''],
    ]);

    const { body } = await importFile(
      ctx.post,
      file,
      'etudiants.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    expect(body).toEqual({ imported: 3, rejected: 0, errors: [] });

    const { body: students } = await ctx.get('/students').expect(200);
    expect(
      students.find((s: { firstName: string }) => s.firstName === 'Yasmine')
        .level,
    ).toBe(StudentLevel.ING3);
    expect(
      students.find((s: { firstName: string }) => s.firstName === 'Zinedine')
        .level,
    ).toBe(StudentLevel.ING4);
    expect(
      students.find((s: { firstName: string }) => s.firstName === 'Zinedine')
        .maxMentees,
    ).toBe(2);
    expect(
      students.find((s: { firstName: string }) => s.firstName === 'Meriem')
        .level,
    ).toBe(StudentLevel.ING3);
  });

  it('gère les cellules chiffrées et les lignes vides', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('S');
    sheet.addRow(['firstName', 'lastName', 'email', 'level', 'maxMentees']);
    sheet.addRow(['Lina', 'Aoud', 'lina.aoud@school.fr', 'ING4', 4]);
    sheet.addRow([]);
    sheet.addRow(['Nabil', 'Sami', 'nabil.sami@school.fr', 'ING3', '']);
    const file = Buffer.from(
      (await workbook.xlsx.writeBuffer()) as ArrayBuffer,
    );

    const { body } = await importFile(
      ctx.post,
      file,
      'chiffres.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    expect(body).toEqual({ imported: 2, rejected: 0, errors: [] });
    const { body: students } = await ctx.get('/students').expect(200);
    expect(
      students.find((s: { firstName: string }) => s.firstName === 'Lina')
        .maxMentees,
    ).toBe(4);
  });

  it('normalise les en-têtes (espaces, accents, casse)', async () => {
    const content = [
      'FIRST NAME,Last Name,E-MAIL,Niveau,Capacite Max',
      'Sami,Ben Ali,sami.benali@school.fr,ING3,',
    ].join('\n');

    const { body } = await importFile(ctx.post, csv(content), 'entetes.csv');
    expect(body).toEqual({ imported: 1, rejected: 0, errors: [] });
  });

  it('refuse une colonne inconnue', async () => {
    const content = [
      'firstName,lastName,email,niveau,date_naissance',
      'A,B,a@b.fr,ING3,2005-01-01',
    ].join('\n');
    const response = await ctx
      .post('/students/import')
      .attach('file', csv(content), {
        filename: 'inconnu.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Colonne inconnue/);
  });

  it('refuse un format non supporté et une requête sans fichier', async () => {
    await ctx
      .post('/students/import')
      .attach('file', Buffer.from('firstName,lastName'), {
        filename: 'liste.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    await ctx.post('/students/import').expect(400);
  });

  it('refuse un fichier vide', async () => {
    const response = await ctx
      .post('/students/import')
      .attach('file', csv(''), {
        filename: 'vide.csv',
        contentType: 'text/csv',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/vide/);
  });
});
