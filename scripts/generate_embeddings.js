import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Read .env file manually
const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('File .env non trovato nella root del progetto.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim();
    env[key] = value;
  }
});

let supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const geminiApiKey = env.VITE_GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
  console.error('Credenziali mancanti nel file .env. Assicurati di avere:');
  console.error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY');
  process.exit(1);
}

// Clean URL from rest/v1 suffixes if present to avoid PostgREST PGRST125 error
if (supabaseUrl.endsWith('/rest/v1/')) {
  supabaseUrl = supabaseUrl.slice(0, -9);
} else if (supabaseUrl.endsWith('/rest/v1')) {
  supabaseUrl = supabaseUrl.slice(0, -8);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: 'SEMANTIC_SIMILARITY',
      outputDimensionality: 768
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

async function run() {
  console.log('Avvio generazione embeddings per le memorie migrate...');
  
  // Trova memorie che non hanno l'embedding
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, content')
    .is('embedding', null);

  if (error) {
    console.error('Errore nel recupero delle memorie:', error);
    process.exit(1);
  }

  console.log(`Trovate ${memories.length} memorie da elaborare.`);

  for (let i = 0; i < memories.length; i++) {
    const mem = memories[i];
    console.log(`[${i + 1}/${memories.length}] Generazione embedding per: "${mem.content.substring(0, 40)}..."`);
    try {
      const embedding = await generateEmbedding(mem.content);
      
      const { error: updateError } = await supabase
        .from('memories')
        .update({ embedding })
        .eq('id', mem.id);

      if (updateError) {
        console.error(`Errore durante l'aggiornamento di id ${mem.id}:`, updateError);
      } else {
        console.log('✓ Successo');
      }
    } catch (err) {
      console.error(`Fallito per id ${mem.id}:`, err.message);
    }
    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('Completato!');
}

run();
