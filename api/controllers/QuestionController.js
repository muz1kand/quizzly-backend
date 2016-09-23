
/**
 * QuestionController
 *
 * @description :: Server-side logic for managing Questions
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var UrbanAirshipPush = require('urban-airship-push');
var Pusher = require('pusher');
 // Your app access configuration. You will find this stuff in your App
 // Settings under App Key, App Secret and App Master Secret.
 var config = {
/*     key: 'UWBj9II1Tc-GBn4aioUHUw',
     secret: 'q4q2I2DNQw2URglIRPkC-Q',
     masterSecret: 'mL0uDhSPThSrfQyGp4kw0w'*/
    key: 'RpquxajkQKeLnupkBrvWtw',
    secret: 'O8p2HuxVQBOrYaTersE5CA',
    masterSecret: 'Lcay6AUkQXapKaztfYSJGw'
 };

 // Create a push object
 var urbanAirshipPush = new UrbanAirshipPush(config);
 var Promise = require('bluebird');

module.exports = {
   destroyQuestionsByIds: function(req, res) {
     var data = req.params.all();
     Question.destroy({id: data.ids}).exec(function(err, questions) {
       res.json(questions);
     });
   },

  /**
   * `QuestionController.getQuestionsByCourseId()`
   */
  getQuestionsByCourseId: function (req, res) {
    sails.log.debug("--------------getQuestionsByCourseId");
    var data = req.params.all();

    var questions = [];

    Quiz.find({course: data.id}).exec(function (err, quizzes) {
      // sails.log.debug("quizzes: ", quizzes);
      Promise.each(quizzes, function(quiz) {
        // sails.log.debug("quiz: ", quiz);
        return Question.find({quiz: quiz.id}).then(function (quiz_questions) {
          // sails.log.debug("quiz_questions: ", quiz_questions);
          return quiz_questions;
        }).then(function(quiz_questions) {
          return Promise.each(quiz_questions, function(question) {
            // sails.log.debug("question: ", question);
            questions.push(question);
          });
        });
      }).then(function() {
        sails.log.debug("finished!", questions.length);
        // sails.log.debug("finished!", questions);
        return res.json(questions);
      });
    });
  },

  // This route is used by professors to as questions params: (questionId as question, sectionId as section)
  ask: function(req, res) {
    sails.log.debug('Asking a question');
    var data = req.params.all();
    var questionId = data.question;
    var sectionId = data.section;

    if(!questionId || !sectionId) { return res.status(400).send('Bad Request!'); }

    // Find the question and section and make sure they exists
    return Promise.all([
      Question.findOne({id: questionId}).populate('answers'),
      Section.findOne({id: sectionId})
    ]).spread(function(question, section){
      sails.log.debug('question', question);
      sails.log.debug('section', section);
      if(!question || ! section) { return res.status(400).send('Bad Request!'); }
      var key = OpenQuestions.add(question);
      sails.sockets.broadcast('section-'+section.id, 'question', {
        question: question,
        answerKey: key
      });
      return res.json({answerKey: key, question: question});
    });
  },

  //Two parameters, question_id and section_id
  //Asks users in the specified section the question
  askWithSection: function(req, res) {
    var data = req.params.all();

    var question_id = data.question;
    var section_id = data.section;

    sails.log.debug("question id " + question_id);
    sails.log.debug("section id " + section_id);

    var pusher = new Pusher({
      appId: '198096',
      key: '638c5913fb91435e1b42',
      secret: 'bb4f3412beab5121f288',
      encrypted: true
    });

    sails.log.debug(">>>>>>>>>pusher is triggered", data.question);

    pusher.trigger('test_channel', 'my_event', {
      "questionId": data.question,
      "sectionId": data.section
    });

    Section.findOne({id: section_id}).populate('students').exec(function(err, section) {
      if(err) {
        return res.json({error: res.negotiate(err)})
      }
      if(!section) {
        return res.json({error: 'Section not found'});
      }
      var ios_channels = [];
      var android_channels = [];

      section.students.forEach(function(student) {
        if(student.deviceType != null && student.channelID != null) {
          if(student.deviceType == "ios") {
            ios_channels.push(student.channelID);
          }
          else if(student.deviceType == "android"){
            android_channels.push(student.channelID);
          }
        }
      });

      Question
      .findOne({id: question_id})
      .populate('answers')
      .exec(function (err, question) {
        if(err) {
          return res.json({error: res.negotiate(err)})
        }
        if(!question) {
          return res.json({error: 'Question not found'});
        }

        var android_push = {
          "audience": {
            android_channel: android_channels
          },
          "notification": {
             "alert": "Question Available",
             "android": {
               "extra": {
                 "question": question.text,
                 "quiz_id": question.quiz,
                 "quest_id": question.id,
                 "type": question.type,
                 "time_limit": question.duration,
                 "num_answers": question.answers.length
               }
             }
          },
          "device_types": "all"
        };

        var ios_push = {
          "audience": {
            "ios_channel": ios_channels
          },
          "notification": {
             "alert": "Question Available",
             "ios": {
               "extra": {
                 "question": question.text,
                 "quiz_id": question.quiz,
                 "quest_id": question.id,
                 "type": question.type,
                 "time_limit": question.duration,
                 "num_answers": question.answers.length
               }
             }
          },
          "device_types": "all"
        };

        for(var i = 0; i < question.answers.length; i++) {
          android_push.notification.android.extra["answer" + i] = question.answers[i].text;
          ios_push.notification.ios.extra["answer" + i] = question.answers[i].text;
        }

        if(ios_channels.length == 0 && android_channels.length == 0) {
          return res.json({error: "There are no devices for that section"});
        }

        ios_fail = false;
        android_fail = false;
        async.series([
          function(callback) {
            if(android_channels.length != 0) {
              urbanAirshipPush.push.send(android_push, function(android_err, android_data) {
                if(android_err) {
                  sails.log.debug("android error!");
                  android_fail = true
                }
                else {
                  sails.log.debug("android success!");
                }
              });
            }

            callback();
          },

          function(callback) {
            if(ios_channels.length != 0) {
              urbanAirshipPush.push.send(ios_push, function(ios_err, ios_data) {
                if(ios_err) {
                  sails.log.debug("ios error!");
                  ios_fail = true;
                } else {
                  sails.log.debug("ios success!");
                }
              });
            }

            callback();
          }
        ], function(err) {
          if(!ios_fail && !android_fail) {
            return res.json({
              ios: "success",
              android: "success"
            });
          } else if(ios_fail && !android_fail) {
            return res.json({
              ios: "fail",
              android: "success"
            });
          } else if(!ios_fail && android_fail) {
            return res.json({
              ios: "success",
              android: "fail"
            });
          } else {
            return res.json({
              ios: "fail",
              android: "fail"
            });
          }
        });
      });
    });
  },

  // This route is used by students to answer questions parameters(answerKey, answerId as answer)
  // note: the 'answerKey' maps to the question being answered.
  answer: function(req, res) {
    var data = req.params.all();
    var answerKey = data.answerKey;
    var answerId = data.answer;
    var student = req.user;

    if(!answerKey || !answerId || !student) { return res.status(400).send('Bad Request'); }

    var question = OpenQuestions.get(answerKey);

    if(!question) { return res.status(401).send('Invalid Answer Key'); }


    var data = {
      student: student.id,
      question: question.id,
      answer: answerId
    };

    StudentAnswer.create(data).exec(function(err, studentAnswer){
      if(err || !studentAnswer) { return res.status(400).send('something went wrong.'); }
      return res.json(studentAnswer);
    });
  },

  //Returns the question text and the ID of the answer that the user selected
  //Used for Android stats page
  getQuestionAndUserAnswer: function(req, res) {
    var data = req.params.all();

    Question.findOne({id: data.question}).populate('answers').exec(function(err, q) {

      var correct_answer = "";
      q.answers.forEach(function(a) {
        if(a.correct == true) {
          correct_answer = a.option;
        }
      });

      Student.findOne({email: data.student}).exec(function(err, s) {
        StudentAnswer.findOne({student: s.id, question: data.question}).populate('answer').exec(function(err, studentanswer) {
          if(!studentanswer) {
            return res.send(200, []);
          }
          questionWithStudentAnswer = {};

          questionWithStudentAnswer.question = q.text;
          questionWithStudentAnswer.student_answer = studentanswer.answer.option;
          questionWithStudentAnswer.correct_answer = correct_answer;

          return res.send(200, questionWithStudentAnswer);
        });
      });
    });
  },

  //Returns all the answers for that question
  //Used for Android stats page
  getQuestionAnswers: function(req,res) {
    var data = req.params.all();
    Question.findOne({id: data.question}).populate('answers').exec(function(err, q) {
      if(q.answers.length != 0) {
        return res.send(200, q.answers);
      }
      return res.json({
        error: "No answers for that question"
      });
    });
  },

  getJsonQuestionAndUserAnswers: function(req, res) {
    var data = req.params.all();
    Question.findOne({id: data.question}).populate('answers').exec(function(err, q) {
      Student.findOne({email: data.student}).exec(function(err, s) {
        StudentAnswer.findOne({student: s.id, question: data.question}).populate('answer').exec(function(err, sa) {
          return res.json({
            question: q.text,
            answers: q.answers,
            user_answer: sa
          });
        });
      });
    });
  },

  //Used by iOS and Android to answer free response questions
  answerFreeResponse: function(req, res) {
    sails.log.debug("Question ID: " + req.param('quest_id'));
    sails.log.debug("Quiz ID: " + req.param('quiz_id'));
    sails.log.debug("User Email: " + req.param('user_email'));
    sails.log.debug("Answer: " + req.param('answer'));

    Student.findOne({email : req.param('user_email')}).exec(function(err, student) {
      var data = {
        student: student.id,
        question: req.param('quest_id'),
        text: req.param('answer'),
        quiz: req.param('quiz_id')
      };
      StudentAnswer.create(data).exec(function(err, studentanswer) {
        if(err) {
          return res.json({
            error: "answer not created"
          });
        }

        return res.send(200, studentanswer);
      });
    });
  }
};
