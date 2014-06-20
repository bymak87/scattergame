////////// Shared code (client and server) //////////

Players = new Meteor.Collection('players');
// {name: 'Joe', game_id: ...}

Games = new Meteor.Collection('games');
// {categories: [...], clock: 160}

newBoard = function() {
  var categorySet = {},
      numCategories = categories.length,
      count = 0,
      result = [];

  while (count < 12) {
    var index = Math.floor(Math.random() * numCategories),
        category = categories[index];

    if (!categorySet[category]) {
      categorySet[category] = true;
      count++;
    }
  }

  for (var category in categorySet) {
    result.push(category);
  }

  return result;
};

newLetter = function() {
  return diceLetters[Math.floor(Math.random() * 20)];
};

addAnswers = function(playerId, gameId, answers) {
  var normalizedAnswers = [];

  for (var i = 0; i < 12; i++) {
    normalizedAnswers.push({entry: answers[i].trim().toLowerCase()});
  }

  Games.update(
    gameId,
    { $push: { submitted: { player_id: playerId, answers: normalizedAnswers }}}
  );

  var game = Games.findOne(gameId);

  if (game.players.length == game.submitted.length) {
    var duplicateAnswers = computeDuplicateAnswers(game);

    Games.update(gameId, {$set: {state: 'judgment',
                                 duplicates: duplicateAnswers,
                                 judgment_start: (new Date()).getTime()}});
  }
};

addJudgment = function(playerId, gameId, rejected) {
  Games.update(
    gameId,
    { $push: { judgments: { player_id: playerId, rejected: rejected }}}
  );

  var game = Games.findOne(gameId);

  if (game.players.length == game.judgments.length) {
    var rejectedAnswers = computeRejectedAnswers(game),
        submitted = computeScores(game, rejectedAnswers);

    Games.update(gameId, {$set: {state: 'done', rejected: rejectedAnswers, submitted: submitted }});
  }
};

var computeDuplicateAnswers = function(game) {
  var submitted = game.submitted,
      result = [];

  for (var i = 0; i < 12; i++) {
    var answerSet = {},
        duplicates = [];

    for (var j = 0, len = submitted.length; j < len; j++) {
      var answer = submitted[j].answers[i].entry;

      if (answer.trim() == '') {
        continue;
      }

      if (answerSet[answer] == true) {
        answerSet[answer] = false;
      } else if (answerSet[answer] == null) {
        answerSet[answer] = true;
      }
    }

    for (var answer in answerSet) {
      if (answerSet[answer] == false) {
        duplicates.push(answer);
      }
    }

    result.push(duplicates);
  }

  return result;
};

var computeRejectedAnswers = function(game) {
  var threshold = Math.ceil(game.players.length / 2),
      result = [];

  for (var i = 0; i < 12; i++) {
    var counts = {},
        rejected = [];

    for (var j = 0, len = game.judgments.length; j < len; j++) {
      var judgment = game.judgments[j];

      for (var kk = 0, len2 = judgment.rejected[i].length; kk < len2; kk++) {
        var answer = judgment.rejected[i][kk];

        if (counts[answer] == null) {
          counts[answer] = 1;
        } else {
          counts[answer] = counts[answer] + 1;
        }
      }
    }

    for (var answer in counts) {
      if (counts[answer] >= threshold) {
        rejected.push(answer);
      }
    }

    result.push(rejected);
  }

  return result;
};

var computeScores = function(game, rejected_answers) {
  var submitted = game.submitted,
      duplicates = game.duplicates,
      numPlayers = game.submitted.length,
      categories = game.categories;

  for (var i = 0; i < 12; i++) {
    var rejectedSet = toSet(rejected_answers[i]),
        duplicateSet = toSet(duplicates[i]);

    for (var j = 0; j < numPlayers; j++) {
      var s = submitted[j],
          answer = s.answers[i];

      if (s.score == null) {
        s.score = 0;
      }

      answer.category = categories[i];

      if (answer.entry == '' || rejectedSet[answer.entry]) {
        answer.status = 'rejected';
      } else if (duplicateSet[answer.entry]) {
        answer.status = 'duplicate';
      } else {
        s.score++;
        answer.status = 'accepted';
      }
    }
  }

  return submitted;
};

forceJudgment = function(game) {
  if (game.players.length > game.submitted.length) {
    var missing = missingPlayers(game, game.submitted),
        emptyAnswers = [];

    for (var i = 0; i < 12; i++) {
      emptyAnswers.push('');
    }

    for (var i = 0, len = missing.length; i < len; i++) {
      addAnswers(missing[i], game._id, emptyAnswers);
    }
  }
};

forceResult = function(game) {
  if (game.players.length > game.judgments.length) {
    var missing = missingPlayers(game, game.judgments),
        emptyRejections = [];

    for (var i = 0; i < 12; i++) {
      emptyRejections.push('');
    }

    for (var i = 0, len = missing.length; i < len; i++) {
      addJudgment(missing[i], game._id, emptyRejections);
    }
  }
};

forcePlayer = function(game, playerId) {
  var submitted = false,
      judged = false;

  for (var i = 0, len = game.submitted.length; i < len; i++) {
    if (game.submitted[i].player_id == playerId) {
      submitted = true;
      break;
    }
  }

  if (!submitted) {
    var emptyAnswers = [];

    for (var i = 0; i < 12; i++) {
      emptyAnswers.push('');
    }

    addAnswers(playerId, game._id, emptyAnswers);
  }

  for (var i = 0, len = game.judgments.length; i < len; i++) {
    if (game.judgments[i].player_id == playerId) {
      judged = true;
      break;
    }
  }

  if (!judged) {
    var emptyRejections = [];

    for (var i = 0; i < 12; i++) {
      emptyRejections.push('');
    }

    addJudgment(playerId, game._id, emptyRejections);
  }
};

var missingPlayers = function(game, list) {
  var allPlayers = {},
      missingPlayers = [];

  for (var i = 0, len = game.players.length; i < len; i++) {
    allPlayers[game.players[i]._id] = true;
  }

  for (var i = 0, len = list.length; i < len; i++) {
    allPlayers[list[i].player_id] = false;
  }

  for (var playerId in allPlayers) {
    if (allPlayers[playerId]) {
      missingPlayers.push(playerId);
    }
  }

  return missingPlayers;
};

var toSet = function(list) {
  var set = {};

  for (var i = 0, len = list.length; i < len; i++) {
    set[list[i]] = true;
  }

  return set;
};

if (Meteor.isServer) {
  // publish single games
  Meteor.publish('games', function(gameId) {
    return Games.find({_id: gameId});
  });

  Meteor.publish('players', function(room) {
    return Players.find({room: room});
  });
}
