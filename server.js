/**
 * Room + leaderboard + question bank + practice-rounds(10Q)
 */
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');
var fs = require('fs');

const PORT = process.env.PORT || 3000;

// ---------- Static ----------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'teacher.html'));
});
app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'student.html'));
});

// ---------- Question Bank (JSON file) ----------
const DATA_DIR = path.join(__dirname, 'data');
const QFILE = path.join(DATA_DIR, 'questions.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(QFILE)) fs.writeFileSync(QFILE, '[]', 'utf-8');
}
function loadBank() {
  ensureDataFile();
  try { return JSON.parse(fs.readFileSync(QFILE, 'utf-8')); }
  catch { return []; }
}
function saveBank(arr) {
  ensureDataFile();
  fs.writeFileSync(QFILE, JSON.stringify(arr, null, 2), 'utf-8');
}
let questionBank = loadBank(); // [{id, questionType, question, answer}]

// ---------- Rooms state ----------
/**
rooms: Map<string, {
  scores: Map<string, {score:number, correctCount:number, totalTime:number, answers:number}>
  currentQ: {answer:string, questionType:'short'|'truefalse', timeLimit:number, startAt:number|null} | null
  stats: {correct:number, incorrect:number, usersCorrect:string[], usersIncorrect:string[]}
  practice: Map<string, {asked:Set<string>, answered:number, correct:number}>
}>
*/
const rooms = new Map();

function getRoom(r) {
  if (!rooms.has(r)) {
    rooms.set(r, {
      scores: new Map(),
      currentQ: null,
      stats: { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] },
      practice: new Map()
    });
  }
  return rooms.get(r);
}

function computeLeaderboard(scoresMap) {
  const arr = [];
  scoresMap.forEach((v, name) => {
    const avgTime = v.answers ? Math.round(v.totalTime / v.answers) : 0;
    arr.push({ username: name, score: v.score, correctCount: v.correctCount, avgTime });
  });
  arr.sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.avgTime - b.avgTime;
  });
  return arr.map((x,i)=>({ rank:i+1, ...x }));
}

// 在线题目的得分：正确100 + 最多50速度分
function scoreOnline(isCorrect, elapsedMs, timeLimitSec) {
  if (!isCorrect) return 0;
  const base = 100;
  if (!timeLimitSec || elapsedMs == null) return base;
  const total = Math.max(1, timeLimitSec * 1000);
  const left = Math.max(0, total - elapsedMs);
  const bonus = Math.floor((left / total) * 50);
  return base + bonus;
}

// 练习（题库）每轮10题：轮得分 = Math.round(正确率 * 100)
function scorePractice(roundAcc) {
  return Math.round(roundAcc * 100);
}

// ---------- Socket ----------
io.on('connection', (socket) => {
  let joined = new Set();

  // --- 通用：加入房间 & 获取排行榜 & 题库统计 ---
  socket.on('join', (room) => {
    if (!room) return;
    const r = room.trim().toUpperCase();
    socket.join(r); joined.add(r);
    const state = getRoom(r);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
    io.to(socket.id).emit('questionBankUpdated', { count: questionBank.length });
  });

  socket.on('getLeaderboard', (room) => {
    const r = (room||'').trim().toUpperCase(); if (!r) return;
    const state = getRoom(r);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
  });

  socket.on('getQuestionBankCount', () => {
    io.to(socket.id).emit('questionBankUpdated', { count: questionBank.length });
  });

  // --- 老师：新增题库题目（写入JSON）---
  // data: {questionType:'short'|'truefalse', question:string, answer:string}
  socket.on('addOfflineQuestion', (data) => {
    if (!data || !data.questionType || !data.question) return;
    const q = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2,8),
      questionType: data.questionType === 'truefalse' ? 'truefalse' : 'short',
      question: String(data.question),
      answer: String(data.answer ?? '')
    };
    questionBank.push(q);
    saveBank(questionBank);
    // 通知所有人题库数量
    io.emit('questionBankUpdated', { count: questionBank.length });
    io.to(socket.id).emit('addOfflineQuestionOK', { ok: true, id: q.id });
  });

  // --- 老师：在线出题（保留原功能） ---
  socket.on('submitquestion', (data) => {
    const { room, question, answer, timeLimit, questionType } = data || {};
    if (!room || !questionType) return;
    const r = room.trim().toUpperCase();
    const state = getRoom(r);
    state.currentQ = {
      answer: String(answer ?? ''),
      questionType,
      timeLimit: Number(timeLimit) || 0,
      startAt: Date.now()
    };
    state.stats = { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] };
    io.to(r).emit('deliverquestion', {
      question, questionType, timeLimit: Number(timeLimit) || 0
    });
  });

  // --- 学生：在线作答（保留原功能） ---
  socket.on('answerquestion', (data) => {
    const { room, answer, username } = data || {};
    if (!room) return;
    const r = room.trim().toUpperCase();
    const state = getRoom(r);
    const user = (username || 'Anonymous').trim();

    const cq = state.currentQ;
    let isCorrect = false, elapsed = null;
    if (cq) {
      isCorrect = String(answer) === String(cq.answer);
      if (cq.startAt) elapsed = Date.now() - cq.startAt;
    }

    const pts = scoreOnline(isCorrect, elapsed, cq ? cq.timeLimit : 0);
    const rec = state.scores.get(user) || { score:0, correctCount:0, totalTime:0, answers:0 };
    rec.score += pts;
    rec.answers += 1;
    if (isCorrect) rec.correctCount += 1;
    if (elapsed != null) rec.totalTime += Math.max(0, Math.floor(elapsed/1000));
    state.scores.set(user, rec);

    if (isCorrect) {
      state.stats.correct += 1;
      if (!state.stats.usersCorrect.includes(user)) state.stats.usersCorrect.push(user);
    } else {
      state.stats.incorrect += 1;
      if (!state.stats.usersIncorrect.includes(user)) state.stats.usersIncorrect.push(user);
    }

    const total = state.stats.correct + state.stats.incorrect;
    const pct = total ? (state.stats.correct / total) * 100 : 0;

    io.to(r).emit('deliverData', {
      totalAnswers: total,
      correctAnswers: state.stats.correct,
      incorrectAnswers: state.stats.incorrect,
      incorrectUsers: state.stats.usersIncorrect,
      correctUsers: state.stats.usersCorrect,
      percentage: pct
    });

    io.to(socket.id).emit('resultquestion', {
      correct: isCorrect, answer: cq ? cq.answer : '', username: user
    });

    io.to(r).emit('leaderboard', computeLeaderboard(state.scores));
  });

  // ---------- 练习模式（学生 ⇄ 题库） ----------
  // 学生请求下一题（本轮不重复；每轮 10 题）
  socket.on('practiceNext', (data) => {
    const { room, username } = data || {};
    if (!room || !username) return;
    const r = room.trim().toUpperCase();
    const user = username.trim();
    const state = getRoom(r);

    // 初始化此学生本轮状态
    const st = state.practice.get(user) || { asked:new Set(), answered:0, correct:0 };
    state.practice.set(user, st);

    if (st.answered >= 10) {
      io.to(socket.id).emit('practiceDone', {
        answered: st.answered, correct: st.correct,
        accuracy: st.answered ? st.correct / st.answered : 0
      });
      return;
    }

    // 在题库中挑未出过的
    const remaining = questionBank.filter(q => !st.asked.has(q.id));
    if (remaining.length === 0) {
      io.to(socket.id).emit('practiceNoMore', { need: 10 - st.answered });
      return;
    }
    const q = remaining[Math.floor(Math.random() * remaining.length)];
    // 标记已抽
    st.asked.add(q.id);

    io.to(socket.id).emit('practiceQuestion', {
      id: q.id, questionType: q.questionType, question: q.question
    });
  });

  // 学生提交练习题答案
  socket.on('practiceAnswer', (data) => {
    const { room, username, questionId, answer } = data || {};
    if (!room || !username || !questionId) return;
    const r = room.trim().toUpperCase();
    const user = username.trim();
    const state = getRoom(r);
    const st = state.practice.get(user) || { asked:new Set(), answered:0, correct:0 };
    state.practice.set(user, st);

    const q = questionBank.find(x => x.id === questionId);
    if (!q) {
      io.to(socket.id).emit('practiceFeedback', { ok:false, msg:'Question not found' });
      return;
    }

    const isCorrect = String(answer).trim() === String(q.answer).trim();
    st.answered += 1;
    if (isCorrect) st.correct += 1;

    // 如果 10 题结束，结算分数并清空轮状态
    if (st.answered >= 10) {
      const acc = st.correct / st.answered;
      const pts = scorePractice(acc);
      const rec = state.scores.get(user) || { score:0, correctCount:0, totalTime:0, answers:0 };
      rec.score += pts;
      rec.correctCount += st.correct;
      rec.answers += st.answered;
      state.scores.set(user, rec);

      io.to(socket.id).emit('practiceRoundDone', {
        answered: st.answered, correct: st.correct, accuracy: acc, pointsAdded: pts
      });
      io.to(r).emit('leaderboard', computeLeaderboard(state.scores));

      // 开新轮：清空已答/已抽
      state.practice.set(user, { asked:new Set(), answered:0, correct:0 });
    } else {
      io.to(socket.id).emit('practiceFeedback', {
        ok:true, correct:isCorrect, correctAnswer:q.answer,
        progress: { answered: st.answered, correct: st.correct }
      });
    }
  });

  socket.on('disconnect', () => { joined.clear(); });
});

const server = http.listen(PORT, () => {
  console.log('listening on *:' + PORT);
});
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Try: set PORT=${Number(PORT)+1} && npm start`);
    process.exit(1);
  }
});
