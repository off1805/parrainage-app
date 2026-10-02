import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { PairingConstraint } from '../pairings/pairing-constraint.entity.js';
import { Student, StudentLevel, StudentSection } from './student.entity.js';
import { QueryStudentsDto } from './dto/query-students.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import { CreateStudentDto } from './dto/create-student.dto.js';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
  ) {}

  findAll(query: QueryStudentsDto): Promise<Student[]> {
    const where: Record<string, unknown> = {};
    if (query.level) where.level = query.level;
    if (query.section) where.section = query.section;
    if (query.search) {
      where.lastName = ILike(`%${query.search}%`);
    }
    return this.students.find({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  findAllByLevel(level: StudentLevel, section?: StudentSection): Promise<Student[]> {
    return this.students.find({
      where: section ? { level, section } : { level },
      order: { lastName: 'ASC' },
    });
  }

  countByLevel(level: StudentLevel): Promise<number> {
    return this.students.countBy({ level });
  }

  findOne(id: string): Promise<Student | null> {
    return this.students.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<Student | null> {
    return this.students.findOne({ where: { email: email.toLowerCase() } });
  }

  async findOneOrFail(id: string): Promise<Student> {
    const student = await this.findOne(id);
    if (!student) {
      throw new NotFoundException(`Étudiant introuvable : ${id}`);
    }
    return student;
  }

  /** Ajout manuel d'un étudiant ; l'email doit être libre. */
  async create(dto: CreateStudentDto): Promise<Student> {
    await this.assertEmailAvailable(dto.email);
    const [student] = await this.insertMany([
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        matricule: dto.matricule || null,
        level: dto.level,
        section: dto.section ?? StudentSection.FR,
        maxMentees: dto.level === StudentLevel.ING4 ? dto.maxMentees! : null,
        whatsapp: null,
        profilePictureUrl: null,
      },
    ]);
    return student!;
  }

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    const student = await this.findOneOrFail(id);

    if (dto.email !== undefined && dto.email.toLowerCase() !== student.email) {
      await this.assertEmailAvailable(dto.email);
      student.email = dto.email.toLowerCase();
    }

    // Changer de niveau ou de section rendrait ses contraintes de parrainage incohérentes
    const levelChanges = dto.level !== undefined && dto.level !== student.level;
    const sectionChanges = dto.section !== undefined && dto.section !== student.section;
    if (levelChanges || sectionChanges) {
      const constraints = await this.students.manager.getRepository(PairingConstraint).count({
        where: [{ sponsorId: id }, { menteeId: id }],
      });
      if (constraints > 0) {
        throw new ConflictException(
          'Cet étudiant a des contraintes de parrainage : supprime-les avant de changer son niveau ou sa section',
        );
      }
    }

    if (dto.firstName !== undefined) student.firstName = dto.firstName;
    if (dto.lastName !== undefined) student.lastName = dto.lastName;
    if (dto.matricule !== undefined) student.matricule = dto.matricule || null;
    if (dto.whatsapp !== undefined) student.whatsapp = dto.whatsapp || null;
    if (dto.profilePictureUrl !== undefined) student.profilePictureUrl = dto.profilePictureUrl || null;
    if (dto.section !== undefined) student.section = dto.section;
    if (dto.level !== undefined) student.level = dto.level;
    if (dto.maxMentees !== undefined) student.maxMentees = dto.maxMentees;

    // Un ING4 parraine : sa capacité est obligatoire. Un ING3 n'en a pas.
    if (student.level === StudentLevel.ING4 && !student.maxMentees) {
      throw new BadRequestException('maxMentees est obligatoire pour un ING4');
    }
    if (student.level === StudentLevel.ING3) student.maxMentees = null;

    return this.students.save(student);
  }

  existsByEmail(email: string, manager?: EntityManager): Promise<boolean> {
    const repo = manager ? manager.getRepository(Student) : this.students;
    return repo.exists({ where: { email: email.toLowerCase() } });
  }

  /**
   * Insertion en lot utilisée par l'import. L'email est normalisé en minuscule
   * afin de garantir l'unicité au niveau applicatif comme en base.
   */
  async insertMany(
    rows: Omit<Student, 'id' | 'createdAt' | 'updatedAt'>[],
    manager?: EntityManager,
  ): Promise<Student[]> {
    const repo = manager ? manager.getRepository(Student) : this.students;
    const entities = rows.map((row) =>
      repo.create({ ...row, email: row.email.toLowerCase() }),
    );
    return repo.save(entities);
  }

  async assertEmailAvailable(
    email: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (await this.existsByEmail(email, manager)) {
      throw new ConflictException(`Un étudiant utilise déjà l'email ${email}`);
    }
  }
}
