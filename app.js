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
    sys = require('sys');    

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
      return {
        'href': this.adminUrl,
        'name': this.name,
        'url': this.playerUrl,
        'content_url': this.contentUrl,
        'item_type': this.type,
        'view_counter': this.views,
        'icon': this.icon,
        'remote_url': this.s3_url,
        'created_at': this.created_at.toString(),
        'updated_at': this.updated_at.toString()
      }
    }
  },

  methods: {
    save: function(fn){
      if (this.isNew) {
        this.created_at = new Date();
      }
      this.updated_at = new Date();
      this.__super__(fn);
    }
  },
});

// Configuration

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.use(express.bodyDecoder());
  app.use(express.methodOverride());
  app.use(express.compiler({ src: __dirname + '/public', enable: ['less'] }));
  app.use(app.router);
  app.use(express.staticProvider(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
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
  db.model('Item').find().all(function (results) {
    var returnData = [];
    
    results.forEach(function (result) {
      returnData.push(result.jsonObject);
    });
    
    res.header('Content-type', 'application/json');
    res.send(JSON.stringify(returnData));
  });
});

app.post('/items', function (req, res){
    res.send('create bookmark');
});

app.get('/items/new', function (req, res){
    res.send('new item data');
});

app.delete('/items', function (req, res){
    res.send('get data');
});

app.get('/items', function (req, res){
    res.send('get data');
});

app.get('/:key', function (req, res){
  db.model('Item').find({key: req.param('key')}).one(function (result) {
    if (result) {
      if (result.type === 'bookmark') {
        req.redirect(result.remote_url)
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