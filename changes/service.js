var listener = require('./listener'),
    url = require('url'),
    events = require('events'),
    sys = require('sys'),
    path = require('path'),
    posix = require('posix'),
    http = require('http');

var loadModule = function (content, name) {
  var p = new events.Promise();
  var wrapper = "(function (exports, require, module, __filename, __dirname) { "
              + content
              + "\n});";
  var exports = {};
  self = this;
  setTimeout( function () {
    try {
      var compiledWrapper = process.compile(wrapper, name);
      compiledWrapper.apply(exports, [exports, require, self]);
      p.emitSuccess(exports);
    } catch (e) {
      p.emitError(e)
    }
  }, 0)
  return p;
}

var alldbs = function (port, hostname, pathname) {
  var p = new events.Promise();
  var client = http.createClient(port, hostname);
  var request = client.request('GET', pathname + '_all_dbs', {'accept':'application/json'});
  request.finish(function(response){
    var buffer = '';
    response.addListener("body", function(data){buffer += data});
    response.addListener("complete", function(){
      dbs = JSON.parse(buffer);
      p.emitSuccess(dbs);
    })
  })
  return p
}

var getDesignDoc = function (baseurl, dbname, id) {
  var p = new events.Promise();
  var uri = url.parse(baseurl);
  var client = http.createClient(uri.port, uri.hostname)
  var request = client.request('GET', '/'+dbname+'/'+id, {'accept':'application/json'});
  request.finish(function(response){
    var buffer = '';
    response.addListener("body", function(data){buffer += data});
    response.addListener("complete", function(){
      dbs = JSON.parse(buffer);
      p.emitSuccess(dbs);
    })
  })
  return p;
}

var Deligation = function (baseurl) {
  if (baseurl[baseurl.length - 1] != '/') {
    baseurl += '/';
  }
  this.baseurl = baseurl;
  this.modules = {};
  this.changes = {};
}
Deligation.prototype.designDocChange = function (dbname, id) {
  var d = this;
  if (!this.changes[dbname]) {
    this.changes[dbname] = new listener.Changes(this.baseurl+dbname);
    this.changes[dbname].addListener("change", function(doc) {
      if (doc.id.startsWith('_design')) {
        d.designDocChange(dbname, doc.id);
      };
    })
  }
  
  var module = d.modules[dbname+'/'+id];  
  if ( module ) {
    if (module.listener) {
      d.changes[dbname].removeListener("change", module.listener)
    }
    delete module
    delete d.modules[dbname+'/'+id];
  }
  getDesignDoc(this.baseurl, dbname, id).addCallback(function(doc){
    d.handleDesignDoc(dbname, doc);
  });
}
Deligation.prototype.handleDesignDoc = function (dbname, doc) {
  var d = this;
  if (doc.changes) {
    loadModule(doc.changes, dbname+'/'+doc._id+'.changes')
      .addCallback(function(module) {
        if (module.listener) {
          d.changes[dbname].addListener("change", module.listener);
        }
        d.modules[dbname+'/'+doc._id] = module;
      })
      .addErrback(function() {
        sys.puts('Cannot import changes listener from '+JSON.stringify(doc._id));
      })
  }
}

var getDesignDocs = function (port, hostname, dbpath) {
  var p = new events.Promise();
  var client = http.createClient(port, hostname);
  var ddocpath = dbpath+'/_all_docs?startkey=%22_design%2F%22&endkey=%22_design0%22';
  var request = client.request('GET', ddocpath, {'accept':'application/json'});
  request.finish(function(response) {
    var buffer = '';
    response.addListener("body", function(data){buffer += data});
    response.addListener("complete", function(){
      resp = JSON.parse(buffer);
      docs = [];
      resp.rows.forEach(function(doc) {docs.push(doc)})
      p.emitSuccess(docs);
    })  
  })
  return p;
}

var inArray = function (array, obj) {
  for (i = 0; i < array.length; i+=1) {
    if (array[i] == obj) {
      return true;
    }
  }
  return false;
}

var start = function (couchdbUrl, deligation) {
  var pathname = couchdbUrl.pathname || '/';
  if (pathname[pathname.length - 1] != '/') {
    pathname += '/';
  }
  var href = couchdbUrl.href;
  if (href[href.length - 1] != '/') {
    href += '/';
  }
  
  finished = [];
  if (!deligation) {
    var deligation = new Deligation(href);
  }
  
  var attachAllDbs = function (dbs) {
    dbs.forEach(function(dbname) {
      getDesignDocs(couchdbUrl.port, couchdbUrl.hostname, pathname+dbname)
        .addCallback(function(docs) {
          if (docs.length != 0) {
            docs.forEach(function(doc) {deligation.designDocChange(dbname, doc.id)})
          } 
          finished.push(dbname);
          if (finished.length == dbs.length) {
            setInterval(function ()  {
              alldbs(couchdbUrl.port, couchdbUrl.hostname, pathname).addCallback(function(dbs) {
                  var newdbs = [];
                  dbs.forEach( function(db) {
                    if (!deligation.changes[db]) { newdbs.push(db) }
                  });
                  attachAllDbs(newdbs);
              })  
            }, 60 * 1000);
          }
        })
    })
  }  
      
  alldbs(couchdbUrl.port, couchdbUrl.hostname, pathname).addCallback(attachAllDbs)
}

exports.start = start;
exports.Deligation = Deligation;
exports.alldbs = alldbs;
exports.loadModule = loadModule;
exports.getDesignDoc = getDesignDoc;

if (inArray(process.argv, __filename) && process.argv[process.argv.length - 1].startsWith('http')) {
  var couchdbUrl = url.parse(process.argv[process.argv.length - 1]);
  start(couchdbUrl);
}