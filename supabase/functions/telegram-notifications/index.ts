import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const ALLOWED_USER_ID = Deno.env.get('ALLOWED_TELEGRAM_USER_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

Deno.serve(async (req) => {
  try {
    const now = new Date()
    const romeTime = new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).formatToParts(now)

    const hour = parseInt(romeTime.find(p => p.type === 'hour')?.value || '0')
    const minute = parseInt(romeTime.find(p => p.type === 'minute')?.value || '0')
    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Europe/Rome' }).format(now)

    // --- QUERY NEWS PREFERENCES ---
    const { data: profile } = await supabase
      .from('user_profile')
      .select('news_topics, news_delivery_time')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single()

    if (profile && profile.news_delivery_time && profile.news_topics && profile.news_topics.length > 0) {
      const [prefHour, prefMin] = profile.news_delivery_time.split(':').map((v: string) => parseInt(v))
      const currentTotalMin = hour * 60 + minute
      const targetTotalMin = prefHour * 60 + prefMin

      if (currentTotalMin >= targetTotalMin && currentTotalMin < targetTotalMin + 15) {
        await sendNewsDigest(now, profile.news_topics)
      }
    }

    // --- A. RIEPILOGO MATTUTINO (08:00) ---
    if (hour === 8 && minute < 15) {
      await sendDailySummary(now)
    }

    // --- B. RIEPILOGO SETTIMANALE (Lunedì 08:30) ---
    if (weekday === 'Monday' && hour === 8 && minute >= 30 && minute < 45) {
      await sendWeeklySummary(now)
    }

    // --- C. PROMEMORIA PRE-EVENTO (Sempre) ---
    await sendPreEventReminders(now)

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
  } catch (err) {
    console.error('Error in notification function:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

async function sendTelegramMessage(text: string) {
  if (!text) return
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ALLOWED_USER_ID,
      text: text,
      parse_mode: 'Markdown'
    })
  })
}

async function sendDailySummary(now: Date) {
  const today = new Date(now).toISOString().split('T')[0]
  const tomorrowDate = new Date(now)
  tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrow = tomorrowDate.toISOString().split('T')[0]

  // Query oggi
  const { data: todayEvents } = await supabase
    .from('memories')
    .select('*')
    .in('memory_type', ['event', 'reminder'])
    .gt('relevance_score', 0)
    .gte('trigger_at', `${today}T00:00:00`)
    .lte('trigger_at', `${today}T23:59:59`)

  // Query domani
  const { data: tomorrowEvents } = await supabase
    .from('memories')
    .select('*')
    .in('memory_type', ['event', 'reminder'])
    .gt('relevance_score', 0)
    .gte('trigger_at', `${tomorrow}T00:00:00`)
    .lte('trigger_at', `${tomorrow}T23:59:59`)

  // Query note ieri
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const { count: notesCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
    .gt('relevance_score', 0)
    .gte('created_at', `${yesterdayStr}T00:00:00`)
    .lte('created_at', `${yesterdayStr}T23:59:59`)

  if ((!todayEvents || todayEvents.length === 0) && (!tomorrowEvents || tomorrowEvents.length === 0) && (notesCount || 0) === 0) {
    console.log('Nulla da notificare oggi.')
    return
  }

  let message = `☀️ *Buongiorno Cristiano!*\n\n`
  
  message += `📅 *Oggi, ${new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}:*\n`
  if (todayEvents && todayEvents.length > 0) {
    todayEvents.forEach(e => {
      const time = new Date(e.trigger_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      message += `• ${e.content} — ${time}\n`
    })
  } else {
    message += `• Oggi nessun impegno in programma 🎉\n`
  }

  if (tomorrowEvents && tomorrowEvents.length > 0) {
    message += `\n📅 *Domani:*\n`
    tomorrowEvents.forEach(e => {
      const time = new Date(e.trigger_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      message += `• ${e.content} — ${time}\n`
    })
  }

  if (notesCount && notesCount > 0) {
    message += `\n📝 Ieri hai aggiunto ${notesCount} nota/e.`
  }

  await sendTelegramMessage(message)
}

async function sendWeeklySummary(now: Date) {
  const weekEnd = new Date(now)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().split('T')[0]
  const todayStr = now.toISOString().split('T')[0]

  const { data: weekEvents } = await supabase
    .from('memories')
    .select('*')
    .in('memory_type', ['event', 'reminder'])
    .gt('relevance_score', 0)
    .gte('trigger_at', `${todayStr}T00:00:00`)
    .lte('trigger_at', `${weekEndStr}T23:59:59`)
    .order('trigger_at', { ascending: true })

  const { count: totalNotes } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true })
    .in('memory_type', ['knowledge', 'idea', 'fact', 'preference'])
    .gt('relevance_score', 0)

  let message = `📊 *La tua settimana (${now.getDate()}-${weekEnd.getDate()} ${new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(now)}):*\n`
  
  if (weekEvents && weekEvents.length > 0) {
    weekEvents.forEach(e => {
      const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(new Date(e.trigger_at))
      message += `• ${date.charAt(0).toUpperCase() + date.slice(1)}: ${e.content}\n`
    })
  } else {
    message += `• Nessun impegno programmato per questa settimana.`
  }

  message += `\n📝 Hai ${totalNotes} note totali.`

  await sendTelegramMessage(message)
}

async function sendPreEventReminders(now: Date) {
  const nowStr = now.toISOString()

  // Cerca eventi che iniziano tra adesso e i prossimi 65 minuti
  const { data: upcomingEvents } = await supabase
    .from('memories')
    .select('*')
    .in('memory_type', ['event', 'reminder'])
    .gt('relevance_score', 0)
    .gte('trigger_at', nowStr)
    .lte('trigger_at', new Date(now.getTime() + 65 * 60 * 1000).toISOString())

  if (!upcomingEvents) return

  for (const event of upcomingEvents) {
    // Controlla se abbiamo già inviato la notifica
    const { data: alreadySent } = await supabase
      .from('sent_notifications')
      .select('*')
      .eq('memory_id', event.id)
      .eq('notification_type', 'pre_event')
      .single()

    if (!alreadySent) {
      const message = `⏰ *Tra 1 ora: ${event.content}*\n`
      
      await sendTelegramMessage(message)
      
      // Segna come inviata
      await supabase
        .from('sent_notifications')
        .insert([{ memory_id: event.id, notification_type: 'pre_event' }])
    }
  }
}

async function sendNewsDigest(now: Date, topics: string[]) {
  const todayStr = now.toISOString().split('T')[0]
  
  // Check if already sent today
  const { data: alreadySent } = await supabase
    .from('sent_notifications')
    .select('*')
    .eq('notification_type', 'news_digest')
    .gte('sent_at', `${todayStr}T00:00:00`)
    .lte('sent_at', `${todayStr}T23:59:59`)
    .limit(1)
    
  if (alreadySent && alreadySent.length > 0) {
    console.log('News digest already sent today.')
    return
  }
  
  console.log(`Generating news digest for topics: ${topics.join(', ')}`)
  
  // Fetch RSS feeds for each topic in parallel
  const feeds = await Promise.all(
    topics.map(async (topic) => {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=it&gl=IT&ceid=IT:it`
        const resp = await fetch(url)
        if (!resp.ok) return { topic, items: [] }
        
        const xml = await resp.text()
        const items: any[] = []
        const itemRegex = /<item>([\s\S]*?)<\/item>/g
        let match
        
        while ((match = itemRegex.exec(xml)) !== null && items.length < 4) {
          const itemContent = match[1]
          const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(itemContent)
          const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(itemContent)
          const sourceMatch = /<source[\s\S]*?>([\s\S]*?)<\/source>/.exec(itemContent)
          
          items.push({
            title: titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '',
            link: linkMatch ? linkMatch[1].trim() : '',
            source: sourceMatch ? sourceMatch[1].trim() : ''
          })
        }
        return { topic, items }
      } catch (e) {
        console.error(`Failed to fetch news for topic ${topic}:`, e)
        return { topic, items: [] }
      }
    })
  )
  
  // Format the feed items as text for Gemini
  let feedText = ''
  feeds.forEach(f => {
    feedText += `### TEMA: ${f.topic}\n`
    if (f.items.length === 0) {
      feedText += `Nessuna notizia trovata.\n\n`
    } else {
      f.items.forEach((item, idx) => {
        feedText += `${idx + 1}. [${item.source}] ${item.title}\n   Link: ${item.link}\n`
      })
      feedText += '\n'
    }
  })
  
  // Call Gemini to synthesize a beautiful digest
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') || ''
  const geminiModel = 'gemini-2.5-flash'
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`
  
  const systemPrompt = `
Sei Will, l'assistente personale di Cristiano.
Cristiano ha chiesto un briefing sulle ultime notizie del giorno per i suoi temi di interesse.
Ecco le notizie grezze raccolte dai feed RSS.
Compila un briefing notizie del giorno personalizzato, interessante, chiaro e scritto in un tono caldo, empatico e colloquiale (in italiano).
Fai un breve riassunto (1-2 frasi) per le notizie principali di ogni tema, e includi il link originale per ciascuna usando la sintassi Markdown [Titolo](link) o indicandolo chiaramente.
Mantieni il messaggio entro le capacità di un messaggio Telegram (pulito, ben spaziato, con elenchi puntati ed emoji).
  `.trim()
  
  let digestContent = ''
  try {
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nNOTIZIE RSS DI OGGI:\n${feedText}` }]
          }
        ],
        generationConfig: {
          temperature: 0.3
        }
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      digestContent = data.candidates[0].content.parts[0].text
    } else {
      throw new Error(`Gemini status ${response.status}`)
    }
  } catch (e: any) {
    console.error('Failed to generate news digest via Gemini:', e)
    digestContent = `📰 *Il tuo briefing notizie di oggi (Fallback)*\n\n`
    feeds.forEach(f => {
      digestContent += `*${f.topic}*:\n`
      f.items.forEach(item => {
        digestContent += `• [${item.source}] [${item.title}](${item.link})\n`
      })
      digestContent += '\n'
    })
  }
  
  const finalMessage = `📰 *WILL NEWS DIGEST*\n\n${digestContent}`
  
  // Send telegram message
  await sendTelegramMessage(finalMessage)
  
  // Log in sent_notifications
  await supabase
    .from('sent_notifications')
    .insert([{ notification_type: 'news_digest' }])
}
