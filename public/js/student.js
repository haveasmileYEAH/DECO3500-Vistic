// Student: join -> choose mode -> practice (10Q) OR online
var socket = io();
var username = "", room = "";
var currentPracticeQ = null;

function parseQueryRoom(){
  try { return new URL(window.location.href).searchParams.get("room") || ""; }
  catch { return ""; }
}
function show(id){ document.getElementById(id).classList.remove("hidden"); }
function hide(id){ document.getElementById(id).classList.add("hidden"); }

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
  $("#pFeedback").text(""); $("#pShortA").val(""); $('input[name="pTFans"]').prop('checked', false);
  socket.emit("practiceNext", { room, username });
}

$(function(){
  // 预填房间
  const autoRoom = (parseQueryRoom()||"").toUpperCase();
  if (autoRoom) $("#roomInput").val(autoRoom);

  // 加入房间
  $("#joinBtn").on("click", ()=>{
    username = ($("#username").val()||"Anonymous").trim();
    room = ($("#roomInput").val()||"").trim().toUpperCase();
    if (!room) return alert("Enter room code");
    socket.emit("join", room);
    hide("joinCard"); show("modeCard");
  });

  // 模式选择
  $("#modePractice").on("click", ()=>{
    hide("modeCard"); show("practiceCard");
    requestNextPractice();
  });
  $("#modeOnline").on("click", ()=>{
    hide("modeCard"); show("greeting");
  });

  // 练习：收到题目
  socket.on("practiceQuestion", (q)=>{
    currentPracticeQ = q; $("#pFeedback").text("");
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

  // 练习：提交答案
  $("#pShortForm").on("submit", (e)=>{
    e.preventDefault();
    if (!currentPracticeQ) return;
    const ans = $("#pShortA").val();
    socket.emit("practiceAnswer", { room, username, questionId: currentPracticeQ.id, answer: ans });
  });
  $("#pTFForm").on("submit", (e)=>{
    e.preventDefault();
    if (!currentPracticeQ) return;
    const ans = $('input[name="pTFans"]:checked').val();
    socket.emit("practiceAnswer", { room, username, questionId: currentPracticeQ.id, answer: ans });
  });
  $("#pNext1, #pNext2").on("click", ()=> requestNextPractice());

  // 在线：收到题目
  $("#shortanswers").on("submit", ()=>{
    const ans = $("#answer").val();
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });
  $("#tfanswers").on("submit", ()=>{
    const ans = $('input[name="tfanswer"]:checked').val();
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });

  socket.on("deliverquestion", (msg)=>{
    hide("greeting");
    if (msg.questionType === "short"){
      $("#question").html(msg.question); show("shortAnswer"); hide("trueOrFalse");
      startTimer("sTimerBar1","timer", msg.timeLimit);
    } else {
      $("#tfquestion").html(msg.question); show("trueOrFalse"); hide("shortAnswer");
      startTimer("sTimerBar2","timer2", msg.timeLimit);
    }
    hide("feedbackCard"); $("#result").text("—"); $("#answertext").text("");
  });

  socket.on("resultquestion", (msg)=>{
    show("feedbackCard");
    $("#result").text(msg.correct ? "Correct!" : "Incorrect!");
    $("#answertext").text("Correct answer: " + (msg.answer||""));
  });

  // 排行榜更新（可选要显示的话，可以在学生端加表格，这里先不渲染）
  socket.on("leaderboard", (rows)=>{ /* noop for students */ });
});
