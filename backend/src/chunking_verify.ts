import { FixedSizeChunker, SentenceAwareChunker, SemanticChunker } from './services/chunking';

// A long synthetic document containing multiple paragraphs, long sentences (>300 chars), and repeating topics
const syntheticDocument = `मुगल स्थापत्य कला का एक बेजोड़ नमूना ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के दक्षिणी तट पर स्थित है। इसे मुगल सम्राट शाहजहाँ ने अपनी प्रिय पत्नी मुमताज महल की याद में बनवाया था और इसका निर्माण कार्य लगभग 1631 से शुरू होकर 1648 तक चला था जिसमें देश-विदेश के हजारों कारीगरों ने भाग लिया था। यह इमारत सफेद संगमरमर से बनी है और इसके चारों कोनों पर मीनारें हैं जो इस मकबरे की सुरक्षा और सुंदरता को बढ़ाती हैं। ताजमहल न केवल भारत की बल्कि पूरे विश्व की ऐतिहासिक विरासतों में एक महत्वपूर्ण स्थान रखता है और इसे यूनेस्को द्वारा विश्व धरोहर घोषित किया गया है।

कृत्रिम बुद्धिमत्ता (एआई) और मशीन लर्निंग आज तकनीकी दुनिया में क्रांति ला रहे हैं। आरएजी यानी रिट्रीवल-ऑगमेंटेड जनरेशन मॉडल का उपयोग वर्तमान में एलएलएम (लार्ज लैंग्वेज मॉडल्स) को अधिक सटीक और तथ्य-आधारित बनाने के लिए किया जाता है क्योंकि यह बाहरी डेटाबेस से प्रासंगिक जानकारी खोजकर उत्तर तैयार करता है। इस प्रणाली में किसी प्रश्न के आते ही पहले उससे संबंधित संदर्भों को खोजा जाता है और फिर उन संदर्भों को मॉडल के प्रॉम्ट में जोड़कर अंतिम उत्तर उत्पन्न किया जाता है जिससे भ्रम या झूठ (हैलुसिनेशन) की संभावना बहुत कम हो जाती है।

यह एक अत्यधिक लंबा वाक्य है जिसे विशेष रूप से यह जांचने के लिए तैयार किया गया है कि क्या हमारा वाक्य-आधारित या निश्चित-आकार का चंकर तीन सौ से अधिक वर्णों की सीमाओं को पार करने वाले वाक्यों को सफलतापूर्वक विभाजित कर सकता है या नहीं; इस लंबे वाक्य में कई उप-वाक्य शामिल हैं जो कोमा और अर्धविराम के माध्यम से जुड़े हुए हैं ताकि हम सीमा पार होने पर होने वाले विभाजन व्यवहार और शब्दों के बीच के स्थान को सहेजने के व्यवहार को बारीकी से समझ सकें और उसे प्रमाणित कर सकें।`;

function printVerificationReport() {
  const docId = "synthetic-doc-verify";

  const fixed = new FixedSizeChunker(300, 50);
  const sentence = new SentenceAwareChunker(400);
  // Using lexical similarity fallback for offline evaluation
  const semantic = new SemanticChunker(0.65, undefined, 400);

  const fChunks = fixed.chunk(syntheticDocument, docId);
  const sChunks = sentence.chunk(syntheticDocument, docId);
  const semChunks = semantic.chunk(syntheticDocument, docId);

  const getStats = (chunks: any[]) => {
    if (chunks.length === 0) return { count: 0, avg: 0, min: 0, max: 0 };
    const lengths = chunks.map(c => c.length);
    const sum = lengths.reduce((a, b) => a + b, 0);
    return {
      count: chunks.length,
      avg: parseFloat((sum / chunks.length).toFixed(1)),
      min: Math.min(...lengths),
      max: Math.max(...lengths)
    };
  };

  const fixedStats = getStats(fChunks);
  const sentenceStats = getStats(sChunks);
  const semanticStats = getStats(semChunks);

  console.log("===============================================================================");
  console.log("Synthetic Document Chunking Boundary Verification Report");
  console.log("===============================================================================");
  console.log("Strategy   | Chunks | Avg Size | Min Size | Max Size | Boundary Splitting Behavior");
  console.log("-----------+--------+----------+----------+----------+-----------------------------");
  console.log(`FixedSize  | ${fixedStats.count.toString().padEnd(6)} | ${fixedStats.avg.toString().padEnd(8)} | ${fixedStats.min.toString().padEnd(8)} | ${fixedStats.max.toString().padEnd(8)} | Splits exactly at 300 chars (with 50 chars overlap)`);
  console.log(`Sentence   | ${sentenceStats.count.toString().padEnd(6)} | ${sentenceStats.avg.toString().padEnd(8)} | ${sentenceStats.min.toString().padEnd(8)} | ${sentenceStats.max.toString().padEnd(8)} | Splits at sentence endings (.!?।\\n), limits to 400 chars`);
  console.log(`Semantic   | ${semanticStats.count.toString().padEnd(6)} | ${semanticStats.avg.toString().padEnd(8)} | ${semanticStats.min.toString().padEnd(8)} | ${semanticStats.max.toString().padEnd(8)} | Groups sentences by lexical similarity threshold (0.65)`);
  console.log("===============================================================================\n");

  console.log("FixedSize Chunks Sample Text (First 2):");
  fChunks.slice(0, 2).forEach((c, i) => console.log(`[Chunk ${i}]: "${c.text.substring(0, 100)}..." (${c.length} chars)`));

  console.log("\nSentence-Aware Chunks Sample Text (First 2):");
  sChunks.slice(0, 2).forEach((c, i) => console.log(`[Chunk ${i}]: "${c.text.substring(0, 100)}..." (${c.length} chars)`));

  console.log("\nSemantic-Aware Chunks Sample Text (First 2):");
  semChunks.slice(0, 2).forEach((c, i) => console.log(`[Chunk ${i}]: "${c.text.substring(0, 100)}..." (${c.length} chars)`));
  console.log("===============================================================================");
}

if (require.main === module) {
  printVerificationReport();
}
