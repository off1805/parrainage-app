import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PairingsService } from '../pairings/pairings.service.js';
import { PairingSessionStatus } from '../pairings/pairing-session.entity.js';
import type { StudentRefDto } from '../pairings/dto/pairing-session-view.dto.js';

const COLUMNS = [
  'Parrain',
  'Email parrain',
  'WhatsApp parrain',
  'Matricule parrain',
  'Filleul',
  'Email filleul',
  'WhatsApp filleul',
  'Matricule filleul',
] as const;

@Injectable()
export class ExportsService {
  constructor(private readonly pairingsService: PairingsService) {}

  /**
   * Export XLSX de la session finalisée. L'origine du parrainage
   * (PRECONFIGURED / RANDOM / MANUAL) n'apparaît pas dans le fichier.
   */
  async exportSession(
    sessionId: string,
  ): Promise<{ filename: string; buffer: Buffer }> {
    const session = await this.pairingsService.getSession(sessionId);
    if (session.status !== PairingSessionStatus.FINALIZED) {
      throw new BadRequestException(
        'Seule une session finalisée peut être exportée',
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Parrainage');

    sheet.addRow([...COLUMNS]);
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn(1).width = 24;
    sheet.getColumn(5).width = 24;
    for (const index of [2, 3, 4, 6, 7, 8]) sheet.getColumn(index).width = 22;

    for (const pairing of session.pairings) {
      sheet.addRow([
        this.fullName(pairing.sponsor),
        pairing.sponsor.email,
        pairing.sponsor.whatsapp ?? '',
        pairing.sponsor.matricule ?? '',
        this.fullName(pairing.mentee),
        pairing.mentee.email,
        pairing.mentee.whatsapp ?? '',
        pairing.mentee.matricule ?? '',
      ]);
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { filename: `parrainage-${sessionId}.xlsx`, buffer };
  }

  private fullName(student: StudentRefDto): string {
    return `${student.firstName} ${student.lastName}`;
  }
}
