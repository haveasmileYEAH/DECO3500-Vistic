// Teacher side: room + QR + ask + offline + leaderboard
var socket = io();
var currentRoom = "";
var countdownTimer = null;
var totalSeconds = 0;

function genCode(n=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
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
  // 清空画布
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width, canvas.height);
  QRCode.toCanvas(canvas, text, {width:160, margin:1}, function(error){ if(error) console.error(error); });
}

function show(el){ el.classList.remove("hidden"); el.setAttribute("aria-hidden","false"); }
function hide(el){ el.classList.add("hidden"); el.setAttribute("aria-hidden","true"); }

function startCountdown(seconds){
  clearInterval(countdownTimer);
  totalSeconds = Number(seconds)||0;
  let remaining = totalSeconds;
  const bar = $("#timerBar");
  const text = $("#timer");
  function tick(){
    if (remaining <= 0){
      bar.css("width", "0%");
      text.text("");
      clearInterval(countdownTimer);
      return;
    }
    const pct = Math.max(0, Math.floor((remaining/totalSeconds)*100));
    bar.css("width", pct + "%");
    text.text(remaining + " sec");
    remaining--;
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderLeaderboard(rows){
  const $tb = $("#leaderboard tbody");
  $tb.empty();
  rows.forEach(row=>{
    $tb.append(`<tr><td>${row.rank}</td><td>${row.username}</td><td>${row.score}</td><td>${row.correctCount}</td><td>${row.avgTime}</td></tr>`);
  });
}

$(function(){
  // 初始生成房间号
  const $roomInput = $("#roomCode");
  $("#genRoom").on("click", ()=>{
    $roomInput.val(genCode());
  });
  $("#applyRoom").on("click", ()=>{
    const r = ($roomInput.val()||"").trim().toUpperCase();
    if(!r){ alert("Please enter a room code."); return; }
    currentRoom = r;
    socket.emit("join", currentRoom);
    $("#roomCodeText").text(currentRoom);
    const url = joinUrlFor(currentRoom);
    $("#joinUrl").text(url);
    drawQR(url);
    // 拿一次排行榜
    socket.emit("getLeaderboard", currentRoom);
  });
  // 默认给一个
  $roomInput.val(genCode());

  // UI 切换
  $("#shortAnswer").on("click", function(){
    show(document.getElementById("short"));
    hide(document.getElementById("truefalse"));
  });
  $("#trueFalse").on("click", function(){
    show(document.getElementById("truefalse"));
    hide(document.getElementById("short"));
  });
  $("#cancelShort").on("click", function(){
    hide(document.getElementById("short"));
  });
  $("#cancelTF").on("click", function(){
    hide(document.getElementById("truefalse"));
  });

  $("#reset").on("click", function(){
    show(document.getElementById("gameSelection"));
    hide(document.getElementById("short"));
    hide(document.getElementById("truefalse"));
  });

  // 发送题目（简答）
  $("#shortQuestion").on("submit", function(){
    if(!currentRoom){ alert("Apply a room first."); return false; }
    hide(document.getElementById("gameSelection"));
    hide(document.getElementById("short"));
    show(document.getElementById("gameSummary"));

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

  // 发送题目（判断）
  $("#trueFalseQuestion").on("submit", function(){
    if(!currentRoom){ alert("Apply a room first."); return false; }
    hide(document.getElementById("gameSelection"));
    hide(document.getElementById("truefalse"));
    show(document.getElementById("gameSummary"));

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

  // 线下答题录入 - 动态行
  function addOfflineRow(){
    const id = "r" + Math.random().toString(36).slice(2,7);
    $("#offlineRows").append(`
      <div class="offline-row" data-id="${id}">
        <input class="input sm" placeholder="Name">
        <select class="input sm">
          <option value="true">Correct</option>
          <option value="false">Incorrect</option>
        </select>
        <input class="input sm" type="number" min="0" placeholder="Time(s) optional">
        <button type="button" class="btn btn-ghost rm">✕</button>
      </div>
    `);
  }
  $("#addRow").on("click", addOfflineRow);
  addOfflineRow(); // 默认一行

  $("#offlineForm").on("submit", function(e){
    e.preventDefault();
    if(!currentRoom){ alert("Apply a room first."); return; }
    const rows = [];
    $("#offlineRows .offline-row").each(function(){
      const $inputs = $(this).find(".input");
      const name = $inputs.eq(0).val();
      const corr = $inputs.eq(1).val() === "true";
      const tsecRaw = $inputs.eq(2).val();
      const tsec = tsecRaw === "" ? null : Number(tsecRaw);
      if(name){
        rows.push({ username: name, correct: corr, timeTakenSec: tsec });
      }
    });
    if(rows.length === 0){ alert("No rows to submit."); return; }
    socket.emit("addOfflineAnswers", { room: currentRoom, results: rows });
    // 清空以便继续录入
    $("#offlineRows").empty();
    addOfflineRow();
  });

  $("#offlineRows").on("click", ".rm", function(){
    $(this).closest(".offline-row").remove();
  });

  // 收统计
  socket.on("deliverData", function(data){
    $("#totalAnswers").text(data.totalAnswers || 0);
    $("#correctAnswers").text(data.correctAnswers || 0);
    $("#incorrectAnswers").text(data.incorrectAnswers || 0);
    $("#correctUsers").text((data.correctUsers || []).join(", ") || "—");
    $("#incorrectUsers").text((data.incorrectUsers || []).join(", ") || "—");
    $("#correctAverage").text("%" + Math.round(Number(data.percentage) || 0));
  });

  // 收排行榜
  socket.on("leaderboard", function(rows){
    renderLeaderboard(rows || []);
  });
});
