// Player 1 (Host): Auto-advance mode with question preview + Supabase sync
// Questions auto-advance when: (1) player submits OR (2) timer ends
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const socket = io();
let currentRoom = "";
let autoAdvanceTimer = null; // 自动跳转计时器
window.currentRoom = ""; 

/* ====================== helpers ====================== */
function genCode(n=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// ⭐ 修复：生成 Audience URL（不是 player2）
function audienceUrlFor(room){
  const u = new URL(window.location.origin + "/audience");
  u.searchParams.set("code", room);
  return u.toString();
}

// ⭐ 使用 Google Charts API 生成二维码（无需外部库）
function drawQR(canvasId, text){
  const img = document.getElementById(canvasId);
  if (!img) {
    console.error('[P1] QR element not found:', canvasId);
    return;
  }
  
  console.log('[P1] Generating QR Code for:', text);
  
  // 使用 QR Server API（更可靠）
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(text)}`;
  
  img.onload = () => {
    console.log('[P1] ✅ QR Code loaded successfully');
  };
  
  img.onerror = () => {
    console.error('[P1] Failed to load QR Code');
    img.alt = 'QR Code Failed';
    img.style.border = '2px solid #f87171';
    img.style.background = '#fee2e2';
  };
  
  img.src = qrUrl;
}

function show(id){ 
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}
function hide(id){ 
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}
function startCountdown(seconds){
  let total = Number(seconds)||0, left = total;
  const bar = $("#timerBar"), text = $("#timer");
  bar.css("width", "100%"); text.text(total? total+" sec": "");
  
  // 清除之前的自动跳转计时器
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  
  const t = setInterval(()=>{
    left--; 
    if (left<=0){ 
      bar.css("width","0%"); 
      text.text(""); 
      clearInterval(t); 
      return; 
    }
    bar.css("width", Math.floor(left/total*100)+"%"); 
    text.text(left+" sec");
  },1000);
  
  // 设置自动跳转：倒计时结束后3秒自动下一题
  autoAdvanceTimer = setTimeout(() => {
    console.log("[P1] Timer ended, auto-advancing to next question...");
    autoAdvanceToNext();
  }, (total + 3) * 1000); // 题目时间 + 3秒缓冲
}

function autoAdvanceToNext(){
  const cat = BANK_MAP.get(currentCategory);
  if (!cat) return;
  
  const used = USED.get(currentCategory) || new Set();
  const total = (cat.questions || []).length;
  
  if (used.size >= total) {
    // 所有题目完成
    showCompletionPage();
  } else {
    // 继续下一题
    nextQuestion();
  }
}

function renderLeaderboard(rows){
  const $tb = $("#leaderboard tbody"); $tb.empty();
  (rows||[]).forEach(r=>{
    $tb.append(`<tr><td>${r.rank}</td><td>${r.username}</td><td>${r.score}</td><td>${r.correctCount}</td><td>${r.avgTime}</td></tr>`);
  });
}

/* ====================== Supabase: live votes + question sync ====================== */
const SB_URL  = window.SUPABASE_URL;
const SB_ANON = window.SUPABASE_ANON_KEY;
const sb = (SB_URL && SB_ANON) ? createClient(SB_URL, SB_ANON) : null;
window.sb = sb;
let voteChannel = null;

const statEl = document.getElementById('voteStat1');
const barEl  = document.getElementById('voteBarUp1');

async function refreshVotes(){
  if (!sb || !currentRoom) return;
  const { data, error } = await sb.rpc('get_vote_counts', { p_round_code: currentRoom });
  if (error) { console.error('[P1] get_vote_counts', error.message); return; }
  const up = data?.up || 0, down = data?.down || 0, total = up + down;
  const pct = total ? Math.round(up / total * 100) : 0;
  if (statEl) statEl.textContent = `👍 ${up} | 👎 ${down} (${pct}% up)`;
  if (barEl)  barEl.style.width = pct + '%';
}
function subscribeVotes(){
  if (!sb) return;
  if (voteChannel) { sb.removeChannel(voteChannel); voteChannel = null; }
  if (!currentRoom) return;
  voteChannel = sb.channel('p1:'+currentRoom)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'votes', filter:`round_code=eq.${currentRoom}` }, refreshVotes)
    .subscribe();
  refreshVotes();
}

/* ⭐ 新增：更新当前问题到 Supabase（让 audience 和 display 看到） */
async function updateQuestionInSupabase(questionData) {
  if (!sb || !currentRoom) {
    console.warn('[P1] Supabase not available or no room set');
    return;
  }
  
  const { question, questionType, timeLimit, qNumber, qTotal } = questionData;
  
  console.log('[P1] Updating question in Supabase:', {
    question,
    questionType,
    timeLimit,
    qNumber,
    qTotal,
    room: currentRoom
  });
  
  try {
    const { data, error } = await sb
      .from('rounds')
      .update({
        current_question: question || null,
        current_question_type: questionType || 'truefalse',
        current_question_time_limit: timeLimit || 30,
        current_question_number: qNumber || null,
        current_question_total: qTotal || null
      })
      .eq('code', currentRoom)
      .select(); // 添加 select() 来返回更新后的数据
    
    if (error) {
      console.error('[P1] Failed to update question in Supabase:', error);
    } else {
      console.log('[P1] ✅ Question updated in Supabase successfully');
      console.log('[P1] Updated data:', data);
    }
  } catch (e) {
    console.error('[P1] Exception updating question:', e);
  }
}

/* ⭐ 新增：清除当前问题（问题结束或测验完成时） */
async function clearCurrentQuestion() {
  if (!sb || !currentRoom) return;
  
  console.log('[P1] Clearing question in Supabase for room:', currentRoom);
  
  try {
    const { error } = await sb
      .from('rounds')
      .update({
        current_question: null,
        current_question_type: null,
        current_question_time_limit: null,
        current_question_number: null,
        current_question_total: null
      })
      .eq('code', currentRoom);
    
    if (error) {
      console.error('[P1] Failed to clear question:', error);
    } else {
      console.log('[P1] ✅ Question cleared in Supabase');
    }
  } catch (e) {
    console.error('[P1] Exception clearing question:', e);
  }
}

/* ====================== Street Challenge: Question Bank ====================== */
const BANK_URLS = [ "/data/questions.json", "./data/questions.json", "/questions.json" ];
let BANK = null;
let BANK_MAP = new Map();
let currentCategory = "";
let USED = new Map();
let Q_COUNTER = new Map();

async function fetchFirstOk(urls){
  let lastErr;
  for (const u of urls){
    try{
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} @ ${u}`); continue; }
      const json = await res.json();
      return { json, url: u };
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error("All question bank URLs failed");
}

async function loadBankOnce(){
  if (BANK) return BANK;
  try {
    const { json, url } = await fetchFirstOk(BANK_URLS);
    BANK = json;
    console.log("[P1] question bank loaded from:", url);

    BANK_MAP.clear();
    const $sel = $("#bankCategory").empty();
    (BANK.categories || []).forEach(cat=>{
      BANK_MAP.set(cat.id, cat);
      $sel.append(`<option value="${cat.id}">${cat.name}</option>`);
    });

    if ((BANK.categories||[]).length){
      currentCategory = BANK.categories[0].id;
      $sel.val(currentCategory);
      resetCategoryProgress(currentCategory);
      updateCategoryInfo();
      renderBankTable(); // 显示题目列表
    } else {
      alert("Question bank loaded, but no categories found.");
    }
  } catch (e) {
    console.error("[P1] loadBankOnce error:", e);
    alert("Failed to load question bank.\n"
      + "1) Ensure questions.json is at public/data/questions.json\n"
      + "2) Check http://localhost:3000/data/questions.json\n"
      + "3) Ensure express.static('public') is configured");
  }
}

function renderBankTable(){
  const $tb = $("#bankTable tbody").empty();
  const cat = BANK_MAP.get(currentCategory);
  if (!cat) return;
  
  const used = USED.get(currentCategory) || new Set();
  
  (cat.questions || []).forEach((q, idx)=>{
    const ansText = (q.truth === true ? "True" : (q.truth === false ? "False" : "—"));
    const status = used.has(idx) ? '<span class="badge-used">Used</span>' : '<span class="badge-available">Available</span>';
    $tb.append(`
      <tr class="${used.has(idx) ? 'row-used' : ''}">
        <td class="mono">${idx+1}</td>
        <td>${q.claim || ""}</td>
        <td class="mono">${ansText}</td>
        <td>${status}</td>
      </tr>
    `);
  });
}

/* === progress & picking === */
function resetCategoryProgress(catId){
  USED.set(catId, new Set());
  Q_COUNTER.set(catId, 0);
  updateQuestionCounter(catId);
}

function updateQuestionCounter(catId){
  const el = document.getElementById('qNo');
  const shown = Q_COUNTER.get(catId) || 0;
  const total = (BANK_MAP.get(catId)?.questions?.length || 0);
  if (el){
    el.textContent = shown > 0 ? `Q ${shown} / ${total}` : `Q — / ${total || '—'}`;
  }
}

function updateCategoryInfo(){
  const cat = BANK_MAP.get(currentCategory);
  if (!cat) return;
  
  const total = (cat.questions || []).length;
  const used = USED.get(currentCategory) || new Set();
  const remaining = total - used.size;
  
  const categoryInfoEl = document.getElementById('categoryInfo');
  if (categoryInfoEl) {
    categoryInfoEl.textContent = `Total questions: ${total} | Remaining: ${remaining}`;
  }
  
  // 更新开始按钮状态
  const startBtn = document.getElementById('startQuiz');
  if (startBtn) {
    const hasStarted = (Q_COUNTER.get(currentCategory) || 0) > 0;
    if (hasStarted) {
      startBtn.disabled = true;
      startBtn.textContent = 'Quiz in Progress';
    } else {
      startBtn.disabled = false;
      startBtn.textContent = 'Start Quiz';
    }
  }
}

function pickRandomUnseen(catId){
  const cat = BANK_MAP.get(catId);
  if (!cat || !Array.isArray(cat.questions)) return { idx: -1, q: null, total: 0 };
  const total = cat.questions.length;
  const used = USED.get(catId) || new Set();
  if (used.size >= total) return { idx: -1, q: null, total };

  const remaining = [];
  for (let i=0;i<total;i++){ if (!used.has(i)) remaining.push(i); }
  const idx = remaining[Math.floor(Math.random()*remaining.length)];
  return { idx, q: cat.questions[idx], total };
}

/* === push & numbering === */
function resolveTimeLimitFor(q){
  const fromInput = Number($("#bankTime").val() || 0);
  if (fromInput > 0) return fromInput;
  if (q && q.time_limit) return Number(q.time_limit) || 30;
  const cat = BANK_MAP.get(currentCategory);
  return (cat && cat.default_time_limit) ? Number(cat.default_time_limit) : 30;
}

async function pushBankQuestionWithIndex(idx){
  const cat = BANK_MAP.get(currentCategory);
  if (!cat) return alert("No category selected.");
  const q = (cat.questions || [])[idx];
  if (!q) return;

  const used = USED.get(currentCategory) || new Set();
  used.add(idx); 
  USED.set(currentCategory, used);

  const shown = (Q_COUNTER.get(currentCategory) || 0) + 1;
  Q_COUNTER.set(currentCategory, shown);

  const total = (cat.questions || []).length;
  updateQuestionCounter(currentCategory);
  updateCategoryInfo();
  renderBankTable(); // 更新题目列表显示状态

  const payload = {
    room: currentRoom,
    question: q.claim || "",
    answer: (q.truth === true ? "true" : (q.truth === false ? "false" : "")),
    timeLimit: resolveTimeLimitFor(q),
    questionType: q.type || "truefalse",
    qNumber: shown,
    qTotal: total,
    qId: q.id || null,
    categoryId: currentCategory
  };

  show("gameSummary");
  
  // 1️⃣ 发送给 Player2（通过 Socket.IO）
  socket.emit("submitquestion", payload);
  
  // 2️⃣ ⭐ 同步到 Supabase（让 audience 和 display 看到）
  await updateQuestionInSupabase({
    question: payload.question,
    questionType: payload.questionType,
    timeLimit: payload.timeLimit,
    qNumber: payload.qNumber,
    qTotal: payload.qTotal
  });
  
  startCountdown(payload.timeLimit);
}

async function showCompletionPage(){
  // 清除自动跳转计时器
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  
  // ⭐ 修复：不立即清除问题，让 audience/display 继续看到最后一题
  // 延迟清除，或者完全不清除
  console.log('[P1] Quiz completed, keeping last question visible');
  // await clearCurrentQuestion(); // 注释掉立即清除
  
  // 可选：60秒后自动清除
  setTimeout(async () => {
    await clearCurrentQuestion();
    console.log('[P1] ✅ Question cleared after completion delay');
  }, 60000);
  
  hide("gameSummary");
  show("completionPage");
  
  const cat = BANK_MAP.get(currentCategory);
  const catName = cat ? cat.name : currentCategory;
  const total = (cat?.questions?.length || 0);
  
  const titleEl = document.getElementById('completionTitle');
  const messageEl = document.getElementById('completionMessage');
  
  if (titleEl) titleEl.textContent = `🎉 Quiz Completed!`;
  if (messageEl) messageEl.textContent = `Congratulations! You have completed all ${total} questions in the "${catName}" category!`;
  
  // 显示最终排行榜
  socket.emit("getLeaderboard", currentRoom);
  
  // 通知所有 Player2 测验已完成
  socket.emit("quizComplete", {
    room: currentRoom,
    categoryName: catName,
    totalQuestions: total
  });
}

function nextQuestion(){
  if (!currentRoom) return alert("Apply room first");
  if (!currentCategory) return alert("Please choose a category.");
  
  const pick = pickRandomUnseen(currentCategory);
  if (!pick.q){
    showCompletionPage();
    return;
  }
  pushBankQuestionWithIndex(pick.idx);
}

/* ====================== DOM ready ====================== */
$(function(){
  // Lobby: generate default code
  const $room = $("#roomCode");
  $room.val(genCode());
  $("#genRoom").on("click", ()=> $room.val(genCode()));

  // Apply -> enter Stage
  $("#applyRoom").on("click", async ()=>{
    const r = ($room.val()||"").trim().toUpperCase();
    if(!r) return alert("Enter room code");
    currentRoom = r;
    window.currentRoom = r;

    socket.emit("join", currentRoom);

    hide("lobby");
    show("stage");

    $("#roomCodeText").text(currentRoom);
    const urlAud = audienceUrlFor(currentRoom);
    $("#joinUrl").text(urlAud).attr("href", urlAud);
    
    // ⭐ 生成二维码
    drawQR("qrCanvas", urlAud);
    
    socket.emit("getLeaderboard", currentRoom);

    try {
      if (sb) {
        const payload = { 
          code: currentRoom, 
          title: "Street Challenge Round", 
          body: "Interactive quiz game",     
          status: 'live', 
          truth: null,
          current_question: null,
          current_question_type: null,
          current_question_time_limit: null,
          current_question_number: null,
          current_question_total: null
        };
        const { error } = await sb.from('rounds').upsert(payload, { onConflict: 'code' });
        if (error) { 
          console.error('[P1] upsert rounds error:', error.message); 
          alert('Failed to create/update round: ' + error.message); 
        } else {
          console.log('[P1] ✅ Round created/updated in Supabase');
        }
      } else {
        console.warn('[P1] Supabase client not ready. Check /env.js');
      }
    } catch (e) {
      console.error('[P1] upsert rounds exception:', e);
    }

    subscribeVotes();
    window.dispatchEvent(new CustomEvent("room-code-updated", { detail: { code: currentRoom } }));

    resetCategoryProgress(currentCategory || "");
    loadBankOnce();
  });

  // 🔧 修复：Live stats updates + 自动跳转逻辑
  socket.on("deliverData", (d)=>{
    console.log("[P1] 📊 Received stats update:", d);
    
    // 更新统计数据显示
    $("#totalAnswers").text(d.totalAnswers||0);
    $("#correctAnswers").text(d.correctAnswers||0);
    $("#incorrectAnswers").text(d.incorrectAnswers||0);
    $("#correctUsers").text((d.correctUsers||[]).join(", ")||"—");
    $("#incorrectUsers").text((d.incorrectUsers||[]).join(", ")||"—");
    $("#correctAverage").text("%"+Math.round(Number(d.percentage)||0));
    
    // 🔧 自动跳转逻辑：如果有玩家回答了，立即停止倒计时并准备跳转
    if (d.totalAnswers > 0) {
      console.log("[P1] 🎯 Player answered! Stopping timer and preparing auto-advance...");
      
      // 立即清除倒计时定时器
      if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
      }
      
      // 立即停止视觉倒计时
      $("#timerBar").css("width", "0%");
      $("#timer").text("✅ Player Answered!");
      
      // 等待3秒后自动跳转（给玩家看反馈和统计的时间）
      autoAdvanceTimer = setTimeout(() => {
        console.log("[P1] 🚀 Auto-advancing after player answer...");
        autoAdvanceToNext();
      }, 3000);
    }
  });
  
  socket.on("leaderboard", (rows)=>{
    renderLeaderboard(rows);
    // 同时更新完成页面的排行榜
    const $completionTb = $("#completionLeaderboard tbody"); 
    $completionTb.empty();
    (rows||[]).forEach(r=>{
      $completionTb.append(`<tr><td>${r.rank}</td><td>${r.username}</td><td>${r.score}</td><td>${r.correctCount}</td><td>${r.avgTime}</td></tr>`);
    });
  });

  // Street Challenge UI
  loadBankOnce();
  
  // Category change
  $("#bankCategory").on("change", async function(){
    const newCategory = $(this).val();
    const hasStarted = (Q_COUNTER.get(currentCategory) || 0) > 0;
    
    if (hasStarted) {
      const confirmChange = confirm("Changing category will reset the current quiz. Continue?");
      if (!confirmChange) {
        $(this).val(currentCategory);
        return;
      }
    }
    
    currentCategory = newCategory;
    resetCategoryProgress(currentCategory);
    updateCategoryInfo();
    renderBankTable();
    hide("gameSummary");
    hide("completionPage");
    
    // ⭐ 清除当前问题（切换类别时应该清除）
    await clearCurrentQuestion();
  });
  
  // Start Quiz button
  $("#startQuiz").on("click", function(){
    if (!currentRoom) return alert("Apply room first");
    nextQuestion();
  });
  
  // New Round button
  $("#newRound").on("click", async function(){
    hide("completionPage");
    resetCategoryProgress(currentCategory);
    updateCategoryInfo();
    renderBankTable();
    
    // ⭐ 清除当前问题（新回合时应该清除）
    await clearCurrentQuestion();
  });
});