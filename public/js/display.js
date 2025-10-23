// /public/js/display.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url = window.SUPABASE_URL
const anon = window.SUPABASE_ANON_KEY
if (!url || !anon) {
  document.body.innerHTML = '<p style="color:#fff">Missing Supabase env.</p>'
  throw new Error('env')
}
const supabase = createClient(url, anon)

function audienceUrlFor(room){
  const host = window.location.host;
  const protocol = window.location.protocol;
  const u = new URL(`${protocol}//${host}/audience`);
  u.searchParams.set("code", room);
  return u.toString();
}

function generateQRCode(roomCode){
  const qrCanvas = document.getElementById('qrCanvas');
  const qrCard = document.getElementById('qrCard');
  const qrRoomCode = document.getElementById('qrRoomCode');
  
  if (!qrCanvas || !qrCard) {
    console.error('[display] QR elements not found');
    return;
  }
  
  const audienceUrl = audienceUrlFor(roomCode);
  console.log('[display] Generating QR Code for:', audienceUrl);
  
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(audienceUrl)}`;
  
  qrCanvas.onload = () => {
    console.log('QR Code loaded successfully');
    qrCard.style.display = 'block';
    qrRoomCode.textContent = roomCode;
  };
  
  qrCanvas.onerror = () => {
    console.error('[display] Failed to load QR Code');
    qrCanvas.alt = 'QR Code Failed';
    qrCanvas.style.border = '2px solid #f87171';
  };
  
  qrCanvas.src = qrUrl;
}

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

const questionCard = document.getElementById('questionCard')
const currentQuestion = document.getElementById('currentQuestion')
const qNumber = document.getElementById('qNumber')
const questionType = document.getElementById('questionType')
const timeLimit = document.getElementById('timeLimit')

const params = new URLSearchParams(location.search)
let code = (params.get('code') || '').toUpperCase()
codeInput.value = code
if (example) example.textContent = `${location.origin}/display?code=ABC123`

let channel = null
let pollTimer = null
let lastMsgTime = null

function escapeHtml(s){ 
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])) 
}

function setCode(c){
  code = (c||'').toUpperCase()
  codeEl.textContent = code || '———'
  codeInput.value = code
  
  if (!code) { 
    stopRealtime()
    titleEl.textContent = 'Enter a round code to start display.'
    bodyEl.textContent = ''
    questionCard.style.display = 'none'
    const qrCard = document.getElementById('qrCard');
    if (qrCard) qrCard.style.display = 'none';
    return 
  }
  
  lastMsgTime = null
  loadRound().then(()=>{
    subscribe()
    startPolling()
    generateQRCode(code)
  })
}

function stopRealtime(){
  if (pollTimer){ 
    clearInterval(pollTimer)
    pollTimer = null 
  }
  if (channel){ 
    supabase.removeChannel(channel)
    channel = null 
  }
}

async function loadRound(){
  const { data: r, error } = await supabase
    .from('rounds')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  
  if(error){ 
    console.error('[display] loadRound error:', error.message)
    return 
  }
  
  if(!r){ 
    titleEl.textContent = 'Round not found'
    bodyEl.textContent = ''
    revealBox.style.display = 'none'
    questionCard.style.display = 'none'
    return 
  }
  
  titleEl.textContent = r.title
  bodyEl.textContent  = r.body
  
  revealBox.style.display = r.status === 'revealed' ? 'block' : 'none'
  if(r.status === 'revealed'){
    truthEl.textContent = `Truth: ${r.truth ? 'TRUE' : 'FALSE'}`
    truthEl.className = r.truth ? 'truth' : 'false'
  }
  
  updateCurrentQuestion(r)
  
  await refreshVotes()
  await loadMessages({ initial:true })
}

function updateCurrentQuestion(round){
  if (!round) {
    console.warn('[display] updateCurrentQuestion called with no data')
    return
  }
  
  console.log('[display] updateCurrentQuestion called with:', {
    question: round.current_question,
    number: round.current_question_number,
    total: round.current_question_total,
    type: round.current_question_type,
    timeLimit: round.current_question_time_limit
  })
  
  const hasQuestion = round.current_question && round.current_question.trim()
  
  if (hasQuestion) {
    questionCard.style.display = 'block'
    currentQuestion.textContent = round.current_question
    
    const qNum = round.current_question_number || '—'
    const qTotal = round.current_question_total || '—'
    qNumber.textContent = `Q ${qNum} / ${qTotal}`
    
    const qType = round.current_question_type === 'short' ? 'Short Answer' : 'True / False'
    questionType.textContent = `Type: ${qType}`
    
    const qTime = round.current_question_time_limit
    if (qTime) {
      timeLimit.textContent = `Time Limit: ${qTime}s`
    } else {
      timeLimit.textContent = ''
    }
    
    console.log('[display] Question card now visible')
  } else {
    questionCard.style.display = 'none'
    console.log('[display] No question to display, card hidden')
  }
}

async function refreshVotes(){
  if(!code) return
  
  const { data, error } = await supabase.rpc('get_vote_counts', { p_round_code: code })
  if(error){ 
    console.error('[display] refreshVotes error:', error.message)
    return 
  }
  
  const up = data?.up || 0
  const down = data?.down || 0
  const total = up + down
  const truePct = total ? Math.round((up / total) * 100) : 0
  const falsePct = total ? Math.round((down / total) * 100) : 0
  const barTrue = document.getElementById('barTrue')
  const barFalse = document.getElementById('barFalse')
  const valueTrue = document.getElementById('valueTrue')
  const valueFalse = document.getElementById('valueFalse')
  const countTrue = document.getElementById('countTrue')
  const countFalse = document.getElementById('countFalse')
  const stat = document.getElementById('stat')
  
  if (barTrue) barTrue.style.height = truePct + '%'
  if (barFalse) barFalse.style.height = falsePct + '%'
  
  if (valueTrue) valueTrue.textContent = truePct + '%'
  if (valueFalse) valueFalse.textContent = falsePct + '%'
  
  if (countTrue) countTrue.textContent = `${up} vote${up !== 1 ? 's' : ''}`
  if (countFalse) countFalse.textContent = `${down} vote${down !== 1 ? 's' : ''}`
  
  if (stat) {
    stat.textContent = `Total: ${total} vote${total !== 1 ? 's' : ''} | True: ${truePct}% | False: ${falsePct}%`
  }
  
  console.log('[display] Vote chart updated:', { up, down, truePct, falsePct })
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
  
  let q = supabase
    .from('messages')
    .select('*')
    .eq('round_code', code)
    .order('created_at',{ascending:true})
  
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
  if (error){ 
    console.error('[display] loadMessages error:', error.message)
    return 
  }
  
  ;(m||[]).forEach(addMsg)
  if (m && m.length) msgList.scrollTop = msgList.scrollHeight
}

function subscribe(){
  if(channel){ 
    supabase.removeChannel(channel)
    channel = null 
  }
  
  channel = supabase.channel('disp:'+code)
    .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'votes', filter:`round_code=eq.${code}` },
      (p)=>{ 
        console.log('[realtime] vote INSERT', p)
        refreshVotes() 
      }
    )
    .on('postgres_changes',
      { event:'INSERT', schema:'public', table:'messages', filter:`round_code=eq.${code}` },
      (p)=>{ 
        console.log('[realtime] msg INSERT', p)
        addMsg(p.new)
        msgList.scrollTop = msgList.scrollHeight 
      }
    )
    .on('postgres_changes',
      { event:'UPDATE', schema:'public', table:'rounds', filter:`code=eq.${code}` },
      (p)=>{ 
        console.log('[realtime] rounds UPDATE', p)
        const r=p.new
        if(!r) return
        
        if(r.title) titleEl.textContent=r.title
        if(r.body)  bodyEl.textContent=r.body
        
        if(r.status==='revealed'){ 
          revealBox.style.display='block'
          truthEl.textContent=`Truth: ${r.truth ? 'TRUE':'FALSE'}`
          truthEl.className=r.truth?'truth':'false'
        }
        updateCurrentQuestion(r)
      }
    )
    .subscribe((status)=>{ 
      console.log('[realtime] subscription status:', status, 'code=', code) 
    })
}

function startPolling(){
  if (pollTimer) clearInterval(pollTimer)
  
  pollTimer = setInterval(async ()=>{
    await refreshVotes()
    await loadMessages({ initial:false })
  }, 5000)
}

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
  
  const u = new URL(location.href)
  u.searchParams.set('code', val)
  history.replaceState(null,'',u)
}

if(code) {
  console.log('[display] Initializing with code:', code)
  setCode(code)
} else {
  titleEl.textContent = 'Enter a round code to start display.'
}
