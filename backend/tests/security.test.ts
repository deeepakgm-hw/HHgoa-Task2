import * as fs from 'fs';
import * as path from 'path';

describe('Security & Secrets Invariant Check', () => {
  const rootDir = path.join(__dirname, '..', '..');

  it('should verify .env.example contains only placeholders, no real API keys', () => {
    const envExamplePath = path.join(rootDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const content = fs.readFileSync(envExamplePath, 'utf8');
    
    // Check that keys are mapped to placeholders
    expect(content).toContain("SARVAM_API_KEY=your_sarvam_api_key_here");
    expect(content).toContain("GEMINI_API_KEY=your_gemini_api_key_here");

    // Make sure no raw api values are present
    expect(content).not.toContain("AIzaSy");
    expect(content).not.toContain("sk-");
  });

  it('should verify .gitignore excludes .env files and vector store caches', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf8');
    expect(content).toContain(".env");
    expect(content).toContain("vector_store.json");
    expect(content).toContain("embeddings_cache.json");
  });

  it('should scan backend codebases and check that no actual secrets are committed', () => {
    // Audit a few key files to check that no placeholder variables were overwritten with real keys
    const filesToAudit = [
      path.join(rootDir, 'backend', 'src', 'server.ts'),
      path.join(rootDir, 'backend', 'src', 'services', 'embeddings.ts'),
      path.join(rootDir, 'backend', 'src', 'services', 'generation.ts'),
      path.join(rootDir, 'backend', 'src', 'services', 'stt.ts')
    ];

    for (const file of filesToAudit) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        // Gemini API keys start with AIza
        expect(content).not.toMatch(/AIzaSy[A-Za-z0-9_-]{35}/);
        // OpenAI format sk-
        expect(content).not.toMatch(/sk-[A-Za-z0-9]{48}/);
      }
    }
  });
});
