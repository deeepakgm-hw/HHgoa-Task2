import * as fs from 'fs';
import * as path from 'path';
import { parquetRead, parquetMetadata } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

async function main() {
  const parquetPath = path.join(__dirname, '..', 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
  if (!fs.existsSync(parquetPath)) {
    console.error('File not found:', parquetPath);
    return;
  }
  const stat = fs.statSync(parquetPath);
  console.log(`File: ${parquetPath}`);
  console.log(`Size: ${stat.size} bytes (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

  const buffer = fs.readFileSync(parquetPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const metadata = parquetMetadata(arrayBuffer);
  console.log('Metadata num_rows:', metadata.num_rows);
  console.log('Metadata row_groups:', metadata.row_groups.length);
  console.log('Schema elements:');
  metadata.schema.forEach((s, idx) => {
    console.log(`  [${idx}] name: ${s.name}, type: ${s.type}, converted_type: ${s.converted_type}`);
  });

  // Let's read first 5 rows to see data format
  await parquetRead({
    file: arrayBuffer,
    compressors,
    rowStart: 0,
    rowEnd: 5,
    onComplete: (rows) => {
      console.log('\nFirst 5 rows:');
      rows.forEach((r, idx) => {
        console.log(`--- Row ${idx} ---`);
        console.log(JSON.stringify(r, null, 2).substring(0, 500));
      });
    }
  });
}

main().catch(console.error);
