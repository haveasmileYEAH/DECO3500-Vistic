// Teacher: room + QR + add to bank + online quiz + leaderboard
var socket = io();
var currentRoom = "";

function genCode(n=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function joinUrlFor(room){
  const base = window.location.origin + "/student";
  const u = new URL(base);
  u.searchParams.set("room", room);
  return u.toString();
}
function drawQR(text){
  const canvas = document.getElementById("qrCanvas");
  if (!canvas || !window.QRCode) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  QRCode.toCanvas(canvas, text, {width:160, margin:1}, function(err){ if(err) console.error(err); });
}
function show(id){ document.getElementById(id).classList.remove("hidden"); }
function hide(id){ document.getElementById(id).classList.add("hidden"); }

function startCountdown(seconds){
  let total = Number(seconds)||0, left = total;
  const bar = $("#timerBar"), text = $("#timer");
  bar.css("width", "100%"); text.text(total? total+" sec": "");
  const t = setInterval(()=>{
    left--; if (left<=0){ bar.css("width","0%"); text.text(""); clearInterval(t); return; }
    bar.css("width", Math.floor(left/total*100)+"%"); text.text(left+" sec");
  },1000);
}

function renderLeaderboard(rows){
  const $tb = $("#leaderboard tbody"); $tb.empty();
  (rows||[]).forEach(r=>{
    $tb.append(`<tr><td>${r.rank}</td><td>${r.username}</td><td>${r.score}</td><td>${r.correctCount}</td><td>${r.avgTime}</td></tr>`);
  });
}

$(function(){
  // 房间
  const $room = $("#roomCode");
  $("#genRoom").on("click", ()=> $room.val(genCode()));
  $("#applyRoom").on("click", ()=>{
    const r = ($room.val()||"").trim().toUpperCase();
    if(!r) return alert("Enter room code");
    currentRoom = r;
    socket.emit("join", currentRoom);
    $("#roomCodeText").text(currentRoom);
    const url = joinUrlFor(currentRoom);
    $("#joinUrl").text(url);
    drawQR(url);
    socket.emit("getLeaderboard", currentRoom);
  });
  $room.val(genCode());

  // 题库：加载数量
  socket.emit("getQuestionBankCount");
  socket.on("questionBankUpdated", ({count})=>{
    $("#bankCount").text(count ?? 0);
  });

  // 题库：新增
  $("#bankForm").on("submit", (e)=>{
    e.preventDefault();
    const type = $('input[name="bkType"]:checked').val();
    const q = $("#bkQ").val(), a = $("#bkA").val();
    if (!q || !a) return alert("Fill question & answer");
    socket.emit("addOfflineQuestion", { questionType:type, question:q, answer:a });
  });
  socket.on("addOfflineQuestionOK", (res)=>{
    $("#bankMsg").text("Added ✓");
    setTimeout(()=>$("#bankMsg").text(""), 1500);
    $("#bkQ").val(""); $("#bkA").val("");
  });

  // 在线模式 UI
  $("#shortAnswer").on("click", ()=>{ show("short"); hide("truefalse"); });
  $("#trueFalse").on("click", ()=>{ show("truefalse"); hide("short"); });
  $("#reset").on("click", ()=>{ show("gameSelection"); hide("short"); hide("truefalse"); });

  // 在线：简答题
  $("#shortQuestion").on("submit", ()=>{
    if(!currentRoom) return alert("Apply room first");
    hide("gameSelection"); hide("short"); show("gameSummary");
    socket.emit("submitquestion", {
      room: currentRoom,
      question: $("#question").val(),
      answer: $("#answer").val(),
      timeLimit: $("#timeLimit").val(),
      questionType: "short"
    });
    startCountdown($("#timeLimit").val());
    return false;
  });

  // 在线：判断题
  $("#trueFalseQuestion").on("submit", ()=>{
    if(!currentRoom) return alert("Apply room first");
    hide("gameSelection"); hide("truefalse"); show("gameSummary");
    const tfAns = $('input[name="tfanswer"]:checked').val();
    socket.emit("submitquestion", {
      room: currentRoom,
      question: $("#tfquestion").val(),
      answer: tfAns,
      timeLimit: $("#tftimeLimit").val(),
      questionType: "truefalse"
    });
    startCountdown($("#tftimeLimit").val());
    return false;
  });

  // 汇总 & 排行榜（在线）
  socket.on("deliverData", (d)=>{
    $("#totalAnswers").text(d.totalAnswers||0);
    $("#correctAnswers").text(d.correctAnswers||0);
    $("#incorrectAnswers").text(d.incorrectAnswers||0);
    $("#correctUsers").text((d.correctUsers||[]).join(", ")||"—");
    $("#incorrectUsers").text((d.incorrectUsers||[]).join(", ")||"—");
    $("#correctAverage").text("%"+Math.round(Number(d.percentage)||0));
  });
  socket.on("leaderboard", renderLeaderboard);
});
