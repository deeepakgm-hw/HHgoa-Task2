import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parquetRead } from 'hyparquet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../backend/data/msmarco-xi');
const RAW_DIR = path.join(DATA_DIR, 'raw');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed');

if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
}

function bigintReplacer(k, v) {
  return typeof v === 'bigint' ? Number(v) : v;
}

export async function readParquetRows(filePath, maxRows = 20) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return [];
  }
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const rows = [];
  await parquetRead({
    file: arrayBuffer,
    onRowGroup: (rowGroup) => {
      // Process rows
    },
    onComplete: (data) => {
      // data is an array of columns
      const cols = data;
      // Get column names if available or read row by row
    }
  });

  return rows;
}
