// /public/js/audience.js  (v2)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url  = window.SUPABASE_URL
const anon = window.SUPABASE_ANON_KEY
if (!url || !anon) {
  document.body.innerHTML = '<p>Missing Supabase env.</p>'
  throw new Error('Missing env')
}
const supabase = createClient(url, anon)

// DOM
const codeInput = document.getElementById('codeInput')
const applyBtn  = document.getElementById('apply')
const joined    = document.getElementById('joined')

const titleEl = document.getElementById('title')
const bodyEl  = document.getElementById('body')

const upBtn   = document.getElementById('up')
const downBtn = document.getElementById('down')
const stat    = document.getElementById('stat')
const barUp   = document.getElementById('barUp')

const hint    = document.getElementById('hint')
const sendBtn = document.getElementById('send')
const list    = document.getElementById('messages')

// state
let code = ''
let ch = null

// helpers
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
function ucase(v){ return (v||'').trim().toUpperCase() }

// init from ?code=
const params = new URLSearchParams(location.search)
const fromQuery = ucase(params.get('code'))
if (fromQuery) codeInput.value = fromQuery

async function joinRound(){
  const val = ucase(codeInput.value)
  if (!val) return alert('Enter code')
  code = val
  joined.textContent = `Joined ${code}`

  // keep code in URL
  const u = new URL(location.href); u.searchParams.set('code', code); history.replaceState(null,'',u)

  // load round
  const { data: r, error: e1 } = await supabase.from('rounds').select('*').eq('code', code).maybeSingle()
  if (e1) { alert(e1.message); return }
  if (!r) { titleEl.textContent = 'Round not found'; bodyEl.textContent = ''; return }
  titleEl.textContent = r.title
  bodyEl.textContent  = r.body

  // initial fetch
  await refreshVotes()
  await loadMessages()

  // realtime subscribe
  if (ch) { supabase.removeChannel(ch); ch = null }
  ch = supabase.channel('aud:'+code)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `round_code=eq.${code}` }, refreshVotes)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `round_code=eq.${code}` }, (p)=>{
      addMsg(p.new); list.scrollTop = list.scrollHeight
    })
    .subscribe()
}

async function refreshVotes(){
  if (!code) return
  const { data, error } = await supabase.rpc('get_vote_counts', { p_round_code: code })
  if (error) { console.error(error.message); return }
  const up = data?.up || 0, down = data?.down || 0, total = up + down
  const pct = total ? Math.round(up/total*100) : 0
  stat.textContent = `👍 ${up} | 👎 ${down} (${pct}% up)`
  barUp.style.width = pct + '%'
}

async function loadMessages(){
  if (!code) return
  const { data: m, error } = await supabase.from('messages').select('*')
    .eq('round_code', code).order('created_at', { ascending: true }).limit(100)
  if (error) { console.error(error.message); return }
  list.innerHTML = ''
  ;(m||[]).forEach(addMsg)
  list.scrollTop = list.scrollHeight
}

function addMsg(m){
  const li = document.createElement('li')
  li.className = 'li'
  const text = document.createElement('span')
  text.innerHTML = escapeHtml(m.content)
  li.appendChild(text)
  list.appendChild(li)
}

// events
applyBtn.onclick = joinRound

upBtn.onclick = async ()=>{
  if (!code) return alert('Join first')
  const { error } = await supabase.from('votes').insert({ round_code: code, value: 'up' })
  if (error) alert(error.message); else await refreshVotes()  // 兜底刷新
}
downBtn.onclick = async ()=>{
  if (!code) return alert('Join first')
  const { error } = await supabase.from('votes').insert({ round_code: code, value: 'down' })
  if (error) alert(error.message); else await refreshVotes()  // 兜底刷新
}

sendBtn.onclick = async ()=>{
  if (!code) return alert('Join first')
  const content = (hint.value || '').trim()
  if (!content) return
  const { error } = await supabase.from('messages').insert({ round_code: code, content, tag: 'unknown' })
  if (!error) { hint.value=''; } else alert(error.message)
}

// auto-join if query had code
if (fromQuery) joinRound()
