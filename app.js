var config = {
  raincloudHost: 'cl.ly',
  adminHost: 'my.cl.ly',
  mongo: {
    host: 'localhost',
    database: 'raincloud'
  }
}

/**
 * Module dependencies.
 */

var express = require('express'),
    app = module.exports = express.createServer();
    mongoose = require('mongoose').Mongoose,
    db = mongoose.connect('mongodb://' + config.mongo.host + '/' + config.mongo.database),
    sys = require('sys'),
    multipart = require('multipart');  

mongoose.model('Item', {
  properties: ['key', 'name', 'type', 'views', 'remote_url', 'created_at', 'updated_at'],
  cast: {
    views: Number,
    created_at: Date,
    updated_at: Date
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
    save: function(fn){
      if (this.isNew) {
        this.created_at = new Date();
        this.views = 0;
      }
      this.updated_at = new Date();
      this.__super__(fn);
    }
  },
});

// Configuration

app.configure(function (){
  app.set('views', __dirname + '/views');
  app.use(express.bodyDecoder());
  app.use(express.methodOverride());
  app.use(express.compiler({ src: __dirname + '/public', enable: ['less'] }));
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
  app.use(express.logger()); 
});

app.configure('development', function (){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function (){
  app.use(express.errorHandler()); 
});

// Routes

app.get('/', function(req, res){
  res.render('index.jade', {
    locals: {
        title: 'Express'
    }
  });
});

app.get('/items', function (req, res) {
  var search = req.param('filter') ? {type: req.param('filter')} : {};
  db.model('Item').find(search).all(function (results) {
    var returnData = [];
    
    results.forEach(function (result) {
      returnData.push(result.jsonObject);
    });
    
    res.header('Content-type', 'application/json');
    res.send(JSON.stringify(returnData));
  });
});

app.post('/items', function (req, res){
  var url = req.rawBody.split('-------NPRequestBoundary-----')[1].split("\n")[3].trim(),
      name = req.rawBody.split('-------NPRequestBoundary-----')[2].split("\n")[3].trim(),
      bookmark = new (db.model('Item'));

  if (name && url) {
    bookmark.name = name;
    bookmark.key = (Math.random() + '').substr(3);
    bookmark.type = 'bookmark';
    bookmark.remote_url = url;
    bookmark.save(function () {
      res.header('Content-type', 'application/json');
      res.send(JSON.stringify(bookmark.jsonObject)));
    });
  } else {
    res.send(400);    
  }
});

app.get('/items/new', function (req, res){
    res.send('new item data');
});

app.delete('/items/:key', function (req, res){
    db.model('Item').find({key: req.param('key')}).one(function (result) {
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

app.get('/items', function (req, res){
    res.send('get data');
});

app.get('/:key', function (req, res){
  db.model('Item').find({key: req.param('key')}).one(function (result) {
    if (result) {
      if (result.type === 'bookmark') {
        result.views++;
        result.save();
        res.redirect(result.remoteUrl)
      } else {
        res.render(result.type + '.jade', {
          layout: 'player',
          locals: {
            item: result,
            title: result.name + ' - Raincloud'
          }
        });
      }
    } else {
      res.send(404);
    }
  });
});

app.get('/:key/content', function (req, res){
  db.model('Item').find({key: req.param('key')}).one(function (result) {
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