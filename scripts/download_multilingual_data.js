const https = require('https');
const fs = require('fs');
const path = require('path');

const tasks = [
  {
    lang: 'ta',
    name: 'tamval.parquet',
    url: 'https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/validation/tamval.parquet',
    dest: path.join(__dirname, '../backend/data/msmarco-xi/raw/ta/tamval.parquet')
  },
  {
    lang: 'te',
    name: 'telval.parquet',
    url: 'https://huggingface.co/datasets/ai4bharat/MSMARCO-XI/resolve/main/validation/telval.parquet',
    dest: path.join(__dirname, '../backend/data/msmarco-xi/raw/te/telval.parquet')
  }
];

function downloadFile(curUrl, targetPath) {
  return new Promise((resolve, reject) => {
    https.get(curUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, targetPath));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed with status ${res.statusCode}`));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      console.log(`Downloading to ${targetPath} (${(total / (1024*1024)).toFixed(1)} MB)...`);
      let downloaded = 0;
      let lastPct = 0;

      const file = fs.createWriteStream(targetPath);
      res.on('data', chunk => {
        downloaded += chunk.length;
        const pct = Math.floor((downloaded / total) * 100);
        if (pct >= lastPct + 20) {
          console.log(`Progress: ${pct}% (${(downloaded / (1024*1024)).toFixed(1)} MB)`);
          lastPct = pct;
        }
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Completed: ${targetPath}`);
        resolve();
      });
    }).on('error', reject);
  });
}

(async () => {
  for (const t of tasks) {
    if (fs.existsSync(t.dest) && fs.statSync(t.dest).size > 400000000) {
      console.log(`File already downloaded: ${t.dest}`);
      continue;
    }
    console.log(`\n--- Starting ${t.lang.toUpperCase()} download (${t.name}) ---`);
    await downloadFile(t.url, t.dest);
  }
  console.log('\nAll downloads complete!');
})();
