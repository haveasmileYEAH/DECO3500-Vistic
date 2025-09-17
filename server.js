/**
 * Hybrid Kahoot: room + QR + offline answers + leaderboard
 */
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'teacher.html'));
});
app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

/** ---- Room state ----
rooms: Map<string, {
  scores: Map<string, {score:number, correctCount:number, totalTime:number, answers:number}>
  currentQ: {answer:string, questionType:'short'|'truefalse', timeLimit:number, startAt:number|null}
  stats: {correct:number, incorrect:number, usersCorrect:string[], usersIncorrect:string[]}
}>
*/
const rooms = new Map();

function getRoomState(room) {
  if (!rooms.has(room)) {
    rooms.set(room, {
      scores: new Map(),
      currentQ: null,
      stats: { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] }
    });
  }
  return rooms.get(room);
}

function computeLeaderboard(scoresMap) {
  const arr = [];
  scoresMap.forEach((v, name) => {
    const avgTime = v.answers ? Math.round(v.totalTime / v.answers) : 0;
    arr.push({ username: name, score: v.score, correctCount: v.correctCount, avgTime });
  });
  arr.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.avgTime - b.avgTime; // 更快者优先
  });
  return arr.map((x, i) => ({ rank: i + 1, ...x }));
}

// 正确=100 基分；速度加分：最多+50，按剩余时间线性缩放
function scoreForAnswer(isCorrect, elapsedMs, timeLimitSec) {
  if (!isCorrect) return 0;
  const base = 100;
  if (!timeLimitSec || elapsedMs == null) return base; // 离线或无计时：不给速度分
  const total = Math.max(1, timeLimitSec * 1000);
  const left = Math.max(0, total - elapsedMs);
  const bonus = Math.floor((left / total) * 50);
  return base + bonus;
}

io.on('connection', (socket) => {
  let joinedRooms = new Set();

  // 学生/老师加入房间
  socket.on('join', (room) => {
    if (!room || typeof room !== 'string') return;
    room = room.trim().toUpperCase();
    socket.join(room);
    joinedRooms.add(room);
    getRoomState(room); // 确保房间存在
    // 初次加入可推送排行榜（若已有）
    const state = getRoomState(room);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
  });

  // 老师出题（在线/现场都可用同一流程）
  socket.on('submitquestion', (data) => {
    const { room, question, answer, timeLimit, questionType } = data || {};
    if (!room || !questionType) return;
    const r = room.trim().toUpperCase();
    const state = getRoomState(r);
    // 新题重置本题统计；排行榜沿用累积（跨题得分）
    state.currentQ = {
      answer: String(answer ?? ''),
      questionType,
      timeLimit: Number(timeLimit) || 0,
      startAt: Date.now()
    };
    state.stats = { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] };

    io.to(r).emit('deliverquestion', {
      question,
      questionType,
      timeLimit: Number(timeLimit) || 0
    });
  });

  // 学生答题（在线）
  socket.on('answerquestion', (data) => {
    const { room, answer, username } = data || {};
    if (!room) return;
    const r = room.trim().toUpperCase();
    const state = getRoomState(r);
    const user = (username || 'Anonymous').trim();

    const cq = state.currentQ;
    let elapsed = null;
    let isCorrect = false;

    if (cq) {
      isCorrect = String(answer) === String(cq.answer);
      if (cq.startAt) elapsed = Date.now() - cq.startAt;
    } else {
      // 没有当前题时不计分
      isCorrect = false;
    }

    // 更新排行榜与统计
    const pts = scoreForAnswer(isCorrect, elapsed, cq ? cq.timeLimit : 0);
    const rec = state.scores.get(user) || { score: 0, correctCount: 0, totalTime: 0, answers: 0 };
    rec.score += pts;
    rec.answers += 1;
    if (isCorrect) rec.correctCount += 1;
    if (elapsed != null) rec.totalTime += Math.max(0, Math.floor(elapsed / 1000));
    state.scores.set(user, rec);

    if (isCorrect) {
      state.stats.correct += 1;
      if (!state.stats.usersCorrect.includes(user)) state.stats.usersCorrect.push(user);
    } else {
      state.stats.incorrect += 1;
      if (!state.stats.usersIncorrect.includes(user)) state.stats.usersIncorrect.push(user);
    }

    const totalAns = state.stats.correct + state.stats.incorrect;
    const percentage = totalAns ? (state.stats.correct / totalAns) * 100 : 0;

    io.to(r).emit('deliverData', {
      totalAnswers: totalAns,
      correctAnswers: state.stats.correct,
      incorrectAnswers: state.stats.incorrect,
      incorrectUsers: state.stats.usersIncorrect,
      correctUsers: state.stats.usersCorrect,
      percentage
    });

    io.to(socket.id).emit('resultquestion', {
      correct: isCorrect,
      answer: cq ? cq.answer : '',
      username: user
    });

    io.to(r).emit('leaderboard', computeLeaderboard(state.scores));
  });

  // 老师批量录入线下答题 results: [{username, correct:boolean, timeTakenSec?:number}]
  socket.on('addOfflineAnswers', (data) => {
    const { room, results } = data || {};
    if (!room || !Array.isArray(results)) return;
    const r = room.trim().toUpperCase();
    const state = getRoomState(r);
    const cq = state.currentQ;

    results.forEach((row) => {
      const user = (row.username || 'Offline').trim();
      const isCorrect = !!row.correct;
      const timeTakenSec = row.timeTakenSec != null ? Number(row.timeTakenSec) : null;

      const elapsedMs = timeTakenSec != null ? timeTakenSec * 1000 : null;
      const pts = scoreForAnswer(isCorrect, elapsedMs, cq ? cq.timeLimit : 0);

      const rec = state.scores.get(user) || { score: 0, correctCount: 0, totalTime: 0, answers: 0 };
      rec.score += pts;
      rec.answers += 1;
      if (isCorrect) rec.correctCount += 1;
      if (elapsedMs != null) rec.totalTime += Math.max(0, Math.floor(elapsedMs / 1000));
      state.scores.set(user, rec);

      if (isCorrect) {
        state.stats.correct += 1;
        if (!state.stats.usersCorrect.includes(user)) state.stats.usersCorrect.push(user);
      } else {
        state.stats.incorrect += 1;
        if (!state.stats.usersIncorrect.includes(user)) state.stats.usersIncorrect.push(user);
      }
    });

    const totalAns = state.stats.correct + state.stats.incorrect;
    const percentage = totalAns ? (state.stats.correct / totalAns) * 100 : 0;

    io.to(r).emit('deliverData', {
      totalAnswers: totalAns,
      correctAnswers: state.stats.correct,
      incorrectAnswers: state.stats.incorrect,
      incorrectUsers: state.stats.usersIncorrect,
      correctUsers: state.stats.usersCorrect,
      percentage
    });

    io.to(r).emit('leaderboard', computeLeaderboard(state.scores));
  });

  socket.on('getLeaderboard', (room) => {
    const r = (room || '').trim().toUpperCase();
    if (!r) return;
    const state = getRoomState(r);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
  });

  socket.on('disconnect', () => {
    joinedRooms.clear();
  });
});

http.listen(PORT, function(){
  console.log('listening on *:' + PORT);
});
