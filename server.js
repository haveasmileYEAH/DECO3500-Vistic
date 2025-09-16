/**
 * StAuth10065: I Matthew Martin, 000338807 certify that this material is my original work. No other person's work has been used without due acknowledgement. 
 * I have not made my work available to anyone else.
 */
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');

// 提供静态资源 /public
app.use(express.static(path.join(__dirname, 'public')));

let correctAnswers = 0;
let incorrectAnswers = 0;
let usersCorrect = [];
let usersIncorrect = [];
let totalAnswers = 0;

// 页面路由
app.get('/teacher', function(req, res){
  res.sendFile(path.join(__dirname, 'teacher.html'));
});
app.get('/student', function(req, res){
  res.sendFile(path.join(__dirname, 'student.html'));
});

// 当前题目的标准答案
let correctanswer = "";

io.on('connection', function(socket){

  // 老师提交新题
  socket.on('submitquestion', function(quesdata){
    console.log("question submitted:", JSON.stringify(quesdata));
    // 新题重置统计
    correctAnswers = 0;
    incorrectAnswers = 0;
    usersCorrect = [];
    usersIncorrect = [];
    totalAnswers = 0;

    correctanswer = quesdata.answer;

    // 广播题目给所有人（除了当前连接）
    socket.broadcast.emit('deliverquestion', {
      question: quesdata.question,
      questionType: quesdata.questionType,
      timeLimit: quesdata.timeLimit
    });
  });

  // 学生作答
  socket.on('answerquestion', function(answerdata) {
    if(answerdata.answer == correctanswer){
      correctAnswers++;
      usersCorrect.push(answerdata.username);
    } else {
      incorrectAnswers++;
      usersIncorrect.push(answerdata.username);
    }

    totalAnswers = correctAnswers + incorrectAnswers;
    const percentage = totalAnswers ? (correctAnswers / totalAnswers) * 100 : 0;

    // 汇总发给除了作答者之外的所有连接（老师页会监听显示）
    socket.broadcast.emit("deliverData", {
      totalAnswers,
      correctAnswers,
      incorrectAnswers,
      incorrectUsers: usersIncorrect,
      correctUsers: usersCorrect,
      percentage
    });

    // 单独把对错结果回给该学生
    io.to(socket.id).emit("resultquestion", {
      correct: (correctanswer == answerdata.answer),
      answer: correctanswer,
      username: answerdata.username
    });
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});
