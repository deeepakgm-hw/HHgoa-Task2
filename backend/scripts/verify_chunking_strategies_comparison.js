const { FixedSizeChunker, SentenceAwareChunker, SemanticChunker, MetadataAwareChunker } = require('../dist/services/chunking');
const { EmbeddingService } = require('../dist/services/embeddings');

async function runSideBySideComparison() {
  const sampleDocument = `मुगल स्थापत्य कला का एक बेजोड़ नमूना ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के दक्षिणी तट पर स्थित है। इसे मुगल सम्राट शाहजहाँ ने अपनी प्रिय पत्नी मुमताज महल की याद में बनवाया था और इसका निर्माण कार्य लगभग 1631 से शुरू होकर 1648 तक चला था जिसमें देश-विदेश के हजारों कारीगरों ने भाग लिया था। यह इमारत पूरी तरह से सफेद संगमरमर से बनी है और इसके चारों कोनों पर भव्य मीनारें हैं जो इस मकबरे की सुंदरता को बढ़ाती हैं।

कृत्रिम बुद्धिमत्ता (एआई) और मशीन लर्निंग आज तकनीकी दुनिया में व्यापक क्रांति ला रहे हैं। आरएजी यानी रिट्रीवल-ऑगमेंटेड जनरेशन मॉडल का उपयोग वर्तमान में लार्ज लैंग्वेज मॉडल्स को अधिक सटीक और तथ्य-आधारित बनाने के लिए किया जाता है क्योंकि यह बाहरी डेटाबेस से प्रासंगिक जानकारी खोजकर उत्तर तैयार करता है। इस प्रणाली में किसी प्रश्न के आते ही पहले उससे संबंधित संदर्भों को खोजा जाता है जिससे हैलुसिनेशन रुकता है।`;

  const docId = "doc-taj-and-ai-comparison";
  const metadata = {
    documentIndex: 42,
    passageIndex: 0,
    isSelected: true,
    sourceLanguage: "hin_Deva",
    targetLanguage: "eng_Latn",
    originalQuery: "ताजमहल किसने बनवाया और आरएजी क्या है?"
  };

  const embedService = new EmbeddingService();

  // 1. Strategy 1: Fixed-Size Chunker (300 chars, 50 overlap)
  const fixedChunker = new FixedSizeChunker(250, 40);
  const fixedChunks = fixedChunker.chunk(sampleDocument, docId, metadata);

  // 2. Strategy 2: Semantic (Meaning-Aware) Chunker with real E5 embeddings
  const semanticChunker = new SemanticChunker(0.82, embedService, 400);
  const semanticChunks = await semanticChunker.chunkAsync(sampleDocument, docId, metadata);

  // 3. Strategy 3: Metadata-Aware Chunker
  const metadataChunker = new MetadataAwareChunker(500);
  const metadataChunks = metadataChunker.chunk(sampleDocument, docId, metadata);

  console.log("===============================================================================");
  console.log("SIDE-BY-SIDE CHUNKING STRATEGY COMPARISON ON SAME MULTI-TOPIC DOCUMENT");
  console.log("===============================================================================");
  console.log(`Source Document Length: ${sampleDocument.length} characters (2 distinct thematic paragraphs)\n`);

  console.log("-------------------------------------------------------------------------------");
  console.log("STRATEGY 1: FIXED-SIZE SPLITTING (250 chars, 40 char overlap)");
  console.log("-------------------------------------------------------------------------------");
  console.log(`Produced ${fixedChunks.length} chunks. Boundaries cut strictly by character index:`);
  fixedChunks.forEach((c, idx) => {
    console.log(`\n[Fixed Chunk ${idx}] (${c.length} chars) | ID: ${c.chunkId}`);
    console.log(`  "${c.text}"`);
  });

  console.log("\n-------------------------------------------------------------------------------");
  console.log("STRATEGY 2: REAL E5 EMBEDDING-DRIVEN SEMANTIC (MEANING-AWARE) SPLITTING (Threshold: 0.82)");
  console.log("-------------------------------------------------------------------------------");
  console.log(`Produced ${semanticChunks.length} chunks. Boundaries placed at neural semantic similarity drop:`);
  semanticChunks.forEach((c, idx) => {
    console.log(`\n[Semantic Chunk ${idx}] (${c.length} chars) | ID: ${c.chunkId} | Split Reason: ${c.metadata.splitType} (Sim: ${c.metadata.splitSimilarity ?? 'N/A'})`);
    console.log(`  "${c.text}"`);
  });

  console.log("\n-------------------------------------------------------------------------------");
  console.log("STRATEGY 3: METADATA-AWARE CHUNKING (Logical Passage Preservation + Typed Schemas)");
  console.log("-------------------------------------------------------------------------------");
  console.log(`Produced ${metadataChunks.length} chunks. Retains complete logical document passage with rich metadata:`);
  metadataChunks.forEach((c, idx) => {
    console.log(`\n[Metadata Chunk ${idx}] (${c.length} chars) | ID: ${c.chunkId} | Title: "${c.metadata.title}"`);
    console.log(`  Metadata Payload: passageId=${c.metadata.passageId}, isSelected=${c.metadata.isSelected}, docIdx=${c.metadata.documentIndex}, passageIdx=${c.metadata.passageIndex}`);
    console.log(`  Text Preview: "${c.text.substring(0, 120)}..."`);
  });
  console.log("\n===============================================================================");
}

runSideBySideComparison().catch(console.error);
