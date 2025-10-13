// server.js
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const PERMANENT_ROOM_CODE = (process.env.PERM_ROOM || 'LEARN01').trim().toUpperCase();

// 静态资源：public 下的 /css 与 /js 会自动启用（/css/..., /js/...）
app.use(express.static(path.join(__dirname, 'public')));

// HTML 页面
app.get('/player1', (req, res) => res.sendFile(path.join(__dirname, 'player1.html')));
app.get('/player2', (req, res) => res.sendFile(path.join(__dirname, 'player2.html')));
app.get('/display',  (req, res) => res.sendFile(path.join(__dirname, 'display.html')));
app.get('/audience', (req, res) => res.sendFile(path.join(__dirname, 'audience.html')));

// 旧路径重定向
app.get('/teacher', (req, res) => res.redirect(302, '/player1'));
app.get('/student', (req, res) => res.redirect(302, '/player2'));

// 向前端注入 Supabase 环境变量（仅 display/audience 用）
app.get('/env.js', (req, res) => {
  const url  = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
  res.type('application/javascript').send(
    `window.SUPABASE_URL=${JSON.stringify(url)};window.SUPABASE_ANON_KEY=${JSON.stringify(anon)};`
  );
});

// 简易 CSV 导出（仅当配置了 SERVICE_ROLE_KEY 且建好表时可用）
app.get('/api/export', async (req, res) => {
  try {
    const code = (req.query.code || '').toString().trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'code required' });
    const { createClient } = await import('@supabase/supabase-js');
    const adminSb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SERVICE_ROLE_KEY
    );
    const [r1, r2, r3, r4] = await Promise.all([
      adminSb.from('rounds').select('*').eq('code', code),
      adminSb.from('votes').select('*').eq('round_code', code),
      adminSb.from('messages').select('*').eq('round_code', code),
      adminSb.from('decisions').select('*').eq('round_code', code),
    ]);
    const rows = [
      ['type','timestamp','payload'],
      ...((r1.data||[]).map(x=>['round', x.created_at, JSON.stringify(x)])),
      ...((r2.data||[]).map(x=>['vote', x.created_at, JSON.stringify(x)])),
      ...((r3.data||[]).map(x=>['message', x.created_at, JSON.stringify(x)])),
      ...((r4.data||[]).map(x=>['decision', x.submitted_at, JSON.stringify(x)])),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${code}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'export failed' });
  }
});


// ----------------- 课堂/玩家逻辑 -----------------

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
let questionBank = loadBank();

const rooms = new Map();
function getRoom(r) {
  if (!rooms.has(r)) {
    rooms.set(r, {
      scores: new Map(),
      currentQ: null,
      stats: { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] },
      practice: new Map(),
      answeredUsers: new Set() // 追踪已答题用户
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
function scoreOnline(isCorrect, elapsedMs, timeLimitSec) {
  if (!isCorrect) return 0;
  const base = 100;
  if (!timeLimitSec || elapsedMs == null) return base;
  const total = Math.max(1, timeLimitSec * 1000);
  const left = Math.max(0, total - elapsedMs);
  const bonus = Math.floor((left / total) * 50);
  return base + bonus;
}
function scorePractice(roundAcc) { return Math.round(roundAcc * 100); }

io.on('connection', (socket) => {
  socket.on('join', (room) => {
    if (!room) return;
    const r = room.trim().toUpperCase();
    socket.join(r);
    const state = getRoom(r);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
    io.to(socket.id).emit('questionBankUpdated', { count: questionBank.length });
  });

  socket.on('getLeaderboard', (room) => {
    const r = (room||'').trim().toUpperCase();
    if (!r) return;
    const state = getRoom(r);
    io.to(socket.id).emit('leaderboard', computeLeaderboard(state.scores));
  });

  socket.on('getQuestionBankCount', () => {
    io.to(socket.id).emit('questionBankUpdated', { count: questionBank.length });
  });

  socket.on('getPermanentRoomInfo', () => {
    io.to(socket.id).emit('permanentRoomInfo', { code: PERMANENT_ROOM_CODE });
  });

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
    io.emit('questionBankUpdated', { count: questionBank.length });
    io.to(socket.id).emit('addOfflineQuestionOK', { ok: true, id: q.id });
  });

  socket.on('getQuestionBank', () => {
    io.to(socket.id).emit('questionBankList', questionBank);
  });

  socket.on('deleteQuestion', ({ id }) => {
    if (!id) return;
    questionBank = questionBank.filter(q => q.id !== id);
    saveBank(questionBank);
    io.emit('questionBankUpdated', { count: questionBank.length });
    io.to(socket.id).emit('deleteQuestionOK', { ok:true, id });
    io.to(socket.id).emit('questionBankList', questionBank);
  });

  socket.on('deleteQuestions', ({ ids }) => {
    if (!Array.isArray(ids) || ids.length === 0) return;
    const idset = new Set(ids);
    questionBank = questionBank.filter(q => !idset.has(q.id));
    saveBank(questionBank);
    io.emit('questionBankUpdated', { count: questionBank.length });
    io.to(socket.id).emit('deleteQuestionsOK', { ok:true, removed: ids.length });
    io.to(socket.id).emit('questionBankList', questionBank);
  });

  socket.on('submitquestion', (data) => {
    const { room, question, answer, timeLimit, questionType, qNumber, qTotal } = data || {};
    if (!room || !questionType) return;
    const r = room.trim().toUpperCase();
    const state = getRoom(r);
    state.currentQ = {
      answer: String(answer ?? ''),
      questionType,
      timeLimit: Number(timeLimit) || 0,
      startAt: Date.now(),
      qNumber: qNumber || null,
      qTotal: qTotal || null
    };
    state.stats = { correct: 0, incorrect: 0, usersCorrect: [], usersIncorrect: [] };
    state.answeredUsers = new Set(); // 重置已答题用户
    
    io.to(r).emit('deliverquestion', {
      question, 
      questionType, 
      timeLimit: Number(timeLimit) || 0,
      qNumber: qNumber || null,
      qTotal: qTotal || null
    });
  });

  socket.on('answerquestion', (data) => {
    const { room, answer, username } = data || {};
    if (!room) return;
    const r = room.trim().toUpperCase();
    const state = getRoom(r);
    const user = (username || 'Anonymous').trim();

    const ansClean = (answer == null) ? "" : String(answer).trim();
    if (!ansClean) {
      io.to(socket.id).emit('resultquestion', {
        correct: false, blank: true, message: 'No answer submitted',
        answer: state.currentQ ? state.currentQ.answer : '', username: user
      });
      return;
    }

    // 检查是否已经答过题
    if (state.answeredUsers.has(user)) {
      io.to(socket.id).emit('resultquestion', {
        correct: false, 
        blank: false, 
        message: 'You have already answered this question',
        answer: state.currentQ ? state.currentQ.answer : '', 
        username: user
      });
      return;
    }

    const cq = state.currentQ;
    let isCorrect = false, elapsed = null;
    if (cq) {
      isCorrect = String(ansClean) === String(cq.answer);
      if (cq.startAt) elapsed = Date.now() - cq.startAt;
    }

    const pts = scoreOnline(isCorrect, elapsed, cq ? cq.timeLimit : 0);
    const rec = state.scores.get(user) || { score:0, correctCount:0, totalTime:0, answers:0 };
    rec.score += pts;
    rec.answers += 1;
    if (isCorrect) rec.correctCount += 1;
    if (elapsed != null) rec.totalTime += Math.max(0, Math.floor(elapsed/1000));
    state.scores.set(user, rec);

    // 标记该用户已答题
    state.answeredUsers.add(user);

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

    // 通知房间内的 Player1 有玩家提交了答案（用于自动跳转）
    io.to(r).emit('playerAnswered', {
      username: user,
      totalAnswered: state.answeredUsers.size
    });
  });

  // 新增：测验完成事件
  socket.on('quizComplete', (data) => {
    const { room, categoryName, totalQuestions } = data || {};
    if (!room) return;
    const r = room.trim().toUpperCase();
    const state = getRoom(r);
    
    // 广播测验完成事件给房间内所有人
    io.to(r).emit('quizCompleted', {
      categoryName: categoryName || 'Unknown',
      totalQuestions: totalQuestions || 0,
      leaderboard: computeLeaderboard(state.scores)
    });
  });

  socket.on('practiceNext', (data) => {
    const { room, username } = data || {};
    if (!room || !username) return;
    const r = room.trim().toUpperCase();
    const user = username.trim();
    const state = getRoom(r);

    const st = state.practice.get(user) || { asked:new Set(), answered:0, correct:0 };
    state.practice.set(user, st);

    if (st.answered >= 10) {
      io.to(socket.id).emit('practiceDone', {
        answered: st.answered, correct: st.correct,
        accuracy: st.answered ? st.correct / st.answered : 0
      });
      return;
    }

    const remaining = questionBank.filter(q => !st.asked.has(q.id));
    if (remaining.length === 0) {
      io.to(socket.id).emit('practiceNoMore', { need: 10 - st.answered });
      return;
    }
    const q = remaining[Math.floor(Math.random() * remaining.length)];
    st.asked.add(q.id);

    io.to(socket.id).emit('practiceQuestion', {
      id: q.id, questionType: q.questionType, question: q.question
    });
  });

  socket.on('practiceAnswer', (data) => {
    const { room, username, questionId, answer } = data || {};
    if (!room || !username || !questionId) return;
    const r = room.trim().toUpperCase();
    const user = username.trim();
    const state = getRoom(r);
    const st = state.practice.get(user) || { asked:new Set(), answered:0, correct:0 };
    state.practice.set(user, st);

    const ansClean = (answer == null) ? "" : String(answer).trim();
    if (!ansClean) {
      io.to(socket.id).emit('practiceFeedback', { ok:false, msg:'Please answer before submitting.' });
      return;
    }

    const q = questionBank.find(x => x.id === questionId);
    if (!q) {
      io.to(socket.id).emit('practiceFeedback', { ok:false, msg:'Question not found' });
      return;
    }

    const isCorrect = String(ansClean) === String(q.answer).trim();
    st.answered += 1;
    if (isCorrect) st.correct += 1;

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

      state.practice.set(user, { asked:new Set(), answered:0, correct:0 });
    } else {
      io.to(socket.id).emit('practiceFeedback', {
        ok:true, correct:isCorrect, correctAnswer:q.answer,
        progress: { answered: st.answered, correct: st.correct }
      });
    }
  });
});

http.listen(PORT, () => {
  console.log('listening on *:' + PORT);
  console.log('Permanent practice room code:', PERMANENT_ROOM_CODE);
});