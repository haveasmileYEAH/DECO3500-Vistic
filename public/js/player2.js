// public/js/player2.js

let socket = null; 
let username = "", room = "";
let onlineTimer1 = null, onlineTimer2 = null;
let voteRefreshTimer = null;

function parseQuery(name){
  try { return new URL(window.location.href).searchParams.get(name) || ""; }
  catch { return ""; }
}

function show(id){ 
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function hide(id){ 
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function clearOnlineTimers(){
  if (onlineTimer1) { clearInterval(onlineTimer1); onlineTimer1 = null; }
  if (onlineTimer2) { clearInterval(onlineTimer2); onlineTimer2 = null; }
}

function startTimer(barId, textId, seconds){
  let total = Number(seconds)||0, left = total;
  const $bar = $("#"+barId), $text = $("#"+textId);
  $bar.css("width","100%"); $text.text(total? total+" sec": "");
  const t = setInterval(()=>{
    left--; if (left<=0){ $bar.css("width","0%"); $text.text(""); clearInterval(t); return; }
    $bar.css("width", Math.floor(left/total*100)+"%"); $text.text(left+" sec");
  },1000);
  return t;
}

function ensureSocket() {
  if (socket && socket.connected) return true;
  if (typeof io !== "function") {
    alert("Socket.io client is not available. Check that /socket.io/socket.io.js loads correctly.");
    console.error("[P2] window.io is not defined. Verify the script tag and the server.");
    return false;
  }
  try {
    socket = io();
    socket.on("connect", ()=> console.log("[P2] socket connected:", socket.id));
    socket.on("connect_error", (err)=> console.error("[P2] connect_error:", err?.message || err));
    socket.on("disconnect", (r)=> console.warn("[P2] socket disconnected:", r));
    attachSocketListeners();
    return true;
  } catch (e) {
    console.error("[P2] io() failed:", e);
    alert("Failed to initialize socket connection.");
    return false;
  }
}

let sb = null;
let voteChannel = null;

const statEl = document.getElementById('voteStat2');
const barEl  = document.getElementById('voteBarUp2');

async function initSupabase(){
  try {
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    const createClient = mod?.createClient;
    if (createClient && window.SUPABASE_URL && window.SUPABASE_ANON_KEY){
      sb = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
  } catch (e) {
  }
}

async function refreshVotes(){
  if (!sb || !room) return;

  try {
    const { data, error } = await sb.rpc('get_vote_counts', { p_round_code: room });
    if (error) {
      console.error('[P2] get_vote_counts error:', error.message);
      return;
    }
    
    const up = data?.up || 0;
    const down = data?.down || 0;
    const total = up + down;
    const truePct = total ? Math.round((up / total) * 100) : 0;
    const falsePct = total ? Math.round((down / total) * 100) : 0;
    const voteChartCard = document.getElementById('voteChartCard');
    const barTrue = document.getElementById('barTrue');
    const barFalse = document.getElementById('barFalse');
    const valueTrue = document.getElementById('valueTrue');
    const valueFalse = document.getElementById('valueFalse');
    const countTrue = document.getElementById('countTrue');
    const countFalse = document.getElementById('countFalse');
    const voteStats = document.getElementById('voteStats');
    if (voteChartCard && total > 0) {
      voteChartCard.style.display = 'block';
    }
    
    if (barTrue) barTrue.style.height = truePct + '%';
    if (barFalse) barFalse.style.height = falsePct + '%';
    
    if (valueTrue) valueTrue.textContent = truePct + '%';
    if (valueFalse) valueFalse.textContent = falsePct + '%';
    
    if (countTrue) countTrue.textContent = `${up} vote${up !== 1 ? 's' : ''}`;
    if (countFalse) countFalse.textContent = `${down} vote${down !== 1 ? 's' : ''}`;
    
    if (voteStats) {
      voteStats.textContent = `Total: ${total} vote${total !== 1 ? 's' : ''} | True: ${truePct}% | False: ${falsePct}%`;
    }
    
    console.log('[P2] Vote chart updated:', { up, down, truePct, falsePct });
  } catch (e) {
    console.error('[P2] Error refreshing vote chart:', e);
  }
}

function startVoteRefresh(){
  if (voteRefreshTimer) {
    clearInterval(voteRefreshTimer);
  }
  voteRefreshTimer = setInterval(() => {
    if (room) {
      refreshVotes();
    }
  }, 3000);
  console.log('[P2] Vote refresh timer started');
}

function stopVoteRefresh(){
  if (voteRefreshTimer) {
    clearInterval(voteRefreshTimer);
    voteRefreshTimer = null;
    console.log('[P2] Vote refresh timer stopped');
  }
}

function subscribeVotes(){
  if (!sb) return;
  if (voteChannel) { sb.removeChannel(voteChannel); voteChannel = null; }
  if (!room) return;
  voteChannel = sb.channel('p2:'+room)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'votes', filter:`round_code=eq.${room}` }, refreshVotes)
    .subscribe();
  refreshVotes();
}

let listenersAttached = false;
function attachSocketListeners(){
  if (!socket || listenersAttached) return;
  listenersAttached = true;
  socket.on("deliverquestion", (msg)=>{
    hide("greeting");
    hide("completionCard");

    const n = (msg.qNumber ?? null), t = (msg.qTotal ?? null);
    const qText = (n && t) ? `Q ${n} / ${t}` : "Q — / —";
    const qNo2aEl = document.getElementById('qNo2a');
    if (qNo2aEl) qNo2aEl.textContent = qText;
    
    const qNo2bEl = document.getElementById('qNo2b');
    if (qNo2bEl) qNo2bEl.textContent = qText;

    if (msg.questionType === "short"){
      $("#question").html(msg.question); show("shortAnswer"); hide("trueOrFalse");
      clearOnlineTimers(); onlineTimer1 = startTimer("sTimerBar1","timer", msg.timeLimit);
    } else {
      $("#tfquestion").html(msg.question); show("trueOrFalse"); hide("shortAnswer");
      clearOnlineTimers(); onlineTimer2 = startTimer("sTimerBar2","timer2", msg.timeLimit);
    }
    hide("feedbackCard"); $("#result").text("—"); $("#answertext").text("");
    refreshVotes();
  });

  socket.on("resultquestion", (msg)=>{
    show("feedbackCard");
    if (msg.blank) $("#result").text("No answer submitted");
    else $("#result").text(msg.correct ? "Correct!" : "Incorrect!");
    $("#answertext").text("Correct answer: " + (msg.answer||""));
  });

  socket.on("quizCompleted", (data)=>{
    console.log("[P2] Quiz completed!", data);
    clearOnlineTimers();
    hide("shortAnswer");
    hide("trueOrFalse");
    hide("feedbackCard");
    hide("greeting");
    show("completionCard");
    const msgEl = document.getElementById('completionMsg');
    if (msgEl && data.categoryName) {
      msgEl.textContent = `Congratulations! You have completed all ${data.totalQuestions || ''} questions in the "${data.categoryName}" category!`;
    }
    if (data.leaderboard && Array.isArray(data.leaderboard)) {
      renderCompletionLeaderboard(data.leaderboard);
    }
  });
  socket.on("leaderboard", ()=>{ /* no-op */ });
}

function renderCompletionLeaderboard(rows){
  const $tb = $("#completionLeaderboard tbody");
  $tb.empty();
  (rows||[]).forEach(r=>{
    $tb.append(`<tr><td>${r.rank}</td><td>${r.username}</td><td>${r.score}</td><td>${r.correctCount}</td><td>${r.avgTime}</td></tr>`);
  });
}

$(async function(){
  await initSupabase();

  const autoRoom = (parseQuery("room")||parseQuery("code")||"").toUpperCase();
  if (autoRoom) $("#roomInput").val(autoRoom);

  $("#joinBtn").on("click", ()=>{
    username = ($("#username").val()||"Anonymous").trim();
    room = ($("#roomInput").val()||"").trim().toUpperCase();
    if (!room) return alert("Enter room code");
    if (!ensureSocket()) return;
    socket.emit("join", room);
    console.log("[P2] emitted join:", room);

    hide("lobby");
    show("stage");
    show("greeting");
    show("voteCard");

    subscribeVotes();
    startVoteRefresh();
  });

  // Exit -> back to Lobby
  $("#exitOnline, #exitOnline2, #exitOnline3").on("click", function(){
    clearOnlineTimers();
    stopVoteRefresh();
    hide("shortAnswer"); hide("trueOrFalse"); hide("greeting");
    hide("feedbackCard"); hide("voteCard"); hide("completionCard");
    show("lobby");
    if (voteChannel && sb) { sb.removeChannel(voteChannel); voteChannel = null; }
  });

  $("#shortanswers").on("submit", function(){
    const ans = ($("#answer").val() || "").trim();
    if (!ans) { alert("Please enter an answer before submitting."); return false; }
    if (!ensureSocket()) return false;
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });
  $("#tfanswers").on("submit", function(){
    const ans = $('input[name="tfanswer"]:checked').val();
    if (ans == null) { alert("Please choose True or False."); return false; }
    if (!ensureSocket()) return false;
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });
});