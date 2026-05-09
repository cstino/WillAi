import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { interpretCommand, executeIntent } from "../_shared/brain.ts"

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const ALLOWED_USER_ID = 335863938
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

serve(async (req) => {
  try {
    const update = await req.json()
    const message = update.message || update.edited_message
    
    if (!message || message.from.id !== ALLOWED_USER_ID) {
      return new Response("Unauthorized", { status: 200 }) // Telegram expects 200
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let textToProcess = message.text

    // Gestione Messaggi Vocali
    if (message.voice) {
      const fileId = message.voice.file_id
      // 1. Otteniamo il percorso del file da Telegram
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
      const fileData = await fileRes.json()
      const filePath = fileData.result.file_path
      
      // 2. Scarichiamo l'audio
      const audioRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
      const audioBlob = await audioRes.arrayBuffer()
      
      // 3. Mandiamo a Gemini per la trascrizione
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Trascrivi esattamente questo audio in italiano. Restituisci solo il testo trascritto." },
              { inline_data: { mime_type: "audio/ogg", data: btoa(String.fromCharCode(...new Uint8Array(audioBlob))) } }
            ]
          }]
        })
      })
      const geminiData = await geminiRes.json()
      textToProcess = geminiData.candidates[0].content.parts[0].text
    }

    if (!textToProcess) return new Response("No text", { status: 200 })

    // Elaborazione Brain
    const interpreted = await interpretCommand(textToProcess)
    interpreted.input_text = textToProcess
    const responseText = await executeIntent(supabase, interpreted, 'telegram')

    // Risposta a Telegram
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: responseText,
        parse_mode: 'Markdown'
      })
    })

    return new Response("OK", { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response("Error", { status: 200 })
  }
})
