import { GenerationService } from './src/services/generation';

async function test() {
  const gen = new GenerationService();
  console.log('Model configured:', (gen as any).modelName);
  console.log('useMock:', (gen as any).useMock);
  const start = Date.now();
  try {
    const res = await gen.generateGeneralKnowledgeAnswer('Who is the Prime Minister of India?');
    console.log('Success in', Date.now() - start, 'ms:');
    console.log('Result:', JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error('Error in', Date.now() - start, 'ms:', err.message || err);
  }
}

test();
