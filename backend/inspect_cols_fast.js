const fs = require('fs');
const path = require('path');
const { parquetRead, parquetMetadata } = require('./node_modules/hyparquet');
const { compressors } = require('./node_modules/hyparquet-compressors');

const filePath = path.join(__dirname, 'data', 'msmarco-xi', 'raw', 'hinval.parquet');
const fileBuffer = fs.readFileSync(filePath);
const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);

parquetRead({
  file: arrayBuffer,
  compressors,
  rowStart: 0,
  rowEnd: 1,
  onComplete: (data) => {
    console.log('Total rows returned:', data.length);
    const row = data[0];
    row.forEach((col, idx) => {
      console.log(`Col [${idx}]:`, typeof col, Array.isArray(col) ? `Array length ${col.length}` : (typeof col === 'string' ? col.substring(0, 80) : col));
    });
  }
});
