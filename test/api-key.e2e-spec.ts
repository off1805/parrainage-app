import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('ApiKeyGuard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Override the environment directly for the test
    process.env.ADMIN_API_KEY = 'test-secret-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuse l\'accès à une route admin sans clé (401)', async () => {
    await request(app.getHttpServer())
      .get('/students')
      .expect(401)
      .expect((res) => {
        expect(res.body.message).toBe('Clé d\'API invalide ou absente');
      });

    await request(app.getHttpServer())
      .post('/pairing-sessions')
      .expect(401);
  });

  it('refuse l\'accès avec une mauvaise clé (401)', async () => {
    await request(app.getHttpServer())
      .get('/students')
      .set('x-api-key', 'wrong-key')
      .expect(401);

    await request(app.getHttpServer())
      .post('/pairing-sessions')
      .set('x-api-key', 'wrong-key')
      .expect(401);
  });

  it('autorise l\'accès avec la bonne clé', async () => {
    await request(app.getHttpServer())
      .get('/students')
      .set('x-api-key', 'test-secret-key')
      .expect((res) => {
        expect(res.status).not.toBe(401);
      });

    await request(app.getHttpServer())
      .post('/pairing-sessions')
      .set('x-api-key', 'test-secret-key')
      .expect((res) => {
        expect(res.status).not.toBe(401);
      });
  });

  it('autorise l\'accès public sans clé', () => {
    return request(app.getHttpServer())
      .get('/invitations/verify?token=fake')
      .expect((res) => {
        expect(res.status).not.toBe(401);
      });
  });
});
