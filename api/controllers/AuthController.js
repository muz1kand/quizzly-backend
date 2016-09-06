/**
 * CourseController
 *
 * @description :: Server-side logic for managing Courses
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

var Promise = require('bluebird');
var password = require('password-hash-and-salt');

module.exports = {
  user: function(req, res) {
    sails.log.debug("req.session", req.session);
    if(req.session.user) {
      sails.log.debug("session is set");
      return res.json(req.session.user);
    } else {
      sails.log.debug("session isn't set");
    }
  },
  session: function(req, res) {
    sails.log.debug("Session::req.session", req.session);
    if(req.session.user) {
      sails.log.debug("session is set");
      return res.json(req.session.user);
    } else {
      sails.log.debug("redirect: session isn't set");
      // return res.redirect('/entrance');
      res.status(400).send('No session');
    }
  },
  login: function(req, res) {
    var data = req.params.all();

    Promise.all([
      Professor.find({email: data.email}),
      Student.find({email: data.email})
    ]).spread(function(professor, student){
      sails.log.debug("professor", professor);
      sails.log.debug("student", student);
      var user = {};
      if(professor.length > 0) {
        user = professor[0];
      } else if(student.length > 0) {
        user = student[0];
        if(data.channelID) {
          Student.update({channelID: data.channelID}, {channelID: null, deviceType: null})
          .then(function(updated) {
            return Student.update({email: data.email}, {channelID: data.channelID, deviceType: data.deviceType})
          })
          .then(function(updated) {
            sails.log.debug("Updated " + updated[0]);
          });
        }
      } else {
        res.status(400).send('That user was not found!');
      }

      // if(user.password == 'test') {
        delete user.password;
        res.json(user);
        return;
      // }

      password(data.password).verifyAgainst(user.password, function(error, verified) {
        if(error)
          throw new Error('Something went wrong!');
        if(!verified) {
          sails.log.debug("Don't try! We got you!");
          res.status(400).send('bad password!');
        } else {
          user.password = "";
          delete user.password;
          // req.session.user = user;
          // sails.log.debug("session is set: req.session", req.session);
          res.json(user);
        }
      });
    }).catch(function(){
      sails.log.debug("error is encountered");
    }).done(function(){
      sails.log.debug("promise call is done");
    });
  },
  signup: function(req, res) {
    var data = req.params.all();
    sails.log.debug(data);
    var UserType = {};
    if(data.isProfessor == 'true' || data.isProfessor == 'YES') {
      sails.log.debug("signed up professor");
      UserType = Professor;
    } else {
      sails.log.debug("signed up student");
      UserType = Student;
    }

    password(data.password).hash(function(error, hash) {
      if(error) {
        throw new Error('Something went wrong!');
      }

      // Store hash (incl. algorithm, iterations, and salt)
      var newUser = {
        email: data.email,
        password: hash,
        firstName: data.firstName,
        lastName: data.lastName,
      };
      UserType.create(newUser)
      .exec(function(err, user) {
        if(err) {
          res.status(400).send('That user already exists!');
        }
        sails.log.debug("signed up user", user);
        user.password = "";
        delete user.password;

        // req.session.user = user;
        // sails.log.debug("req.session", req.session);
        res.json(user);
      });
    });
  },
  logout: function(req, res) {
    // delete req.session.user;
    res.ok();
  }
};
