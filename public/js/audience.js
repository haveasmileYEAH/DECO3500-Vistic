// /public/js/audience.js - 清理版本
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const url  = window.SUPABASE_URL
const anon = window.SUPABASE_ANON_KEY
if (!url || !anon) {
  document.body.innerHTML = '<p>Missing Supabase env.</p>'
  throw new Error('Missing env')
}
const supabase = createClient(url, anon)

// DOM Elements
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

// 问题相关元素
const questionCard = document.getElementById('questionCard')
const currentQuestion = document.getElementById('currentQuestion')
const qNumber = document.getElementById('qNumber')
const questionType = document.getElementById('questionType')

// State
let code = ''
let ch = null

// Helper Functions
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

// Initialize from URL query parameter
const params = new URLSearchParams(location.search)
const fromQuery = ucase(params.get('code'))
if (fromQuery) codeInput.value = fromQuery

// Join Round Function
async function joinRound(){
  const val = ucase(codeInput.value)
  if (!val) return alert('Enter code')
  
  code = val
  joined.textContent = `Joined ${code}`

  // Update URL with code
  const u = new URL(location.href)
  u.searchParams.set('code', code)
  history.replaceState(null,'',u)

  // Load round data from Supabase
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
  
  // 显示当前问题（如果有）
  updateCurrentQuestion(r)

  // Initial data fetch
  await refreshVotes()
  await loadMessages()

  // Setup realtime subscriptions
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

// Update Current Question Display
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

// Refresh Vote Counts
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
  const pct = total ? Math.round(up/total*100) : 0
  
  stat.textContent = `👍 ${up} | 👎 ${down} (${pct}% up)`
  barUp.style.width = pct + '%'
}

// Load Messages
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

// Add Message to List
function addMsg(m){
  const li = document.createElement('li')
  li.className = 'li'
  const text = document.createElement('span')
  text.innerHTML = escapeHtml(m.content)
  li.appendChild(text)
  list.appendChild(li)
}

// Event Handlers
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

// Auto-join if code in URL
if (fromQuery) {
  console.log('[audience] Auto-joining from URL:', fromQuery)
  joinRound()
}

// 1. 检查连接
console.log('=== Audience 状态检查 ===');
console.log('code:', code);
console.log('supabase 存在:', !!supabase);

// 2. 手动从 Supabase 获取数据
const { data: round, error } = await supabase
  .from('rounds')
  .select('*')
  .eq('code', code)
  .single();

console.log('手动获取结果:', round);
console.log('current_question:', round?.current_question);
console.log('current_question_number:', round?.current_question_number);
console.log('current_question_total:', round?.current_question_total);

// 3. 如果有数据，手动触发显示
if (round && round.current_question) {
  console.log('尝试手动显示问题...');
  updateCurrentQuestion(round);
  console.log('问题卡片显示状态:', questionCard.style.display);
}