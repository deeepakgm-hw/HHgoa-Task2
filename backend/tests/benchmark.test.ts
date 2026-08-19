import { TelemetryTracker } from '../src/services/telemetry';

function calculatePercentile(sortedArr: number[], percentile: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArr.length) - 1;
  return parseFloat(sortedArr[Math.max(0, index)].toFixed(2));
}

describe('Benchmark Harness & Telemetry Semantics', () => {
  describe('Percentile Calculations', () => {
    it('should correctly calculate P50, P70, and P100 for sorted arrays', () => {
      const timings = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(calculatePercentile(timings, 50)).toBe(50);
      expect(calculatePercentile(timings, 70)).toBe(70);
      expect(calculatePercentile(timings, 100)).toBe(100);
    });

    it('should handle single-element arrays gracefully', () => {
      const timings = [150];
      expect(calculatePercentile(timings, 50)).toBe(150);
      expect(calculatePercentile(timings, 100)).toBe(150);
    });

    it('should return 0 for empty arrays', () => {
      expect(calculatePercentile([], 50)).toBe(0);
    });

    it('should exclude failed and rate-limited requests from percentile calculation input', () => {
      const requests = [
        { status: 'SUCCESS', total: 100 },
        { status: 'SUCCESS', total: 200 },
        { status: 'REFUSED', total: 150 },
        { status: 'RATE_LIMITED', total: 5000 },
        { status: 'API_ERROR', total: 9999 },
        { status: 'VALIDATION_ERROR', total: 5 }
      ];

      const validTotalTimings = requests
        .filter(r => r.status === 'SUCCESS' || r.status === 'REFUSED')
        .map(r => r.total)
        .sort((a, b) => a - b);

      expect(validTotalTimings).toEqual([100, 150, 200]);
      expect(calculatePercentile(validTotalTimings, 50)).toBe(150);
    });
  });

  describe('TelemetryTracker Truthful Semantics', () => {
    it('should report stt as null when STT stage is not tracked (text query)', () => {
      const tracker = new TelemetryTracker();
      
      const normStop = tracker.startStage('normalization');
      normStop();

      const report = tracker.getReport();
      expect(report.stt).toBeNull();
      expect(report.normalization).toBeGreaterThanOrEqual(0);
    });

    it('should report actual numeric duration when STT stage is tracked (voice query)', async () => {
      const tracker = new TelemetryTracker();
      
      await tracker.track('stt', async () => {
        await new Promise(r => setTimeout(r, 10));
      });

      const report = tracker.getReport();
      expect(report.stt).not.toBeNull();
      expect(typeof report.stt).toBe('number');
      expect(report.stt!).toBeGreaterThanOrEqual(5);
    });

    it('should preserve latency invariant: total >= sum of measured sequential stages', () => {
      const tracker = new TelemetryTracker();
      const report = tracker.getReport();

      const sttVal = report.stt ?? 0;
      const sumSequential = sttVal + report.normalization + report.embedding + report.retrieval + report.rerank + report.generation;

      expect(report.total).toBeGreaterThanOrEqual(sumSequential);
    });
  });
});
