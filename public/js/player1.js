// Player 1: permanent practice room + room & QR + bank manager + online quiz + leaderboard
// 基于你的 teacher.js 迁移，保留原有功能，仅把“临时房间”的二维码/链接指向 /audience?code=XXXXXX

var socket = io();
var currentRoom = "";

// ---------- helpers ----------
function genCode(n=6){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

// 原有：生成学生端 join 链接（保留用于“永久练习”）
function joinUrlForPlayer(room, opts={}){
  const base = window.location.origin + "/player2";
  const u = new URL(base);
  u.searchParams.set("room", room);
  if (opts.mode) u.searchParams.set("mode", opts.mode);
  return u.toString();
}

// 新增：观众投票页链接（街头挑战首选二维码目标）
function audienceUrlFor(room){
  const u = new URL(window.location.origin + "/audience");
  u.searchParams.set("code", room);
  return u.toString();
}

function drawQR(canvasId, text){
  const canvas = document.getElementById(canvasId);
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

// ---------- Question bank render ----------
let BANK = [];
function renderBankTable(){
  const $tb = $("#bankTable tbody");
  const kw = ($("#bankSearch").val()||"").toLowerCase();
  $tb.empty();
  BANK.filter(q=>{
    if (!kw) return true;
    return (q.question||"").toLowerCase().includes(kw)
        || (q.answer||"").toLowerCase().includes(kw)
        || (q.id||"").toLowerCase().includes(kw)
        || (q.questionType||"").toLowerCase().includes(kw);
  }).forEach(q=>{
    const label = q.questionType === 'truefalse' ? 'True/False' : 'Short';
    $tb.append(`
      <tr data-id="${q.id}">
        <td><input type="checkbox" class="rowSel"></td>
        <td>${label}</td>
        <td>${escapeHtml(q.question||"")}</td>
        <td>${escapeHtml(q.answer||"")}</td>
        <td class="mono">${q.id}</td>
        <td><button class="btn btn-ghost delOne">Delete</button></td>
      </tr>
    `);
  });
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (m)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

$(function(){
  // ---- Permanent room info ----
  socket.emit("getPermanentRoomInfo");
  socket.on("permanentRoomInfo", ({code})=>{
    $("#permCode").text(code);
    const url = joinUrlForPlayer(code, {mode:"practice"}); // 练习模式仍走玩家页
    $("#permUrl").text(url);
    drawQR("qrPermCanvas", url);
    $("#copyPerm").on("click", ()=>{
      navigator.clipboard.writeText(code).then(()=>{
        $("#bankMsg").text("Permanent code copied ✓");
        setTimeout(()=>$("#bankMsg").text(""), 1200);
      });
    });
  });

  // ---- Online temp room (for live questions / street challenge) ----
  const $room = $("#roomCode");
  $("#genRoom").on("click", ()=> $room.val(genCode()));
  $("#applyRoom").on("click", ()=>{
    const r = ($room.val()||"").trim().toUpperCase();
    if(!r) return alert("Enter room code");
    currentRoom = r;
    socket.emit("join", currentRoom);
    $("#roomCodeText").text(currentRoom);

    // 关键改动：观众二维码 → /audience?code=XXXX
    const urlAud = audienceUrlFor(currentRoom);
    $("#joinUrl").text(urlAud);
    drawQR("qrCanvas", urlAud);

    socket.emit("getLeaderboard", currentRoom);
  });
  $room.val(genCode());

  // ---- Question bank manager ----
  socket.emit("getQuestionBankCount");
  socket.emit("getQuestionBank");

  socket.on("questionBankUpdated", ({count})=>{
    $("#bankCount").text(count ?? 0);
  });
  socket.on("questionBankList", (arr)=>{
    BANK = Array.isArray(arr) ? arr : [];
    renderBankTable();
    $("#bankCount").text(BANK.length);
  });

  $("#refreshBank").on("click", ()=> socket.emit("getQuestionBank"));
  $("#bankSearch").on("input", renderBankTable);

  $("#bankTable").on("click", ".delOne", function(){
    const id = $(this).closest("tr").data("id");
    if (!id) return;
    if (!confirm("Delete this question?")) return;
    socket.emit("deleteQuestion", { id });
  });

  $("#selectAll").on("change", function(){
    const on = $(this).is(":checked");
    $("#bankTable .rowSel").prop("checked", on);
  });

  $("#deleteSelected").on("click", function(){
    const ids = [];
    $("#bankTable tbody tr").each(function(){
      const on = $(this).find(".rowSel").is(":checked");
      if (on) ids.push($(this).data("id"));
    });
    if (ids.length === 0) { alert("No rows selected."); return; }
    if (!confirm(`Delete ${ids.length} selected question(s)?`)) return;
    socket.emit("deleteQuestions", { ids });
  });

  $("#bankForm").on("submit", (e)=>{
    e.preventDefault();
    const type = $('input[name="bkType"]:checked').val();
    const q = $("#bkQ").val(), a = $("#bkA").val();
    if (!q || !a) return alert("Fill question & answer");
    socket.emit("addOfflineQuestion", { questionType:type, question:q, answer:a });
  });
  socket.on("addOfflineQuestionOK", ()=>{
    $("#bankMsg").text("Added ✓");
    setTimeout(()=>$("#bankMsg").text(""), 1200);
    $("#bkQ").val(""); $("#bkA").val("");
    socket.emit("getQuestionBank");
  });

  // ---- Online quiz UI ----
  $("#shortAnswer").on("click", ()=>{ show("short"); hide("truefalse"); });
  $("#trueFalse").on("click", ()=>{ show("truefalse"); hide("short"); });
  $("#reset").on("click", ()=>{ show("gameSelection"); hide("short"); hide("truefalse"); });

  // Send short
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

  // Send TF
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

  // Live stats
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
