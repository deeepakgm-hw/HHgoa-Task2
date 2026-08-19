async function testBatch() {
  const { pipeline } = await import('@xenova/transformers');
  const extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { quantized: true });
  
  const texts = ['passage: hello world', 'passage: second passage text'];
  const t0 = Date.now();
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  console.log('Batch output type:', typeof out, 'dims:', out.dims, 'data length:', out.data.length, 'time:', Date.now() - t0);
}
testBatch().catch(console.error);
