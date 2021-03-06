////////// Main client application logic //////////

//////
////// Utility functions
//////

var game = function() {
  var me = player();

  return me && me.game_id && Games.findOne(me.game_id);
};

var player = function() {
  return Players.findOne(playerId());
};

var playerId = function() {
  return Session.get('player_id');
};

var room = function() {
  var pathSplit = window.location.pathname.split('/');

  if (pathSplit.length >= 2 && pathSplit[1] != '') {
    return decodeURI(pathSplit[1]);
  }

  return '';
}

//////
////// lobby template: shows everyone not currently playing, and
////// offers a button to start a fresh game.
//////

Template.lobby.rendered = function() {
  if (player() && player().name) {
    $('#name-input').val(player().name);
  }
}

Template.lobby.disabled = function() {
  return !(player() && player().name.length > 0);
}

Template.lobby.show = function() {
  // only show lobby if we're not in a game
  return !game();
};

Template.lobby.room = function() {
  return room();
}

Template.lobby.waiting = function () {
  var players = Players.find({_id: {$ne: playerId()},
                              name: {$ne: ''},
                              room: room(),
                              idle: false,
                              game_id: {$exists: false}}).fetch();

  if (players.length > 0) {
    return players;
  } else {
    return null;
  }
};

Template.lobby.events({
  'keyup #name-input': function (evt) {
    var name = $('#name-input').val().trim();

    Players.update(playerId(), {$set: {name: name}});
  },

  'click #startgame': function() {
    Meteor.call('startNewGame', room());
  }
});

Template.ready.show = function() {
  var g = game();

  return g && g.state == 'active' && g.ready_clock > 0;
}

Template.ready.ready_clock = function() {
  var g = game();

  return g && g.ready_clock;
}

Template.ready.others = function() {
  var players = [],
      g = game(),
      myId = playerId();

  for (var i = 0, len = g.players.length; i < len; i++) {
    if (g.players[i]._id != myId) {
      players.push(g.players[i].name);
    }
  }

  return players;
};

Template.board.show = function() {
  var g = game();

  return g && g.state == 'active' && g.ready_clock == 0;
};

Template.board.letter = function() {
  var g = game();

  return g && g.letter;
};

Template.board.clock = function() {
  var g = game(),
      clock = g && g.clock,
      min = Math.floor(clock / 60),
      sec = clock % 60;
  if(clock < 11){
    $('#board').css("background-color", "red");
  }

  if (clock <= 0) {
    var answers = [];

    $('#answers').find('input').each(function() {
      answers.push($(this).val());
      $(this).attr('disabled', 'disabled');
    });

    Meteor.call('submitAnswers', playerId(), g._id, answers);

    return;
  }

  if (!clock) {
    return;
  }

  // format into M:SS
  return min + ':' + (sec < 10 ? ('0' + sec) : sec);
};

Template.board.categories = function() {
  var g = game();

  return g && g.categories;
};

Template.board.answers = function() {
  var result = [];

  for (var i = 0; i < 12; i++) {
    result.push(i);
  }
  return result;
};

Template.judgment.show = function() {
  var g = game();

  return g && g.state == 'judgment';
};

Template.judgment.waiting = function() {
  var g = game(),
      myId = playerId();

  for (var i = 0, len = g.judgments.length; i < len; i++) {
    if (g.judgments[i].player_id == myId) {
      return true;
    }
  }

  return false;
}

Template.judgment.players = function() {
  var g = game(),
      judged = {},
      playerIds = [],
      result = [];

  for (var i = 0, len = g.judgments.length; i < len; i++) {
    judged[g.judgments[i].player_id] = true;
  }

  for (var i = 0, len = g.players.length; i < len; i++) {
    if (!judged[g.players[i]._id]) {
      result.push(g.players[i].name);
    }
  }

  return result;
}

Template.judgment.categories = function() {
  var g = game(),
      categories = g.categories,
      submitted = g.submitted,
      duplicates = g.duplicates,
      result = [];

  for (var i = 0; i < 12; i++) {
    var answerSet = {},
        answers = [];

    for (var jj = 0, len = submitted.length; jj < len; jj++) {
      var answer = submitted[jj].answers[i].entry;

      answerSet[answer] = true;
    }

    for (var jj = 0, len = duplicates[i].length; jj < len; jj++) {
      answerSet[duplicates[i][jj]] = false;
    }

    for (var answer in answerSet) {
      if (answer != '') {
        answers.push({value: answer, isDuplicate: answerSet[answer] == false});
      }
    }

    result.push({
      name: categories[i],
      answers: answers,
      empty: answers.length == 0
    });
  }

  return result;
};

Template.judgment.letter = function() {
  var g = game();

  return g && g.letter;
};

Template.judgment.duplicateClass = function() {
  return this.isDuplicate ? 'duplicate' : '';
};

Template.judgment.events({
  'click .category-answer': function(evt) {
    var $target = $(evt.target);

    if (!$target.hasClass('duplicate')) {
      if ($target.hasClass('rejected')) {
        $target.removeClass('rejected');
      } else {
        $target.addClass('rejected');
      }
    }
  },

  'click #submit-judgment': function() {
    var rejected = [];

    $('.category').each(function() {
      var $self = $(this);

      var r = [];

      $self.find('.rejected').each(function() {
        r.push($self.text());
      });
      rejected.push(r);
    });

    Meteor.call('submitJudgment', playerId(), game()._id, rejected);
  }
});

Template.results.helpers({
  glyphicon: function(status) {
    if (status == 'accepted') {
      return 'glyphicon-ok';
    } else if (status == 'duplicate') {
      return 'glyphicon-asterisk'
    } else {
      return 'glyphicon-remove';
    }
  },

  format: function(entry) {
    if (entry == '') {
      return '(Empty)';
    }
    return entry;
  },

  style: function(entry) {
    if (entry == '') {
      return 'empty';
    }
  }
});

Template.results.show = function() {
  var g = game();

  return g && g.state == 'done';
};

Template.results.players = function() {
  var g = game(),
      players = {},
      result = [];

  for (var i = 0, len = g.submitted.length; i < len; i++) {
    var s = g.submitted[i];

    players[s.player_id] = s;
  }

  for (var i = 0, len = g.players.length; i < len; i++) {
    var p = g.players[i];

    players[p._id].name = p.name;
  }

  for (var key in players) {
    result.push(players[key]);
  }

  return result;
};

Template.results.events({
  'click #return-to-lobby': function() {
    Players.update(playerId(), {$unset: {game_id: ''}});
  }
});

//////
////// Game Initialization
//////

Meteor.startup(function() {
  FastClick.attach(document.body);

  var playerId = Players.insert({name: '',
                                 room: room(),
                                 idle: false,
                                 last_keepalive: (new Date()).getTime()});

  Session.set('player_id', playerId);

  Deps.autorun(function() {
    Meteor.subscribe('players', room());
    var me = player();

    if (me && me.game_id) {
      Meteor.subscribe('games', me.game_id);
    }
  });

  Meteor.setInterval(function() {
    if (Meteor.status().connected)
      Meteor.call('keepAlive', playerId);
  }, 5000);
});
