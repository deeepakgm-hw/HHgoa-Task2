import { EmbeddingService } from './src/services/embeddings';
import * as dotenv from 'dotenv';
dotenv.config();

async function testRelevance() {
  const embedder = new EmbeddingService('gemini-embedding-2');

  const pairs = [
    {
      q: "भारत की राजधानी क्या है?",
      p1: "भारत की राजधानी नई दिल्ली है। यह भारत सरकार के तीनों अंगों का केंद्र है।",
      p2: "ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के तट पर स्थित एक विश्व धरोहर मक़बरा है।",
      p3: "एक निगम एक कंपनी या लोगों का समूह है जो एक एकल इकाई के रूप में कार्य करने के लिए अधिकृत है।"
    },
    {
      q: "ताजमहल कहाँ स्थित है?",
      p1: "ताजमहल भारत के उत्तर प्रदेश राज्य के आगरा शहर में यमुना नदी के तट पर स्थित एक विश्व धरोहर मक़बरा है।",
      p2: "जापान की राजधानी टोक्यो है, जो दुनिया के सबसे बड़े महानगरीय क्षेत्रों में से एक है।",
      p3: "पेरेग्रीन बाज़ दुनिया का सबसे तेज़ उड़ने वाला पक्षी है, जो 320 किमी/घंटा से अधिक गति तक पहुँच सकता है।"
    },
    {
      q: "जापान की राजधानी कौन सा शहर है?",
      p1: "जापान की राजधानी टोक्यो है। वर्ष 2007 में टोक्यो की जनसंख्या 127,433,494 थी।",
      p2: "कतर की राजधानी को दोहा कहा जाता है, जो कतर राज्य का सबसे बड़ा शहर है।",
      p3: "एक निगम एक कंपनी या लोगों का समूह है।"
    }
  ];

  function dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
  }

  console.log("=== MEASURING REAL EMBEDDING COSINE SIMILARITIES ===");
  for (const item of pairs) {
    console.log(`\nQuery: "${item.q}"`);
    const qVec = await embedder.embedText(item.q);

    const v1 = await embedder.embedText(item.p1);
    const v2 = await embedder.embedText(item.p2);
    const v3 = await embedder.embedText(item.p3);

    const s1 = dotProduct(qVec, v1);
    const s2 = dotProduct(qVec, v2);
    const s3 = dotProduct(qVec, v3);

    console.log(`  Target Relevant Passage Score:    ${s1.toFixed(4)} -> "${item.p1.substring(0, 50)}..."`);
    console.log(`  Unrelated Passage 1 Score:        ${s2.toFixed(4)} -> "${item.p2.substring(0, 50)}..."`);
    console.log(`  Unrelated Passage 2 Score:        ${s3.toFixed(4)} -> "${item.p3.substring(0, 50)}..."`);
  }
}

testRelevance().catch(console.error);
