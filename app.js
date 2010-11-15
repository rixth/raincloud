var config = {
  raincloudHost: 'cl.ly',
  adminHost: 'my.cl.ly',
  s3: {
    host: 'raincloud.rixth.org.s3.amazonaws.com',
    bucket: 'raincloud.rixth.org',
    accessKey: 'AKIAIRLEVYXDRKB6ENOQ',
    secretKey: ''
  },
  mongo: {
    host: 'localhost',
    database: 'raincloud'
  }
}

/**
 * Module dependencies.
 */

var express = require('express'),
    app = module.exports = express.createServer(),
    mongoose = require('mongoose').Mongoose,
    db = mongoose.connect('mongodb://' + config.mongo.host + '/' + config.mongo.database),
    sys = require('sys'),
    sha1 = require('./sha1.js'),
    base64 = require('./base64.js');

mongoose.model('Item', {
  properties: ['key', 'name', 'type', 'views', 'remote_url', 'created_at', 'updated_at', 'uploaded'],
  cast: {
    views: Number,
    created_at: Date,
    updated_at: Date,
    uploaded: Number
  },
  indexes: ['key', 'type'],

  getters: {
    adminUrl: function () {
      return 'http://' + config.adminHost + '/items/' + this.key;
    },
    playerUrl: function () {
      return 'http://' + config.raincloudHost + '/' + this.key;
    },
    contentUrl: function () {
      return 'http://' + config.raincloudHost + '/' + this.key + '/content';
    },
    remoteUrl: function () {
      return this.remote_url;
    },
    icon: function () {
      return 'http://my.cl.ly/images/item_types/' + this.type + '.png'
    },
    jsonObject: function () {
      var returnObject = {
        'href': this.adminUrl,
        'name': this.name,
        'url': this.playerUrl,
        'item_type': this.type,
        'view_counter': this.views,
        'icon': this.icon,
        'created_at': this.created_at.toString(),
        'updated_at': this.updated_at.toString()
      }

      if (this.type === 'bookmark') {
        returnObject.redirect_url = this.remote_url;
      } else {
        returnObject.remote_url = this.remote_url;
        returnObject.content_url = this.contentUrl;
      }

      return returnObject;
    }
  },

  methods: {
    save: function (fn) {
      function rand(min, max) {
        return Math.round((Math.random() * (max - min)) + min);
      }

      function encode(number) {
        var result = '',
            characters = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".split('');
        while (number >= characters.length) {
          result = "" + characters[(number - (characters.length * Math.floor(number / characters.length)))] + result;
          number = Math.floor(number / characters.length);
        }
        return result;
      }

      var self = this;

      if (!this.type && this.name) {
        // get type from filename.
        if (this.name.match(/\.(jpg|png|gif|bmp|jpeg)$/i)) {
          this.type = 'image';
        } else {
          this.type = 'unknown';
        }
      }

      this.updated_at = new Date();
      if (this.isNew) {
        this.created_at = new Date();
        this.views = 0;

        if (this.type !== 'bookmark') {
          this.uploaded = 0;
        }

        (function () {
          var number = (Math.random() + '').replace(/^0\./, '').replace(/^0+/, ''),
              start = rand(0, number.length),
              length = rand(1, number.length - start - 1),
              key;

          number = parseInt(number.substr(start, length), 10) + 60;

          if (number > 0) {
            key = encode(number);
            db.model('Item').find({
              'key': key
            }).all(function (result) {
              if (!result || !result.length) {
                self.key = key;
                self.__super__(fn);
              } else {
                arguments.callee.call();
              }
            });
          } else {
            arguments.callee.call();
          }
        }());

      } else {
        this.__super__(fn);
      }
    }
  },
});

// Configuration
app.configure(function () {
  app.set('views', __dirname + '/views');
  app.use(express.bodyDecoder());
  app.use(express.methodOverride());
  app.use(express.compiler({
    src: __dirname + '/public',
    enable: ['less']
  }));
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
  app.use(express.logger());
});

app.configure('development', function () {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
});

app.configure('production', function () {
  app.use(express.errorHandler());
});

// Routes
app.get('/', function (req, res) {
  res.render('index.jade', {
    locals: {
      title: 'Express'
    }
  });
});

app.get('/items', function (req, res) {
  var search = {
    uploaded: 1
  };
  if (req.param('filter')) {
    search.type = req.param('filter');
  }

  db.model('Item').find(search).all(function (results) {
    var returnData = [];

    results.forEach(function (result) {
      returnData.push(result.jsonObject);
    });

    res.header('Content-type', 'application/json');
    res.send(JSON.stringify(returnData));
  });
});

app.post('/items', function (req, res) {
  var url = req.rawBody.split('-------NPRequestBoundary-----')[1].split("\n")[3].trim(),
      name = req.rawBody.split('-------NPRequestBoundary-----')[2].split("\n")[3].trim(),
      bookmark = new(db.model('Item'));

  if (name && url) {
    bookmark.name = name;
    bookmark.type = 'bookmark';
    bookmark.remote_url = url;
    bookmark.uploaded = 1;
    bookmark.save(function () {
      res.header('Content-type', 'application/json');
      res.send(JSON.stringify(bookmark.jsonObject));
    });
  } else {
    res.send(400);
  }
});

app.get('/items/s3', function (req, res) {
  db.model('Item').find({
    key: req.param('key').split('/')[1],
    uploaded: 1
  }).one(function (result) {
    if (result) {
      result.uploaded = 1;
      result.name = req.param('key').split('/').slice(2).join();
      result.remote_url = 'http://' + config.s3.host + '/' + req.param('key');
      result.save(function () {
        res.header('Content-type', 'application/json');
        res.send(JSON.stringify(result.jsonObject));
      })
    } else {
      res.send(404);
    }
  });
});

app.get('/items/new', function (req, res) {
  function ISODateString(d) {
    function pad(n) {
      return n < 10 ? '0' + n : n;
    }
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z'
  }

  var file = new(db.model('Item'));
  file.save(function () {
    var policy = base64.encode(JSON.stringify({
      'expiration': ISODateString(new Date(+new Date() + 600 * 1000)),
      'conditions': [{
        'bucket': config.s3.bucket
      },
      {
        'acl': 'public-read'
      },
      {
        'success_action_redirect': 'http://' + config.adminHost + '/items/s3'
      }, ['starts-with', '$key', 'uploads/' + file.key + '/']]
    }));
    res.header('Content-type', 'application/json');
    res.send(JSON.stringify({
      url: 'http://' + config.s3.host,
      params: {
        AWSAccessKeyId: config.s3.accessKey,
        key: 'uploads/' + file.key + '/${filename}',
        acl: 'public-read',
        success_action_redirect: 'http://' + config.adminHost + '/items/s3',
        signature: sha1.b64_hmac_sha1(config.s3.secretKey, policy),
        policy: policy
      }
    }));
  });
});

app.delete('/items/:key', function (req, res) {
  db.model('Item').find({
    key: req.param('key')
  }).one(function (result) {
    if (result) {
      result.remove();
      if (result.type !== 'bookmark') {
        // TODO delete from s3
      }
      res.send(200);
    } else {
      res.send(404);
    }
  });
});

app.get('/:key', function (req, res) {
  db.model('Item').find({
    key: req.param('key')
  }).one(function (result) {
    if (result) {
      if (result.type === 'bookmark') {
        result.views++;
        result.save();
        res.redirect(result.remoteUrl)
      } else if (result.type) {
        res.render('image.jade', {
          layout: false,
          locals: {
            item: result
          }
        });
      } else {
        res.render('download-file.jade', {
          layout: false,
          locals: {
            item: result
          }
        });
      }
    } else {
      res.send(404);
    }
  });
});

app.get('/:key/content', function (req, res) {
  db.model('Item').find({
    key: req.param('key')
  }).one(function (result) {
    if (result) {
      result.views++;
      result.save();
      res.redirect(result.remoteUrl);
    } else {
      res.send(404);
    }
  });
});


// Only listen on $ node app.js
if (!module.parent) {
  app.listen(80);
  console.log('Express server listening on port %d', app.address().port)
}