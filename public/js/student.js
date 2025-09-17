// Student: join -> choose mode -> practice (10Q) OR online
var socket = io();
var username = "", room = "";
var currentPracticeQ = null;
var onlineTimer1 = null, onlineTimer2 = null;

function parseQuery(name){
  try { return new URL(window.location.href).searchParams.get(name) || ""; }
  catch { return ""; }
}
function show(id){ document.getElementById(id).classList.remove("hidden"); }
function hide(id){ document.getElementById(id).classList.add("hidden"); }
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
function requestNextPractice(){
  $("#pFeedback").text("");
  $("#pProgress").text("");
  $("#pShortA").val("");
  $('input[name="pTFans"]').prop('checked', false);
  socket.emit("practiceNext", { room, username });
}

$(function(){
  // 预填房间 & 模式
  const autoRoom = (parseQuery("room")||"").toUpperCase();
  const autoMode = (parseQuery("mode")||"").toLowerCase();

  if (autoRoom) $("#roomInput").val(autoRoom);

  // 加入房间
  $("#joinBtn").on("click", ()=>{
    username = ($("#username").val()||"Anonymous").trim();
    room = ($("#roomInput").val()||"").trim().toUpperCase();
    if (!room) return alert("Enter room code");
    socket.emit("join", room);

    hide("joinCard"); show("modeCard");

    // 如果 URL 指定了 mode=practice，则自动进入练习
    if (autoMode === "practice") {
      hide("modeCard"); show("practiceCard");
      requestNextPractice();
    }
  });

  // 模式选择
  $("#modePractice").on("click", ()=>{
    hide("modeCard"); show("practiceCard");
    requestNextPractice();
  });
  $("#modeOnline").on("click", ()=>{
    hide("modeCard"); show("greeting");
  });

  // 退出练习 -> 回到模式选择
  $("#exitPractice").on("click", function(){
    $("#pFeedback").text("");
    $("#pProgress").text("");
    currentPracticeQ = null;
    hide("practiceCard");
    show("modeCard");
  });

  // 退出在线 -> 回到模式选择
  $("#exitOnline, #exitOnline2, #exitOnline3").on("click", function(){
    clearOnlineTimers();
    hide("shortAnswer"); hide("trueOrFalse"); hide("greeting");
    hide("feedbackCard");
    show("modeCard");
  });

  // 练习：收到题目
  socket.on("practiceQuestion", (q)=>{
    currentPracticeQ = q; $("#pFeedback").text(""); $("#pProgress").text("");
    if (q.questionType === 'short'){
      $("#pShortQ").text(q.question); show("pShort"); hide("pTF");
    } else {
      $("#pTFQ").text(q.question); show("pTF"); hide("pShort");
    }
  });
  socket.on("practiceNoMore", ({need})=>{
    $("#pFeedback").text("No more questions in bank. Ask teacher to add questions.");
  });
  socket.on("practiceFeedback", (res)=>{
    if (!res.ok) return $("#pFeedback").text(res.msg || "Error");
    $("#pFeedback").text(res.correct ? "Correct ✓" : "Incorrect ✗ (Answer: "+res.correctAnswer+")");
    $("#pProgress").text(`Progress: ${res.progress.answered}/10 | Correct: ${res.progress.correct}`);
  });
  socket.on("practiceRoundDone", (res)=>{
    $("#pFeedback").html(`Round finished! Correct ${res.correct}/${res.answered} · Accuracy ${(res.accuracy*100).toFixed(0)}% · +${res.pointsAdded} pts added to leaderboard.`);
    $("#pProgress").text("");
    currentPracticeQ = null;
  });
  socket.on("practiceDone", (res)=>{
    $("#pFeedback").html(`You already finished 10 this round. Accuracy ${(res.accuracy*100).toFixed(0)}%. Click Next to start a new round.`);
  });

  // 练习：提交答案（空则阻止）
  $("#pShortForm").on("submit", function(e){
    e.preventDefault();
    if (!currentPracticeQ) return;
    const ans = ($("#pShortA").val() || "").trim();
    if (!ans) { $("#pFeedback").text("Please enter an answer."); return; }
    socket.emit("practiceAnswer", { room, username, questionId: currentPracticeQ.id, answer: ans });
  });
  $("#pTFForm").on("submit", function(e){
    e.preventDefault();
    if (!currentPracticeQ) return;
    const ans = $('input[name="pTFans"]:checked').val();
    if (ans == null) { $("#pFeedback").text("Please choose True or False."); return; }
    socket.emit("practiceAnswer", { room, username, questionId: currentPracticeQ.id, answer: ans });
  });
  $("#pNext1, #pNext2").on("click", ()=> requestNextPractice());

  // 在线：短答题（空则阻止）
  $("#shortanswers").on("submit", function(){
    const ans = ($("#answer").val() || "").trim();
    if (!ans) { alert("Please enter an answer before submitting."); return false; }
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });
  // 在线：判断题（未选阻止）
  $("#tfanswers").on("submit", function(){
    const ans = $('input[name="tfanswer"]:checked').val();
    if (ans == null) { alert("Please choose True or False."); return false; }
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });

  // 在线：收到题目
  socket.on("deliverquestion", (msg)=>{
    hide("greeting");
    if (msg.questionType === "short"){
      $("#question").html(msg.question); show("shortAnswer"); hide("trueOrFalse");
      clearOnlineTimers(); onlineTimer1 = startTimer("sTimerBar1","timer", msg.timeLimit);
    } else {
      $("#tfquestion").html(msg.question); show("trueOrFalse"); hide("shortAnswer");
      clearOnlineTimers(); onlineTimer2 = startTimer("sTimerBar2","timer2", msg.timeLimit);
    }
    hide("feedbackCard"); $("#result").text("—"); $("#answertext").text("");
  });

  // 在线：判题结果（区分空回答）
  socket.on("resultquestion", (msg)=>{
    show("feedbackCard");
    if (msg.blank) {
      $("#result").text("No answer submitted");
    } else {
      $("#result").text(msg.correct ? "Correct!" : "Incorrect!");
    }
    $("#answertext").text("Correct answer: " + (msg.answer||""));
  });

  // 学生端不渲染排行榜（如需可扩展）
  socket.on("leaderboard", (rows)=>{ /* noop */ });
});
