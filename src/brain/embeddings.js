const GEMINI_EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

export async function generateEmbedding(text) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not defined in env');
  }

  const response = await fetch(
    `${GEMINI_EMBEDDING_URL}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'SEMANTIC_SIMILARITY',
        outputDimensionality: 768
      })
    }
  );
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding failed: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.embedding.values;
}
