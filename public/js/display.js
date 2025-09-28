// /public/js/display.js
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
example.textContent = `${location.origin}/display?code=ABC123`

let channel = null

function setCode(c){
  code = c.toUpperCase()
  codeEl.textContent = code || '———'
  codeInput.value = code
  if(code){
    loadRound()
    subscribe()
  }
}

async function loadRound(){
  const { data: r } = await supabase.from('rounds').select('*').eq('code', code).maybeSingle()
  if(!r){ titleEl.textContent='Round not found'; bodyEl.textContent=''; return }
  titleEl.textContent = r.title
  bodyEl.textContent  = r.body
  revealBox.style.display = r.status === 'revealed' ? 'block' : 'none'
  if(r.status === 'revealed'){
    truthEl.textContent = `Truth: ${r.truth ? 'TRUE' : 'FALSE'}`
    truthEl.className = r.truth ? 'truth' : 'false'
  }
  await refreshVotes()
  await loadMessages()
}

async function refreshVotes(){
  const { data } = await supabase.rpc('get_vote_counts', { p_round_code: code })
  const up = data?.up||0, down = data?.down||0, total = up+down
  const pct = total ? Math.round((up/total)*100) : 0
  barUp.style.width = pct + '%'
  stat.textContent = `👍 ${up} | 👎 ${down} (${pct}% up)`
}

async function loadMessages(){
  const { data: m } = await supabase.from('messages').select('*')
    .eq('round_code', code).order('created_at',{ascending:true}).limit(200)
  msgList.innerHTML = ''
  ;(m||[]).slice(-100).forEach(addMsg)
  msgList.scrollTop = msgList.scrollHeight
}

function addMsg(m){
  const li = document.createElement('li')
  li.className = 'li'
  // 简化：只显示文本，不显示“真实/误导”标签
  const text = document.createElement('span')
  text.innerHTML = escapeHtml(m.content)
  li.appendChild(text)
  msgList.appendChild(li)
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }

function subscribe(){
  if(channel){ supabase.removeChannel(channel); channel = null }
  channel = supabase.channel('disp:'+code)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'votes', filter:`round_code=eq.${code}` }, refreshVotes)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`round_code=eq.${code}` }, (p)=>{ addMsg(p.new); msgList.scrollTop = msgList.scrollHeight })
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'rounds', filter:`code=eq.${code}` }, (p)=>{ if(p.new){ if(p.new.status==='revealed'){ revealBox.style.display='block'; truthEl.textContent = `Truth: ${p.new.truth ? 'TRUE' : 'FALSE'}`; truthEl.className = p.new.truth ? 'truth':'false' } } })
    .subscribe()
}

applyBtn.onclick = ()=>{
  const val = codeInput.value.trim()
  if(!val) return
  setCode(val)
  const u = new URL(location.href); u.searchParams.set('code', val); history.replaceState(null,'',u)
}
if(code) setCode(code); else titleEl.textContent = 'Enter a round code to start display.'
