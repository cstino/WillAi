import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const ALLOWED_USER_ID = Deno.env.get('ALLOWED_TELEGRAM_USER_ID')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

Deno.serve(async (req) => {
  try {
    // 1. Determina ora corrente in Europe/Rome
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

    console.log(`Esecuzione notifica alle ore ${hour}:${minute} (${weekday})`)

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
    .from('events')
    .select('*')
    .gte('start_date', `${today}T00:00:00`)
    .lte('start_date', `${today}T23:59:59`)

  // Query domani
  const { data: tomorrowEvents } = await supabase
    .from('events')
    .select('*')
    .gte('start_date', `${tomorrow}T00:00:00`)
    .lte('start_date', `${tomorrow}T23:59:59`)

  // Query note ieri
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]
  const { count: notesCount } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })
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
      const time = new Date(e.start_date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      message += `• ${e.title} ${e.all_day ? '(tutto il giorno)' : '— ' + time}\n`
    })
  } else {
    message += `• Oggi nessun impegno in programma 🎉\n`
  }

  if (tomorrowEvents && tomorrowEvents.length > 0) {
    message += `\n📅 *Domani:*\n`
    tomorrowEvents.forEach(e => {
      const time = new Date(e.start_date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      message += `• ${e.title} ${e.all_day ? '(tutto il giorno)' : '— ' + time}\n`
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
    .from('events')
    .select('*')
    .gte('start_date', `${todayStr}T00:00:00`)
    .lte('start_date', `${weekEndStr}T23:59:59`)
    .order('start_date', { ascending: true })

  const { count: totalNotes } = await supabase
    .from('notes')
    .select('*', { count: 'exact', head: true })

  let message = `📊 *La tua settimana (${now.getDate()}-${weekEnd.getDate()} ${new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(now)}):*\n`
  
  if (weekEvents && weekEvents.length > 0) {
    weekEvents.forEach(e => {
      const date = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(new Date(e.start_date))
      message += `• ${date.charAt(0).toUpperCase() + date.slice(1)}: ${e.title}\n`
    })
  } else {
    message += `• Nessun impegno programmato per questa settimana.`
  }

  message += `\n📝 Hai ${totalNotes} note totali.`

  await sendTelegramMessage(message)
}

async function sendPreEventReminders(now: Date) {
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
  const oneHourLaterStr = oneHourLater.toISOString()
  const nowStr = now.toISOString()

  // Cerca eventi che iniziano tra 55 e 65 minuti
  const { data: upcomingEvents } = await supabase
    .from('events')
    .select('*')
    .eq('all_day', false)
    .gte('start_date', nowStr)
    .lte('start_date', new Date(now.getTime() + 65 * 60 * 1000).toISOString())

  if (!upcomingEvents) return

  for (const event of upcomingEvents) {
    // Controlla se abbiamo già inviato la notifica
    const { data: alreadySent } = await supabase
      .from('sent_notifications')
      .select('*')
      .eq('event_id', event.id)
      .eq('notification_type', 'pre_event')
      .single()

    if (!alreadySent) {
      let message = `⏰ *Tra 1 ora: ${event.title}*\n`
      if (event.location) message += `📍 ${event.location}`
      
      await sendTelegramMessage(message)
      
      // Segna come inviata
      await supabase
        .from('sent_notifications')
        .insert([{ event_id: event.id, notification_type: 'pre_event' }])
    }
  }
}
