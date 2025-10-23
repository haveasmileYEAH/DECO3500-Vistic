// /public/js/audience.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url  = window.SUPABASE_URL
const anon = window.SUPABASE_ANON_KEY
if (!url || !anon) {
  document.body.innerHTML = '<p>Missing Supabase env.</p>'
  throw new Error('Missing env')
}
const supabase = createClient(url, anon)
const codeInput = document.getElementById('codeInput')
const applyBtn  = document.getElementById('apply')
const joined    = document.getElementById('joined')
const titleEl = document.getElementById('title')
const bodyEl  = document.getElementById('body')
const upBtn   = document.getElementById('up')
const downBtn = document.getElementById('down')
const hint    = document.getElementById('hint')
const sendBtn = document.getElementById('send')
const list    = document.getElementById('messages')
const questionCard = document.getElementById('questionCard')
const currentQuestion = document.getElementById('currentQuestion')
const qNumber = document.getElementById('qNumber')
const questionType = document.getElementById('questionType')

let code = ''
let ch = null

function escapeHtml(s){ 
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])) 
}

function ucase(v){ 
  return (v||'').trim().toUpperCase() 
}

const params = new URLSearchParams(location.search)
const fromQuery = ucase(params.get('code'))
if (fromQuery) codeInput.value = fromQuery

async function joinRound(){
  const val = ucase(codeInput.value)
  if (!val) return alert('Enter code')
  code = val
  joined.textContent = `Joined ${code}`
  const u = new URL(location.href)
  u.searchParams.set('code', code)
  history.replaceState(null,'',u)
  const { data: r, error: e1 } = await supabase
    .from('rounds')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (e1) { 
    alert(e1.message)
    return 
  }
  
  if (!r) { 
    titleEl.textContent = 'Round not found'
    bodyEl.textContent = ''
    questionCard.style.display = 'none'
    return 
  }
  
  titleEl.textContent = r.title
  bodyEl.textContent  = r.body
  updateCurrentQuestion(r)
  await refreshVotes()
  await loadMessages()

  if (ch) { 
    supabase.removeChannel(ch)
    ch = null 
  }
  
  ch = supabase.channel('aud:'+code)
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'votes', 
      filter: `round_code=eq.${code}` 
    }, refreshVotes)
    .on('postgres_changes', { 
      event: 'INSERT', 
      schema: 'public', 
      table: 'messages', 
      filter: `round_code=eq.${code}` 
    }, (p)=>{
      addMsg(p.new)
      list.scrollTop = list.scrollHeight
    })
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'rounds', 
      filter: `code=eq.${code}` 
    }, (payload)=>{
      console.log('[audience] rounds updated:', payload)
      updateCurrentQuestion(payload.new)
    })
    .subscribe((status) => {
      console.log('[audience] subscription status:', status)
    })
}

function updateCurrentQuestion(round){
  if (!round) {
    console.warn('[audience] updateCurrentQuestion called with no data')
    return
  }
  console.log('[audience] updateCurrentQuestion called with:', {
    question: round.current_question,
    number: round.current_question_number,
    total: round.current_question_total,
    type: round.current_question_type
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
    console.log('[audience] Question card now visible')
  } else {
    questionCard.style.display = 'none'
    console.log('[audience] No question to display, card hidden')
  }
}

async function refreshVotes(){
  if (!code) return
  const { data, error } = await supabase.rpc('get_vote_counts', { p_round_code: code })
  if (error) { 
    console.error('[audience] get_vote_counts error:', error.message)
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
  console.log('[audience] Vote chart updated:', { up, down, truePct, falsePct })
}

async function loadMessages(){
  if (!code) return
  
  const { data: m, error } = await supabase
    .from('messages')
    .select('*')
    .eq('round_code', code)
    .order('created_at', { ascending: true })
    .limit(100)
  
  if (error) { 
    console.error('[audience] loadMessages error:', error.message)
    return 
  }
  
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

applyBtn.onclick = joinRound

upBtn.onclick = async ()=>{
  if (!code) return alert('Join first')

  const { error } = await supabase
    .from('votes')
    .insert({ round_code: code, value: 'up' })

  console.log('[audience] vote up ->', { code, error })
  if (error) {
    alert(error.message)
  } else {
    await refreshVotes()
  }
}

downBtn.onclick = async ()=>{
  if (!code) return alert('Join first')
  
  const { error } = await supabase
    .from('votes')
    .insert({ round_code: code, value: 'down' })
  
  console.log('[audience] vote down ->', { code, error })
  if (error) {
    alert(error.message)
  } else {
    await refreshVotes()
  }
}

sendBtn.onclick = async ()=>{
  if (!code) return alert('Join first')
  
  const content = (hint.value || '').trim()

  if (!content) return
  
  const { error } = await supabase
    .from('messages')
    .insert({ round_code: code, content, tag: 'unknown' })
  
  console.log('[audience] message ->', { code, error })

  if (!error) { 
    hint.value = ''
  } else {
    alert(error.message)
  }
}

if (fromQuery) {
  console.log('[audience] Auto-joining from URL:', fromQuery)
  joinRound()
}

console.log('code:', code);
console.log('supabase exist', !!supabase);

const { data: round, error } = await supabase
  .from('rounds')
  .select('*')
  .eq('code', code)
  .single();

console.log('collect the result:', round);
console.log('current_question:', round?.current_question);
console.log('current_question_number:', round?.current_question_number);
console.log('current_question_total:', round?.current_question_total);
if (round && round.current_question) {
  updateCurrentQuestion(round);
  console.log('Question Status', questionCard.style.display);
}
window.supabase = supabase
window.updateCurrentQuestion = updateCurrentQuestion
window.joinRound = joinRound
window.startPolling = startPolling
window.pollInterval = pollInterval