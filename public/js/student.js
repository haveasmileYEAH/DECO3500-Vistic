// 连接 Socket.IO
var socket = io();
var username = "";

$(function() {
  $("#shortAnswer").hide();
  $("#trueOrFalse").hide();

  // 简答题提交
  $("#shortanswers").on("submit", function() {
    var answer = $("#answer").val();
    socket.emit("answerquestion", { answer: answer, username: username });
    return false;
  });

  // 判断题提交
  $("#tfanswers").on("submit", function() {
    var answer = $('input[name="tfanswer"]:checked').val();
    socket.emit("answerquestion", { answer: answer, username: username });
    return false;
  });

  function showTimer(seconds) {
    var remaining = Number(seconds) || 0;
    $("#timer").text(remaining + "sec");
    var t = setInterval(function() {
      remaining--;
      $("#timer").text(remaining > 0 ? (remaining + "sec") : "");
      if (remaining <= 0) {
        clearInterval(t);
        $("#submitShort, #submitTF").prop("disabled", true);
        $("#greeting").show();
        $("#shortAnswer").hide();
        $("#trueOrFalse").hide();
      }
    }, 1000);
  }

  // 收到题目
  socket.on("deliverquestion", function(msg) {
    username = $("#username").val();
    $("#greeting").hide();
    $("#submitShort, #submitTF").prop("disabled", false);

    if (msg.questionType === "short") {
      $("#trueOrFalse").hide();
      $("#shortAnswer").show();
      $("#question").html(msg.question);
      showTimer(msg.timeLimit);
    } else if (msg.questionType === "truefalse") {
      $("#shortAnswer").hide();
      $("#trueOrFalse").show();
      $("#tfquestion").html(msg.question);
      showTimer(msg.timeLimit);
    }
  });

  // 收到判题结果（给学生自己）
  socket.on("resultquestion", function(msg) {
    if (msg.correct) {
      $("#result").text("Correct!");
    } else {
      $("#result").text("Incorrect!");
    }
    $("#answertext").text("Correct answer: " + msg.answer);
  });
});
