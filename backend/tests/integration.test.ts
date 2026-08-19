import request from 'supertest';
import { app } from '../src/server';
import { VectorDatabase } from '../src/services/vectorDb';
import * as path from 'path';

// Force test environment
process.env.NODE_ENV = 'test';

describe('RAG API Endpoints Integration', () => {
  describe('GET /api/health', () => {
    it('should return UP status with database metadata', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('services');
    });
  });

  describe('POST /api/query (Text Search)', () => {
    it('should return grounded answers and telemetry data for valid queries', async () => {
      const response = await request(app)
        .post('/api/query')
        .send({
          query: "भारत की राजधानी क्या है?",
          strategy: "semantic",
          rerank: true
        });

      if (response.status === 429) {
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('RATE_LIMITED');
      } else {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('answer');
        expect(response.body).toHaveProperty('telemetry');
        expect(response.body).toHaveProperty('sources');
        expect(response.body.telemetry.total).toBeGreaterThan(0);
      }
    }, 30000);

    it('should trigger query length guardrail for short queries', async () => {
      const response = await request(app)
        .post('/api/query')
        .send({
          query: "hi"
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("too short");
    });
  });

  describe('POST /api/voice-query (Voice Search)', () => {
    it('should successfully upload audio buffer and execute RAG pipeline', async () => {
      const dummyBuffer = Buffer.from('fake-audio-wav-data');
      
      const response = await request(app)
        .post('/api/voice-query')
        .attach('audio', dummyBuffer, 'test_query.wav')
        .field('strategy', 'fixed')
        .field('rerank', 'true')
        .field('languageCode', 'hi-IN');

      if (response.status === 429) {
        expect(response.body).toHaveProperty('error');
      } else {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('transcript');
        expect(response.body).toHaveProperty('answer');
        expect(response.body).toHaveProperty('telemetry');
        if (response.body.telemetry.stt !== null) {
          expect(response.body.telemetry.stt).toBeGreaterThanOrEqual(0);
        }
      }
    }, 15000);

    it('should return 400 bad request if audio field is missing', async () => {
      const response = await request(app)
        .post('/api/voice-query')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});
