var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var _ = require('underscore');

var token = require(__dirname + '/auth/token');

var self = this;

// helper that sends json response
module.exports.sendBackJSON = function (successCode, res, next) {
    return function (err, results) {
        if (err) return next(err);

        res.statusCode = successCode;

        var resBody = JSON.stringify(results);
        res.setHeader('content-type', 'application/json');
        res.setHeader('content-length', resBody.length);
        res.end(resBody);
    }
}

module.exports.sendBackJSONP = function (callbackName, res, next) {
    return function (err, results) {

        // callback MUST be made up of letters only
        if (!callbackName.match(/^[a-zA-Z]+$/)) return res.send(400);

        res.statusCode = 200;

        var resBody = JSON.stringify(results);
        resBody = callbackName + '(' + resBody + ');';
        res.setHeader('content-type', 'text/javascript');
        res.setHeader('content-length', resBody.length);
        res.end(resBody);
    }
}

// helper that sends html response
module.exports.sendBackHTML = function (successCode, res, next) {
    return function (err, results) {
        if (err) return next(err);

        res.statusCode = successCode;

        var resBody = results;
        res.setHeader('content-type', 'text/html');
        res.setHeader('content-length', resBody.length);

        res.end(resBody);
    }
}

module.exports.getData = function(query, options, done) {

    // TODO allow non-Serama endpoints

    var headers = { 'Authorization': 'Bearer ' + token.authToken.accessToken }

    var defaults = {
        path: '/' + query,
        method: 'GET',
        headers: headers
    };

    options = _.extend(defaults, options);

    req = http.request(options, function(res) {
      
      var output = '';

      res.on('data', function(chunk) {
        output += chunk;
      });

      res.on('end', function() {
        done(output);
      });

      req.on('error', function(err) {
        console.log('Error: ' + err);
      });
    });

    req.end();
};


// function to wrap try - catch for JSON.parse to mitigate pref losses
module.exports.parseQuery = function (queryStr) {
    var ret;
    try {
        // strip leading zeroes from querystring before attempting to parse
        ret = JSON.parse(queryStr.replace(/\b0(\d+)/, "\$1"));
    }
    catch (e) {
        ret = {};
    }

    // handle case where queryStr is "null" or some other malicious string
    if (typeof ret !== 'object' || ret === null) ret = {};
    return ret;
}

/**
 * Recursively create directories.
 */
module.exports.mkdirParent =  function(dirPath, mode, callback) {
    if (fs.existsSync(path.resolve(dirPath))) return;

    fs.mkdir(dirPath, mode, function(error) {
        // When it fails because the parent doesn't exist, call it again
        if (error && error.errno === 34) {
          // Create all the parents recursively
          self.mkdirParent(path.dirname(dirPath), mode, callback);
          // And then finally the directory
          self.mkdirParent(dirPath, mode, callback);
        }

        // Manually run the callback
        callback && callback(error);
    });
};
