var crypto = require('crypto');
var fs = require('fs');
var mkdirp = require('mkdirp');
var path = require('path');
var url = require('url');
var _ = require('underscore');

var config = require(__dirname + '/../../../config');
var logger = require(__dirname + '/../log');

var cacheEncoding = 'utf8';
var options = {};

var dir = config.caching.directory;

// create cache directory if it doesn't exist
mkdirp(dir, {}, function (err, made) {
    if (err) {
        console.log('[CACHE] ' + err);
        logger.prod('[CACHE] ' + err);
    }

    if (made) {
        logger.prod('[CACHE] Created cache directory ' + made);
    }
});

function cachingEnabled(endpoints, requestUrl) {

    var endpointKey = _.find(_.keys(endpoints), function (k){ return k.indexOf(requestUrl) > -1; });

    if (!endpointKey) return false;

    if (endpoints[endpointKey].page && endpoints[endpointKey].page.settings) {
        options = endpoints[endpointKey].page.settings;
    }

    return (config.caching.enabled && options.cache);
}

module.exports = function (server) {

    server.app.use(function (req, res, next) {

        if (!cachingEnabled(server.components, req.url)) return next();

        // only cache GET requests
        if (!(req.method && req.method.toLowerCase() === 'get')) return next();

        // allow query string param to bypass cache
        var query = url.parse(req.url, true).query;
        var noCache = query.cache && query.cache.toString().toLowerCase() === 'false';

        if (noCache) return next();

        // we build the filename with a hashed hex string so we can be unique
        // and avoid using file system reserved characters in the name
        var filename = crypto.createHash('sha1').update(req.url).digest('hex');
        var cachepath = path.join(dir, filename + '.' + config.caching.extension);

        fs.stat(cachepath, function (err, stats) {

            if (err) {
                if (err.code === 'ENOENT') {
                    return cacheResponse();
                }
                return next(err);
            }

            // check if ttl has elapsed
            var ttl = options.ttl || config.caching.ttl;
            var lastMod = stats && stats.mtime && stats.mtime.valueOf();

            if (!(lastMod && (Date.now() - lastMod) / 1000 <= ttl)) return cacheResponse();

            fs.readFile(cachepath, {encoding: cacheEncoding}, function (err, resBody) {
                if (err) return next(err);

                // there are only two possible types javascript or json
                //var dataType = query.callback ? 'text/javascript' : 'application/json';
                var dataType = 'text/html';

                res.statusCode = 200;
                res.setHeader('content-type', dataType);
                res.setHeader('content-length', Buffer.byteLength(resBody));

                res.end(resBody);
            });
        });

        function cacheResponse() {

            // file is expired or does not exist, wrap res.end and res.write to save to cache
            var _end = res.end;
            var _write = res.write;

            var data = '';

            res.write = function (chunk) {
                // with this line, we get cache files with duplicate content
                //if (chunk) data += chunk;
                _write.apply(res, arguments);
            };

            res.end = function (chunk) {
                // respond before attempting to cache
                _end.apply(res, arguments);

                if (chunk) data += chunk;

                // if response is not 200 don't cache
                if (res.statusCode !== 200) return;

                // TODO: do we need to grab a lock here?
                fs.writeFile(cachepath, data, {encoding: cacheEncoding}, function (err) {
                    if (err) logger.prod(err.toString());
                });
            };
            return next();
        }
    });
};
