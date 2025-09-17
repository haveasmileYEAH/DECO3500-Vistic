// Student side: join by room (QR or code) + answer
var socket = io();
var username = "";
var room = "";
var countdownTimer1 = null;
var countdownTimer2 = null;

function parseQueryRoom(){
  const u = new URL(window.location.href);
  return (u.searchParams.get("room") || "").trim().toUpperCase();
}

function show(el){ el.classList.remove("hidden"); el.setAttribute("aria-hidden","false"); }
function hide(el){ el.classList.add("hidden"); el.setAttribute("aria-hidden","true"); }

function startTimer(targetBarId, targetTextId, seconds){
  let remaining = Number(seconds)||0;
  const bar = $("#"+targetBarId);
  const text = $("#"+targetTextId);
  const total = remaining;
  function tick(){
    if(remaining <= 0){
      bar.css("width","0%");
      text.text("");
      return;
    }
    const pct = Math.max(0, Math.floor((remaining/total)*100));
    bar.css("width", pct + "%");
    text.text(remaining + " sec");
    remaining--;
  }
  tick();
  return setInterval(tick, 1000);
}

$(function(){
  // 预填房间
  const autoRoom = parseQueryRoom();
  if (autoRoom) $("#roomInput").val(autoRoom);

  $("#joinBtn").on("click", function(){
    username = ($("#username").val() || "Anonymous").trim();
    room = ($("#roomInput").val() || "").trim().toUpperCase();
    if(!room){ alert("Enter room code."); return; }
    socket.emit("join", room);
    hide(document.getElementById("joinCard"));
    show(document.getElementById("greeting"));
  });

  // 简答提交
  $("#shortanswers").on("submit", function(){
    const ans = $("#answer").val();
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });

  // 判断提交
  $("#tfanswers").on("submit", function(){
    const ans = $('input[name="tfanswer"]:checked').val();
    socket.emit("answerquestion", { room, answer: ans, username });
    return false;
  });

  // 收到题目
  socket.on("deliverquestion", function(msg){
    // 展示正确的版块
    hide(document.getElementById("greeting"));
    if (msg.questionType === "short"){
      $("#question").html(msg.question);
      show(document.getElementById("shortAnswer"));
      hide(document.getElementById("trueOrFalse"));
      clearInterval(countdownTimer1);
      countdownTimer1 = startTimer("sTimerBar1", "timer", msg.timeLimit);
    } else {
      $("#tfquestion").html(msg.question);
      show(document.getElementById("trueOrFalse"));
      hide(document.getElementById("shortAnswer"));
      clearInterval(countdownTimer2);
      countdownTimer2 = startTimer("sTimerBar2", "timer2", msg.timeLimit);
    }
    // 清反馈
    hide(document.getElementById("feedbackCard"));
    $("#result").text("—"); $("#answertext").text("");
  });

  // 判题结果
  socket.on("resultquestion", function(msg){
    show(document.getElementById("feedbackCard"));
    $("#result").text(msg.correct ? "Correct!" : "Incorrect!");
    $("#answertext").text("Correct answer: " + (msg.answer || ""));
  });
});
