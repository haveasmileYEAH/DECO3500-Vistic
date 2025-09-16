// 连接 Socket.IO
var socket = io();

$(function() {
  $("#short").hide();
  $("#truefalse").hide();
  $("#gameSummary").hide();

  $("#shortAnswer").on("click", function() {
    $("#short").show();
    $("#truefalse").hide();
  });

  $("#trueFalse").on("click", function() {
    $("#truefalse").show();
    $("#short").hide();
  });

  $("#reset").on("click", function() {
    $("#gameSelection").show();
    $("#gameSummary").hide();
  });

  function startCountdown(seconds) {
    let remaining = Number(seconds) || 0;
    $("#reset").prop("disabled", true);
    $("#timer").text(remaining + "sec");
    var timer = setInterval(function() {
      remaining--;
      $("#timer").text(remaining > 0 ? (remaining + "sec") : "");
      if (remaining <= 0) {
        clearInterval(timer);
        $("#reset").prop("disabled", false);
      }
    }, 1000);
  }

  // 简答题提交
  $("#shortQuestion").on("submit", function() {
    $("#gameSelection").hide();
    $("#short").hide();
    $("#gameSummary").show();
    socket.emit("submitquestion", {
      question: $("#question").val(),
      answer: $("#answer").val(),
      timeLimit: $("#timeLimit").val(),
      questionType: "short"
    });
    startCountdown($("#timeLimit").val());
    return false;
  });

  // 判断题提交
  $("#trueFalseQuestion").on("submit", function() {
    $("#gameSelection").hide();
    $("#truefalse").hide();
    $("#gameSummary").show();
    const tfAns = $('input[name="tfanswer"]:checked').val();
    socket.emit("submitquestion", {
      question: $("#tfquestion").val(),
      answer: tfAns,
      timeLimit: $("#tftimeLimit").val(),
      questionType: "truefalse"
    });
    startCountdown($("#tftimeLimit").val());
    return false;
  });

  // 接收统计数据
  socket.on("deliverData", function(data) {
    $("#totalAnswers").text("Total Answers: " + (data.totalAnswers || 0));
    $("#correctAnswers").text("Correct Answers: " + (data.correctAnswers || 0));
    $("#incorrectAnswers").text("Incorrect Answers: " + (data.incorrectAnswers || 0));
    $("#correctUsers").text("Correct Users: " + (data.correctUsers || []).join(", "));
    $("#incorrectUsers").text("Incorrect Users: " + (data.incorrectUsers || []).join(", "));
    $("#correctAverage").text("Correct Answer Percentage: %" + Math.round(Number(data.percentage) || 0));
  });
});
