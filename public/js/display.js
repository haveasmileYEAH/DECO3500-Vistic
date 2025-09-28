// /public/js/display.js — realtime + polling + logs
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url = window.SUPABASE_URL
const anon = window.SUPABASE_ANON_KEY
if (!url || !anon) {
  document.body.innerHTML = '<p style="color:#fff">Missing Supabase env.</p>'
  throw new Error('env')
}
const supabase = createClient(url, anon)

const codeEl   = document.getElementById('codeEl')
const titleEl  = document.getElementById('title')
const bodyEl   = document.getElementById('body')
const barUp    = document.getElementById('barUp')
const stat     = document.getElementById('stat')
const msgList  = document.getElementById('messages')
const revealBox= document.getElementById('revealBox')
const truthEl  = document.getElementById('truth')
const codeInput= document.getElementById('codeInput')
const applyBtn = document.getElementById('apply')
const example  = document.getElementById('example')

const params = new URLSearchParams(location.search)
let code = (params.get('code') || '').toUpperCase()
codeInput.value = code
if (example) example.textContent = `${location.origin}/display?code=ABC123`

let channel = null
let pollTimer = null
let lastMsgTime = null // 最新一条消息的时间戳

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

function setCode(c){
  code = (c||'').toUpperCase()
  codeEl.textContent = code || '———'
  codeInput.value = code
  if (!code) { stopRealtime(); titleEl.textContent='Enter a round code to start display.'; bodyEl.textContent=''; return }
  lastMsgTime = null
  loadRound().then(()=>{
    subscribe()
    startPolling()
  })
}

function stopRealtime(){
  if (pollTimer){ clearInterval(pollTimer); pollTimer = null }
  if (channel){ supabase.removeChannel(channel); channel = null }
}

async function loadRound(){
  const { data: r, error } = await supabase.from('rounds').select('*').eq('code', code).maybeSingle()
  if(error){ console.error('[display] loadRound error:', error.message); return }
  if(!r){ titleEl.textContent='Round not found'; bodyEl.textContent=''; revealBox.style.display='none'; return }
  titleEl.textContent = r.title
  bodyEl.textContent  = r.body
  revealBox.style.display = r.status === 'revealed' ? 'block' : 'none'
  if(r.status === 'revealed'){
    truthEl.textContent = `Truth: ${r.truth ? 'TRUE' : 'FALSE'}`
    truthEl.className = r.truth ? 'truth' : 'false'
  }
  await refreshVotes()
  await loadMessages({ initial:true })
}

async function refreshVotes(){
  if(!code) return
  const { data, error } = await supabase.rpc('get_vote_counts', { p_round_code: code })
  if(error){ console.error('[display] refreshVotes error:', error.message); return }
  const up = data?.up||0, down = data?.down||0, total = up+down
  const pct = total ? Math.round((up/total)*100) : 0
  barUp.style.width = pct + '%'
  stat.textContent = `👍 ${up} | 👎 ${down} (${pct}% up)`
}

function addMsg(m){
  const li = document.createElement('li')
  li.className = 'li'
  const text = document.createElement('span')
  text.innerHTML = escapeHtml(m.content)
  li.appendChild(text)
  msgList.appendChild(li)
  if (m.created_at) {
    if (!lastMsgTime || new Date(m.created_at) > new Date(lastMsgTime)) {
      lastMsgTime = m.created_at
    }
  }
}

async function loadMessages({ initial=false } = {}){
  if(!code) return
  let q = supabase.from('messages').select('*').eq('round_code', code).order('created_at',{ascending:true})
  if (initial) {
    q = q.limit(200)
    msgList.innerHTML = ''
    lastMsgTime = null
  } else if (lastMsgTime) {
    q = q.gt('created_at', lastMsgTime).limit(200)
  } else {
    q = q.limit(200)
  }
  const { data: m, error } = await q
  if (error){ console.error('[display] loadMessages error:', error.message); return }
  ;(m||[]).forEach(addMsg)
  if (m && m.length) msgList.scrollTop = msgList.scrollHeight
}

function subscribe(){
  if(channel){ supabase.removeChannel(channel); channel = null }
  channel = supabase.channel('disp:'+code)
    .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'votes', filter:`round_code=eq.${code}` },
      (p)=>{ console.log('[realtime] vote INSERT', p); refreshVotes() }
    )
    .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'messages', filter:`round_code=eq.${code}` },
      (p)=>{ console.log('[realtime] msg INSERT', p); addMsg(p.new); msgList.scrollTop = msgList.scrollHeight }
    )
    .on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'rounds', filter:`code=eq.${code}` },
      (p)=>{ console.log('[realtime] rounds UPDATE', p); const r=p.new; if(!r) return;
             if(r.title) titleEl.textContent=r.title;
             if(r.body)  bodyEl.textContent=r.body;
             if(r.status==='revealed'){ revealBox.style.display='block'; truthEl.textContent=`Truth: ${r.truth ? 'TRUE':'FALSE'}`; truthEl.className=r.truth?'truth':'false'; } }
    )
    .subscribe((status)=>{ console.log('[realtime] status', status, 'code=', code) })
}

function startPolling(){
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(async ()=>{
    await refreshVotes()
    await loadMessages({ initial:false })
  }, 5000)
}

// 页面变为可见时，立即补一次
document.addEventListener('visibilitychange', ()=>{
  if (document.visibilityState === 'visible') {
    refreshVotes()
    loadMessages({ initial:false })
  }
})

applyBtn.onclick = ()=>{
  const val = (codeInput.value || '').trim().toUpperCase()
  if(!val) return
  console.log('[display] apply code', val)
  setCode(val)
  const u = new URL(location.href); u.searchParams.set('code', val); history.replaceState(null,'',u)
}

if(code) setCode(code); else titleEl.textContent = 'Enter a round code to start display.'
