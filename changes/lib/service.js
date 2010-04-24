var listener = require('./listener'),
    url = require('url'),
    events = require('events'),
    sys = require('sys'),
    path = require('path'),
    fs = require('fs'),
    http = require('http');

var request = function (uri, method, headers, callback) {
  var uri = url.parse(uri);
  var client = http.createClient(uri.port, uri.hostname);
  var pathname = uri.search ? uri.pathname + uri.search : uri.pathname;
  var request = client.request(method, pathname, headers);
  request.addListener("response", function (response) {
    var buffer = '';
    if (response.statusCode !== 200) {
      callback(new Error("Bad status code."))
    }
    response.setEncoding('utf8');
    response.addListener("data", function(data){buffer += data});
    response.addListener("end", function(){
      obj = JSON.parse(buffer);
      callback(undefined, obj);
    });
  })
  client.addListener("error", function (e) {
    callback(e);
  })
  request.end();
}

var loadModule = function (content, name, callback) {
  var wrapper = "(function (exports, require, module, __filename, __dirname) { "
              + content
              + "\n});";
  var module = {exports:{},id:'changes'}
  self = this;
  setTimeout( function () {
    try {
      var compiledWrapper = process.compile(wrapper, name);
      compiledWrapper.apply(module, [module.exports, require, self]);
      callback(undefined, module.exports);
    } catch (e) {
      callback(e);
    }
  }, 0)
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
      if (doc.id && doc.id.startsWith('_design')) {
        d.designDocChange(dbname, doc.id);
      };
    })
  }

  if (id) {
    d.cleanup(dbname, id);
    request( this.baseurl+dbname+'/'+id, 'GET', {'accept':'application/json'}, function(error, doc) {
      d.handleDesignDoc(d.baseurl, dbname, doc);
    });
  }
}
Deligation.prototype.handleDesignDoc = function (baseurl, dbname, doc) {
  var d = this;
  if (doc.changes) {
    loadModule(doc.changes, dbname+'/'+doc._id+'.changes', function (error, module) {
      if (error) {
        sys.puts('Cannot import changes listener from '+JSON.stringify(doc._id)+' '+JSON.stringify(error));
      } else {
        if (module.init) {
          module.init( baseurl + dbname );
        }

        if (module.listener) {
          d.changes[dbname].addListener("change", module.listener);
        }
        d.modules[dbname+'/'+doc._id] = module;
      }
    })
  }
}
Deligation.prototype.cleanup = function (dbname, id) {
  var d = this;
  var module = d.modules[dbname+'/'+id];
  if (module) {
    if (module.listener) {
      d.changes[dbname].removeListener("change", module.listener)
    }

    if (module.cleanup) {
      module.cleanup();
    }
    delete module
    delete d.modules[dbname+'/'+id];
  }
}

var start = function (baseuri, deligation) {
  if (baseuri[baseuri.length - 1] !== '/') {
    baseuri = baseuri + '/'
  }
  
  if (!deligation) {
    var deligation = new Deligation(baseuri);
  }
  
  var attachAllDbs = function (error, dbs) {
    if (error) {
      throw new Error(error)
    }
    dbs.forEach(function(dbname) {
      if (dbname.indexOf('/') !== -1) {
        // workaround bug in dbs with slashes in the name not having _all_docs
        return;
      } 
      request(baseuri+dbname+'/_all_docs?startkey=%22_design%2F%22&endkey=%22_design0%22', 
              "GET", {'accept':'application/json'}, function (error, ddocs) {
        if (error) {
          throw error;
        }
        if (ddocs.rows.length != 0) {
          // process each design document, and listen for changes
          ddocs.rows.forEach(function(doc) {deligation.designDocChange(dbname, doc.id)})
        } else {
          // listen for a new design document
          deligation.designDocChange(dbname);
        }

      })
    })
    setTimeout(function ()  {
      request(baseuri+'_all_dbs', 'GET', {'accept':'application/json'}, function(error, dbs){
        var newdbs = [];
        dbs.forEach( function(db) {
          if (!deligation.changes[db]) { newdbs.push(db) }
        });
        attachAllDbs(undefined, newdbs);
      })  
    }, 60 * 1000);
  } 
  request(baseuri+'_all_dbs', 'GET', {'accept':'application/json'}, attachAllDbs);
}

exports.start = start;
exports.Deligation = Deligation;
exports.loadModule = loadModule;
exports.request = request

if (require.main == module) {
  var couchdbUrl = process.argv[process.argv.length - 1];
  start(couchdbUrl);
}
