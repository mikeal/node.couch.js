var request = require('request')
  , sys = require('sys')
  , events = require('events')
  , path = require('path')
  , querystring = require('querystring')
  , child = require('child_process')
  ;

var headers = {'content-type':'application/json', 'accept':'application/json'}

function createDatabaseListener (uri, db) {
  if (!db) db = {
      ddocs : {}
    , ids : []
    , onChange: function (change) {
      db.seq = change.seq;
      if (change.id && change.id.slice(0, '_design/'.length) === '_design/') {
        db.onDesignDoc(change.doc);
      } 
      db.ids.forEach(function (id) {
        db.ddocs[id]._changes_process().stdin.write(JSON.stringify(["change", change])+'\n');
      })
    }
    , onDesignDoc: function (doc) {
      sys.puts(doc._id)
      if (db.ddocs[doc._id] && db.ddocs[doc._id].changes) {
        // take down the process
        sys.puts("Stopping process for "+doc._id);
        db.ddocs[doc._id]._changes_process().kill();
        db.ids.splice(db.ids.indexOf(doc._id),1)
      }
      
      if (doc._deleted) {
        delete db.ddocs[doc._id];
      } else {
        db.ddocs[doc._id] = doc;
        if (doc.changes) {
          // start up the process
          sys.puts("Starting process for "+doc._id)
          var p = child.spawn(process.execPath, [path.join(__dirname, 'child.js')]);
          p.stderr.on("data", function (chunk) {sys.error(chunk.toString())})
          p.stdin.write(JSON.stringify(["ddoc", doc])+'\n');
          db.ddocs[doc._id]._changes_process = function(){return p};
          db.ids.push(doc._id)
        }
      }
    }
  };
  
  var changesStream = new events.EventEmitter();
  changesStream.write = function (chunk) {
    var line;
    changesStream.buffer += chunk.toString();
    while (changesStream.buffer.indexOf('\n') !== -1) {
      line = chunk.slice(0, changesStream.buffer.indexOf('\n'));
      if (line.length > 1) db.onChange(JSON.parse(line));
      changesStream.buffer = changesStream.buffer.slice(changesStream.buffer.indexOf('\n') + 1)
    }
  };
  changesStream.end = function () {createDatabaseListener(uri, db)};
  changesStream.buffer = '';
  request({uri:uri, headers:headers}, function (error, resp, body) {
    
    var qs;
    if (error) throw error;
    if (resp.statusCode > 299) throw new Error("Response error "+sys.inspect(resp)+'\n'+body);
    if (!db.seq) db.seq = JSON.parse(body).update_seq
    qs = querystring.stringify({include_docs: "true", feed: 'continuous', since: db.seq})
    request({uri:uri+'/_changes?'+qs, responseBodyStream:changesStream}, function (err, resp, body) {
      sys.debug("FUCK")
    });
    request({uri:uri+'/_all_docs?startkey=%22_design%2F%22&endkey=%22_design0%22&include_docs=true'}, 
      function (err, resp, body) {
        if (err) throw err;
        if (resp.statusCode > 299) throw new Error("Response error "+sys.inspect(resp)+'\n'+body);
        JSON.parse(body).rows.forEach(function (row) {
          if (!db.ddocs[row.id]) db.onDesignDoc(row.doc);
        });
    })
  })
  
  return db
}
  
function createService (uri, interval) {
  if (uri[uri.length - 1] !== '/') uri += '/';
  var dbs = {};
  var service = {};
  
  var setup = function () {
    var starttime = new Date();
    request({uri:uri+'_all_dbs', headers:headers}, function (error, resp, body) {
      if (error) throw error;
      if (resp.statusCode > 299) throw new Error("Response error "+sys.inspect(resp)+'\n'+body)
      JSON.parse(body).forEach(function (db) {
        if (!dbs[db]) {
          dbs[db] = createDatabaseListener(uri+db);
          if (service.onDatabase) server.onDatabase(db, dbs[db])
        }
      })
      var endtime = new Date();
      setTimeout(setup, interval ? interval : (((endtime - starttime) * 5) + 1000));
    })
  }
  setup();
  
  return service;
}

if (require.main == module) {
  var uri = process.argv[process.argv.length - 1];
  sys.puts('Finding changes listeners on '+uri)
  createService(uri);
}