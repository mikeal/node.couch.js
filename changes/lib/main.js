var request = require('request')
  , sys = require('sys')
  , events = require('events')
  , querystring = require('querystring')
  ;

var headers = {'content-type':'application/json', 'accept':'application/json'}

function createDatabaseListener (uri, db) {
  if (!db) db = {
    ddocs : {}
    , onChange: function (change) {
      db.seq = change.seq;
      if (change.doc.slice(0, '_design/'.length) === '_design/') {
        db.onDesignDoc(change.doc);
      }
    }
    , onDesignDoc: function (doc) {
      sys.puts(doc._id)
      if (db.ddocs[doc._id] && db.ddocs[doc._id].changes) {
        // take down the process
      }
      
      if (doc._deleted) {
        delete db.ddocs[doc._id];
      } else {
        db.ddocs[doc._id] = doc;
        if (doc.changes) {
          // start up the process
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
      changesStream.buffer = changesStream.buffer.slice(changesStream.buffer.indexOf('\n'))
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