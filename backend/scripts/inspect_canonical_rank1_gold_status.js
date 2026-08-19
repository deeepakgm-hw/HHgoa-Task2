const path = require('path');
const { VectorDatabase } = require('../dist/services/vectorDb');
const { RetrievalService } = require('../dist/services/retrieval');
const { EmbeddingService } = require('../dist/services/embeddings');

async function inspectRank1GoldStatus() {
  const vsPath = path.join(__dirname, '..', 'data', 'vector_store.json');
  const vectorDb = new VectorDatabase();
  await vectorDb.loadFromFileAsync(vsPath);

  const embedService = new EmbeddingService();
  const retrievalService = new RetrievalService(vectorDb);

  const testQueries = [
    {
      id: 'hi-corp',
      language: 'hi',
      languageName: 'Hindi',
      query: 'कॉर्पोरेशन क्या है?'
    },
    {
      id: 'hi-stye',
      language: 'hi',
      languageName: 'Hindi',
      query: 'स्टाई कारण होता है'
    },
    {
      id: 'kn-corp',
      language: 'kn',
      languageName: 'Kannada',
      query: '. ಕಾರ್ಪೊರೇಷನ್ ಎಂದರೇನು?'
    },
    {
      id: 'ta-corp',
      language: 'ta',
      languageName: 'Tamil',
      query: 'கார்ப்பரேஷன் என்றால் என்ன?'
    },
    {
      id: 'te-corp',
      language: 'te',
      languageName: 'Telugu',
      query: 'కార్పొరేషన్ అంటే ఏమిటి?'
    },
    {
      id: 'en-corp',
      language: 'en',
      languageName: 'English',
      query: '. what is a corporation?'
    }
  ];

  console.log("===============================================================================");
  console.log("EXACT RANK-1 GOLD MATCH INSPECTION FOR 6 CANONICAL DEMO QUERIES");
  console.log("===============================================================================\n");

  const results = [];

  for (const t of testQueries) {
    const qEmb = await embedService.embedText(t.query, true);
    const retrieved = await retrievalService.retrieve(t.query, qEmb, {
      topK: 3,
      strategy: 'semantic',
      language: t.language,
      hybridWeight: 0.25
    });

    const rank1 = retrieved[0];
    const chunk = rank1 ? rank1.chunk : null;
    const isSelected = chunk?.metadata?.isSelected === true;
    const pIdx = chunk?.metadata?.passageIdx;
    const docId = chunk?.metadata?.queryId;
    const text = chunk?.text || '';

    results.push({
      language: t.languageName,
      query: t.query,
      isGoldMatch: isSelected,
      passageIdx: pIdx,
      docId,
      score: rank1?.score?.toFixed(3),
      vectorScore: rank1?.vectorScore?.toFixed(3),
      lexicalScore: rank1?.lexicalScore?.toFixed(3),
      textSnippet: text.substring(0, 150)
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

inspectRank1GoldStatus().catch(console.error);
