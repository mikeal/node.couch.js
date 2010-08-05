var listener = require('../changes/listener'),
    changeService = require('../changes/service'),
    url = require('url'),
    sys = require('sys');

var ExternalDeligation = function (baseurl) {
  if (baseurl[baseurl.length - 1] != '/') {
    baseurl += '/';
  }
  this.baseurl = baseurl;
  this.modules = {};
  this.changes = {};
  this.test = 'asdf';
}
sys.inherits(ExternalDeligation, changeService.Deligation);
ExternalDeligation.prototype.handleDesignDoc = function (dbname, doc) {
  var d = this;
  if (doc.externals) {
    d.modules[dname][doc._id] = {}
    for (name in doc.externals) {
      loadModule(doc.externals[name], dbname+'/'+doc._id+'.external.'+name) 
        .addCallback(function(module) {
          d.modules[dname][doc._id][name](module);
        })
        .addErrback(function(){
          sys.puts('Cannot import module from '+JSON.stringify(doc._id)+'.external.'+name);
        });
    }
  }
}
ExternalDeligation.prototype.cleanup = function (dbname, id) {
  if (this.modules[dbname] && this.modules[dbname][id]) {
    delete this.modules[dbname][id];
  }
  
}

var start = function (uri) {
  var deligation = new ExternalDeligation(uri);
  changeService.start(url.parse(uri), deligation);
  return deligation;
}

var ejsgipath = '/Users/mikeal/Documents/git/ejsgi/lib/ejsgi';
var ejsgi = require(ejsgipath);

buffer = ''
var dataHandler = function (data, callback) {
  if (data.indexOf('\n')) {
    var chunks = data.split('\n');
    if (buffer) {
      chunks[0] = buffer + chunks[0];
      buffer = null;
    }
  } else {
    if (buffer) {
      data = buffer + data;
      buffer = null;
    }
    var chunks = [data];
  }
  for (i = 0; i < chunks.length; i += 1) {
    var chunk = chunks[i];
    if (chunk) {
      try {
        var obj = JSON.parse(chunk);
      } catch(e) {
        if (i != (chunks.length -1)) {
          throw "For some reason I think this is a chunk "+chunk;
        } else {
          buffer = chunk;
        } 
      }
      if (obj) { callback(obj); }
    } 
  }
}

var application = function (obj, deligation) {
  // sys.puts(JSON.stringify({code:200,json:obj}))
  var req = new EventEmitter();
  var res = new EventEmitter();
  
  req.headers = obj.headers;
  
  var request new ejsgi.Request(req, res, 'localhost', 5984, null, false);
  if (obj.body && obj.body != "undefined") {
    req.emit("body", obj.body)
  }
  
}

if (require.main === module && process.argv[process.argv.length - 1].startsWith('http')) {
  var deligation = start(process.argv[process.argv.length - 1]);
  
  process.stdio.addListener("data", function(data) {
    dataHandler(data, function(obj) {
      application(obj, deligation);
    })
  });
  process.stdio.open();
}
