import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { Student, StudentLevel } from './student.entity.js';
import { QueryStudentsDto } from './dto/query-students.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
  ) {}

  findAll(query: QueryStudentsDto): Promise<Student[]> {
    const where: Record<string, unknown> = {};
    if (query.level) where.level = query.level;
    if (query.search) {
      where.lastName = ILike(`%${query.search}%`);
    }
    return this.students.find({
      where,
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  findAllByLevel(level: StudentLevel): Promise<Student[]> {
    return this.students.find({ where: { level }, order: { lastName: 'ASC' } });
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

  async update(id: string, dto: UpdateStudentDto): Promise<Student> {
    const student = await this.findOneOrFail(id);
    Object.assign(student, dto);
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
