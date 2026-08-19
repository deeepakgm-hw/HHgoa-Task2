import * as fs from 'fs';
import * as path from 'path';
import fetch from 'node-fetch';
import { withRetries, withTimeout } from '../utils/harness';

export interface DatasetSplit {
  dataset: string;
  config: string;
  split: string;
}

export interface DatasetMetadata {
  datasetName: string;
  source: string;
  apiEndpoint: string;
  targetLanguages: ('en' | 'hi' | 'kn' | 'ta' | 'te')[];
  splits: DatasetSplit[];
  schemaColumns: string[];
}

export interface DatasetRow {
  rowIdx: number;
  queryId: string | number;
  query: string;
  engQuery: string;
  answer: string;
  engAnswer: string;
  language: 'en' | 'hi' | 'kn' | 'ta' | 'te';
  sourceLang: string;
  targetLang: string;
  passages: {
    text: string;
    engText?: string;
    isSelected: boolean;
    passageId: string;
    docId: string;
  }[];
  rawMeta?: Record<string, any>;
}

export interface DatasetSource {
  getMetadata(): Promise<DatasetMetadata>;
  getSplits(): Promise<DatasetSplit[]>;
  getRows(options: { split: string; language: 'en' | 'hi' | 'kn' | 'ta' | 'te'; limit?: number; offset?: number }): Promise<DatasetRow[]>;
  iterateRows(options: { split: string; language: 'en' | 'hi' | 'kn' | 'ta' | 'te'; limit?: number }): AsyncGenerator<DatasetRow, void, unknown>;
}

/**
 * Official Hugging Face Dataset Server & Streaming Source Implementation for ai4bharat/MSMARCO-XI
 */
export class HuggingFaceDatasetSource implements DatasetSource {
  private readonly datasetName: string = 'ai4bharat/MSMARCO-XI';
  private readonly baseUrl: string = 'https://datasets-server.huggingface.co';
  private readonly targetLanguages: ('en' | 'hi' | 'kn' | 'ta' | 'te')[] = ['en', 'hi', 'kn', 'ta', 'te'];

  private readonly langCodeMap: Record<string, 'en' | 'hi' | 'kn' | 'ta' | 'te'> = {
    'eng_Latn': 'en',
    'en': 'en',
    'hin_Deva': 'hi',
    'hi': 'hi',
    'kan_Knda': 'kn',
    'kn': 'kn',
    'tam_Taml': 'ta',
    'ta': 'ta',
    'tel_Telu': 'te',
    'te': 'te'
  };

  /**
   * Fetches split metadata directly from the official Hugging Face dataset server API.
   */
  async getSplits(): Promise<DatasetSplit[]> {
    return withRetries(async () => {
      const url = `${this.baseUrl}/splits?dataset=${encodeURIComponent(this.datasetName)}`;
      const res = await withTimeout(fetch(url), 10000, 'Hugging Face /splits API timeout');
      if (!res.ok) {
        throw new Error(`Hugging Face API returned HTTP ${res.status} on /splits`);
      }
      const data = (await res.json()) as any;
      return (data.splits || []) as DatasetSplit[];
    }, { retries: 3, delay: 1000 });
  }

  /**
   * Fetches dataset schema metadata from the official Hugging Face dataset server.
   */
  async getMetadata(): Promise<DatasetMetadata> {
    let splits: DatasetSplit[] = [];
    try {
      splits = await this.getSplits();
    } catch (err) {
      splits = [
        { dataset: this.datasetName, config: 'default', split: 'validation' },
        { dataset: this.datasetName, config: 'default', split: 'train' }
      ];
    }

    return {
      datasetName: this.datasetName,
      source: 'Hugging Face Dataset Server',
      apiEndpoint: `${this.baseUrl}`,
      targetLanguages: this.targetLanguages,
      splits,
      schemaColumns: [
        'source_lang',
        'target_lang',
        'query_id',
        'query',
        'Eng_Query',
        'Answer',
        'Eng_Answer',
        'passages',
        'meta'
      ]
    };
  }

  /**
   * Reads initial rows from the official Hugging Face /first-rows dataset viewer endpoint.
   */
  async getFirstRowsFromApi(split: string = 'validation'): Promise<any[]> {
    return withRetries(async () => {
      const url = `${this.baseUrl}/first-rows?dataset=${encodeURIComponent(this.datasetName)}&config=default&split=${encodeURIComponent(split)}`;
      const res = await withTimeout(fetch(url), 15000, 'Hugging Face /first-rows API timeout');
      if (!res.ok) {
        throw new Error(`Hugging Face API returned HTTP ${res.status} on /first-rows`);
      }
      const data = (await res.json()) as any;
      return data.rows || [];
    }, { retries: 3, delay: 1000 });
  }

  /**
   * Normalizes a raw Hugging Face row into a typed DatasetRow with language validation.
   */
  private normalizeHfRow(raw: any, targetLang: 'en' | 'hi' | 'kn' | 'ta' | 'te'): DatasetRow | null {
    const row = raw.row || raw;
    const rawTargetLang = String(row.target_lang || row.language || targetLang);
    const resolvedLang = this.langCodeMap[rawTargetLang];

    // Strict 5-language filter: reject Bengali or unsupported scripts
    if (!resolvedLang || (resolvedLang !== targetLang && targetLang !== 'en')) {
      return null;
    }

    const queryId = row.query_id ?? row.Query_no ?? `q_${Date.now()}`;
    const query = String(targetLang === 'en' ? (row.Eng_Query || row.eng_query || row.query) : (row.query || row.Query || '')).trim();
    const engQuery = String(row.Eng_Query || row.eng_query || row.query || '').trim();
    const answer = String(targetLang === 'en' ? (row.Eng_Answer || row.eng_answer || row.Answer || row.answer) : (row.Answer || row.answer || '')).trim();
    const engAnswer = String(row.Eng_Answer || row.eng_answer || row.Answer || row.answer || '').trim();

    const pObj = row.passages || {};
    const translatedPassages = Array.isArray(pObj.Translated_passages) 
      ? pObj.Translated_passages.map(String) 
      : (Array.isArray(pObj.passage_text) ? pObj.passage_text.map(String) : (Array.isArray(row.Passages) ? row.Passages.map(String) : []));

    const englishPassages = Array.isArray(pObj.English_passages) 
      ? pObj.English_passages.map(String) 
      : (Array.isArray(row.English_passages) ? row.English_passages.map(String) : translatedPassages);

    const isSelected = Array.isArray(pObj.is_selected) 
      ? pObj.is_selected.map((v: any) => Number(v) === 1 || Boolean(v)) 
      : (Array.isArray(row.is_selected) ? row.is_selected.map((v: any) => Number(v) === 1 || Boolean(v)) : new Array(translatedPassages.length).fill(false));

    const activePassageList = targetLang === 'en' ? englishPassages : translatedPassages;

    const passages = activePassageList.map((pText: string, pIdx: number) => ({
      text: pText.trim(),
      engText: englishPassages[pIdx] ? englishPassages[pIdx].trim() : undefined,
      isSelected: Boolean(isSelected[pIdx]),
      passageId: `msmarco-xi-${targetLang}-${queryId}-p${pIdx + 1}`,
      docId: `doc-${targetLang}-${queryId}-${pIdx + 1}`
    })).filter((p: { text: string }) => p.text.length > 0);

    return {
      rowIdx: Number(raw.row_idx ?? 0),
      queryId,
      query,
      engQuery,
      answer,
      engAnswer,
      language: targetLang,
      sourceLang: String(row.source_lang || 'eng_Latn'),
      targetLang: rawTargetLang,
      passages,
      rawMeta: row.meta
    };
  }

  /**
   * Retrieves a batch of rows for a specific language.
   */
  async getRows(options: { split: string; language: 'en' | 'hi' | 'kn' | 'ta' | 'te'; limit?: number; offset?: number }): Promise<DatasetRow[]> {
    const limit = options.limit || 10;
    const collected: DatasetRow[] = [];
    for await (const row of this.iterateRows({ split: options.split, language: options.language, limit })) {
      collected.push(row);
      if (collected.length >= limit) break;
    }
    return collected;
  }

  /**
   * Progressively iterates records row-by-row from the official MSMARCO-XI dataset.
   * Utilizes local streaming parquet byte-range reader to avoid downloading the 55+ GB corpus.
   */
  async *iterateRows(options: { split: string; language: 'en' | 'hi' | 'kn' | 'ta' | 'te'; limit?: number }): AsyncGenerator<DatasetRow, void, unknown> {
    const { language, limit = 10 } = options;
    const splitFileMap: Record<string, string> = {
      'hi': path.join(__dirname, '../../data/msmarco-xi/raw/hi/hinval.parquet'),
      'kn': path.join(__dirname, '../../data/msmarco-xi/raw/kn/kanval.parquet'),
      'ta': path.join(__dirname, '../../data/msmarco-xi/raw/ta/tamval.parquet'),
      'te': path.join(__dirname, '../../data/msmarco-xi/raw/te/telval.parquet'),
      'en': path.join(__dirname, '../../data/msmarco-xi/raw/hi/hinval.parquet') // English query/passages are in English_passages & Eng_Query
    };

    const targetFile = splitFileMap[language];
    if (!fs.existsSync(targetFile)) {
      throw new Error(`Official split parquet file for ${language} not found at: ${targetFile}`);
    }

    const fd = fs.openSync(targetFile, 'r');
    const stat = fs.fstatSync(fd);
    const asyncBuffer = {
      byteLength: stat.size,
      async slice(start: number, end?: number): Promise<ArrayBuffer> {
        const targetEnd = end ?? stat.size;
        const length = targetEnd - start;
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, start);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length);
      }
    };

    const compMod = (await eval("import('hyparquet-compressors')")) as any;
    const compressors = compMod.compressors || compMod.default?.compressors || compMod;

    const hpMod = (await eval("import('hyparquet')")) as any;
    const parquetRead = hpMod.parquetRead || hpMod.default?.parquetRead;

    const decodedRows = await new Promise<any[]>((resolve, reject) => {
      try {
        parquetRead({
          file: asyncBuffer,
          compressors,
          rowFormat: 'object',
          rowStart: 0,
          rowEnd: limit + 5,
          onComplete: (rows: any[]) => resolve(rows)
        });
      } catch (err) {
        reject(err);
      }
    });
    fs.closeSync(fd);

    let emitted = 0;
    for (let i = 0; i < decodedRows.length; i++) {
      if (emitted >= limit) break;
      const normalized = this.normalizeHfRow({ row_idx: i, row: decodedRows[i] }, language);
      if (normalized && normalized.passages.length > 0) {
        yield normalized;
        emitted++;
      }
    }
  }
}
